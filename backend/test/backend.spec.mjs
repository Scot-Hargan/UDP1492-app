import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function requestJson(pathname, options = {}) {
  const request = new Request(`https://managed.example.test${pathname}`, options);
  const response = await exports.default.fetch(request);
  const payload = await readJson(response);
  return { response, payload };
}

async function openSession(displayName, options = {}) {
  const { response, payload } = await requestJson("/api/session/open", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      displayName,
      mode: "managed",
      clientVersion: "backend-test",
      ...options
    })
  });
  expect(response.status).toBe(200);
  expect(payload.identity.displayName).toBe(displayName);
  expect(payload.identity.sessionId).toMatch(/^ses_/);
  return payload;
}

async function requestAdminChannel(action, body) {
  return requestJson(`/api/admin/channels/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

describe("1492 backend core managed API", () => {
  it("opens a session and lists the seeded channels", async () => {
    const opened = await openSession("Scot");
    const { response, payload } = await requestJson(
      `/api/channels?sessionId=${encodeURIComponent(opened.identity.sessionId)}`
    );

    expect(response.status).toBe(200);
    expect(payload.channels).toHaveLength(2);
    expect(payload.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelId: "chn_alpha",
          name: "Alpha",
          securityMode: "open",
          requiresPasscode: false
        }),
        expect.objectContaining({
          channelId: "chn_bravo",
          name: "Bravo",
          securityMode: "passcode",
          requiresPasscode: true
        })
      ])
    );
  });

  it("supports session resume by reusing the provided resumeSessionId", async () => {
    const opened = await openSession("Scot");
    const { response, payload } = await requestJson("/api/session/open", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        displayName: "Scot Two",
        mode: "managed",
        clientVersion: "backend-test",
        resumeSessionId: opened.identity.sessionId
      })
    });

    expect(response.status).toBe(200);
    expect(payload.identity.sessionId).toBe(opened.identity.sessionId);
    expect(payload.identity.displayName).toBe("Scot Two");
  });

  it("assigns operator access to the first active session and exposes admin summaries as read-only for members", async () => {
    await sleep(3200);

    const operator = await openSession("Operator One", {
      requestedUserId: "usr_operator_one"
    });
    const member = await openSession("Member One", {
      requestedUserId: "usr_member_one"
    });

    expect(operator.identity.role).toBe("operator");
    expect(member.identity.role).toBe("member");

    const summary = await requestJson(
      `/api/admin/summary?sessionId=${encodeURIComponent(operator.identity.sessionId)}`
    );
    expect(summary.response.status).toBe(200);
    expect(summary.payload.viewer).toMatchObject({
      sessionId: operator.identity.sessionId,
      userId: "usr_operator_one",
      role: "operator"
    });
    expect(summary.payload.permissions).toMatchObject({
      canReadAdminSummary: true,
      canManageChannels: true,
      canManagePasscodes: true
    });

    const memberSummary = await requestJson(
      `/api/admin/summary?sessionId=${encodeURIComponent(member.identity.sessionId)}`
    );
    expect(memberSummary.response.status).toBe(200);
    expect(memberSummary.payload.viewer).toMatchObject({
      sessionId: member.identity.sessionId,
      userId: "usr_member_one",
      role: "member"
    });
    expect(memberSummary.payload.permissions).toMatchObject({
      canReadAdminSummary: true,
      canManageChannels: false,
      canManagePasscodes: false
    });
  });

  it("lets an operator create, update, and delete a managed channel while members are forbidden", async () => {
    await sleep(3200);

    const operator = await openSession("Directory Operator", {
      requestedUserId: "usr_directory_operator"
    });
    const member = await openSession("Directory Member", {
      requestedUserId: "usr_directory_member"
    });

    const forbiddenCreate = await requestAdminChannel("create", {
      sessionId: member.identity.sessionId,
      channelId: "chn_member_forbidden",
      name: "Forbidden",
      description: "Should not work",
      note: "",
      securityMode: "open",
      concurrentAccessAllowed: true
    });
    expect(forbiddenCreate.response.status).toBe(403);
    expect(forbiddenCreate.payload.code).toBe("managed_admin_forbidden");

    const created = await requestAdminChannel("create", {
      sessionId: operator.identity.sessionId,
      channelId: "chn_ops_create",
      name: "Ops Create",
      description: "Created by operator",
      note: "Initial note",
      securityMode: "open",
      concurrentAccessAllowed: false
    });
    expect(created.response.status).toBe(201);
    expect(created.payload.channel).toMatchObject({
      channelId: "chn_ops_create",
      name: "Ops Create",
      description: "Created by operator",
      note: "Initial note",
      securityMode: "open",
      requiresPasscode: false,
      concurrentAccessAllowed: false
    });

    const updated = await requestAdminChannel("update", {
      sessionId: operator.identity.sessionId,
      channelId: "chn_ops_create",
      name: "Ops Updated",
      description: "Updated by operator",
      note: "Updated note",
      securityMode: "open",
      concurrentAccessAllowed: true
    });
    expect(updated.response.status).toBe(200);
    expect(updated.payload.channel).toMatchObject({
      channelId: "chn_ops_create",
      name: "Ops Updated",
      description: "Updated by operator",
      note: "Updated note",
      securityMode: "open",
      requiresPasscode: false,
      concurrentAccessAllowed: true
    });

    const listed = await requestJson(
      `/api/channels?sessionId=${encodeURIComponent(operator.identity.sessionId)}`
    );
    expect(listed.response.status).toBe(200);
    expect(listed.payload.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelId: "chn_ops_create",
          name: "Ops Updated"
        })
      ])
    );

    const deleted = await requestAdminChannel("delete", {
      sessionId: operator.identity.sessionId,
      channelId: "chn_ops_create"
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload).toMatchObject({
      deleted: true,
      channelId: "chn_ops_create"
    });
  }, 15000);

  it("creates protected channels without exposing plaintext storage and enforces their passcodes on join", async () => {
    await sleep(3200);

    const operator = await openSession("Protected Operator", {
      requestedUserId: "usr_protected_operator"
    });

    const created = await requestAdminChannel("create", {
      sessionId: operator.identity.sessionId,
      channelId: "chn_protected_ops",
      name: "Protected Ops",
      description: "Protected operator-managed channel",
      note: "hashed secret",
      securityMode: "passcode",
      passcode: "ops-secret",
      concurrentAccessAllowed: true
    });
    expect(created.response.status).toBe(201);
    expect(created.payload.channel).toMatchObject({
      channelId: "chn_protected_ops",
      securityMode: "passcode",
      requiresPasscode: true
    });
    expect(created.payload.channel).not.toHaveProperty("passcode");

    const listed = await requestJson(
      `/api/channels?sessionId=${encodeURIComponent(operator.identity.sessionId)}`
    );
    expect(listed.response.status).toBe(200);
    const protectedChannel = listed.payload.channels.find((channel) => channel.channelId === "chn_protected_ops");
    expect(protectedChannel).toMatchObject({
      channelId: "chn_protected_ops",
      requiresPasscode: true,
      securityMode: "passcode"
    });
    expect(protectedChannel).not.toHaveProperty("passcode");

    const missing = await requestJson("/api/channels/chn_protected_ops/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: operator.identity.sessionId,
        slotId: "A",
        passcode: null
      })
    });
    expect(missing.response.status).toBe(403);
    expect(missing.payload.code).toBe("managed_passcode_required");

    const wrong = await requestJson("/api/channels/chn_protected_ops/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: operator.identity.sessionId,
        slotId: "A",
        passcode: "wrong-secret"
      })
    });
    expect(wrong.response.status).toBe(403);
    expect(wrong.payload.code).toBe("managed_passcode_invalid");

    const joined = await requestJson("/api/channels/chn_protected_ops/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: operator.identity.sessionId,
        slotId: "A",
        passcode: "ops-secret"
      })
    });
    expect(joined.response.status).toBe(200);
    expect(joined.payload.membership).toMatchObject({
      channelId: "chn_protected_ops",
      membershipState: "joined"
    });

    const left = await requestJson("/api/channels/chn_protected_ops/leave", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: operator.identity.sessionId,
        slotId: "A"
      })
    });
    expect(left.response.status).toBe(200);

    const deleted = await requestAdminChannel("delete", {
      sessionId: operator.identity.sessionId,
      channelId: "chn_protected_ops"
    });
    expect(deleted.response.status).toBe(200);
  }, 15000);

  it("refuses to delete channels that still have active members", async () => {
    await sleep(3200);

    const operator = await openSession("Delete Guard Operator", {
      requestedUserId: "usr_delete_guard_operator"
    });

    const created = await requestAdminChannel("create", {
      sessionId: operator.identity.sessionId,
      channelId: "chn_delete_guard",
      name: "Delete Guard",
      description: "Delete guard test",
      note: "",
      securityMode: "open",
      concurrentAccessAllowed: true
    });
    expect(created.response.status).toBe(201);

    const joined = await requestJson("/api/channels/chn_delete_guard/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: operator.identity.sessionId,
        slotId: "A",
        passcode: null
      })
    });
    expect(joined.response.status).toBe(200);

    const deniedDelete = await requestAdminChannel("delete", {
      sessionId: operator.identity.sessionId,
      channelId: "chn_delete_guard"
    });
    expect(deniedDelete.response.status).toBe(409);
    expect(deniedDelete.payload.code).toBe("managed_channel_delete_active");

    const left = await requestJson("/api/channels/chn_delete_guard/leave", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: operator.identity.sessionId,
        slotId: "A"
      })
    });
    expect(left.response.status).toBe(200);

    const deleted = await requestAdminChannel("delete", {
      sessionId: operator.identity.sessionId,
      channelId: "chn_delete_guard"
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.deleted).toBe(true);
  }, 15000);

  it("enforces protected-channel passcodes", async () => {
    const opened = await openSession("Scot");

    const required = await requestJson("/api/channels/chn_bravo/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: opened.identity.sessionId,
        slotId: "A",
        passcode: null
      })
    });
    expect(required.response.status).toBe(403);
    expect(required.payload.code).toBe("managed_passcode_required");

    const invalid = await requestJson("/api/channels/chn_bravo/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: opened.identity.sessionId,
        slotId: "A",
        passcode: "wrong-secret"
      })
    });
    expect(invalid.response.status).toBe(403);
    expect(invalid.payload.code).toBe("managed_passcode_invalid");

    const joined = await requestJson("/api/channels/chn_bravo/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: opened.identity.sessionId,
        slotId: "A",
        passcode: "alpha-secret"
      })
    });
    expect(joined.response.status).toBe(200);
    expect(joined.payload.membership).toMatchObject({
      channelId: "chn_bravo",
      slotId: "A",
      membershipState: "joined"
    });
    expect(joined.payload.channel).toMatchObject({
      channelId: "chn_bravo",
      requiresPasscode: true
    });
  });

  it("preserves the current slot membership when a protected replacement join is denied", async () => {
    const first = await openSession("Scot");
    const second = await openSession("Peer Two");

    for (const opened of [first, second]) {
      const joinAlpha = await requestJson("/api/channels/chn_alpha/join", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionId: opened.identity.sessionId,
          slotId: "A",
          passcode: null
        })
      });
      expect(joinAlpha.response.status).toBe(200);
    }

    const secondPresence = await requestJson("/api/channels/chn_alpha/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "A",
        onlineState: "online",
        endpoints: [
          {
            kind: "public",
            ip: "198.51.100.13",
            port: 1492
          }
        ]
      })
    });
    expect(secondPresence.response.status).toBe(200);

    const deniedSwitch = await requestJson("/api/channels/chn_bravo/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "A",
        passcode: "wrong-secret"
      })
    });
    expect(deniedSwitch.response.status).toBe(403);
    expect(deniedSwitch.payload.code).toBe("managed_passcode_invalid");

    const peersAfterDeniedSwitch = await requestJson(
      `/api/channels/chn_alpha/peers?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(peersAfterDeniedSwitch.response.status).toBe(200);
    expect(peersAfterDeniedSwitch.payload.peers).toHaveLength(1);
    expect(peersAfterDeniedSwitch.payload.peers[0]).toMatchObject({
      displayName: "Peer Two",
      channelId: "chn_alpha"
    });

    for (const opened of [second, first]) {
      const leaveAlpha = await requestJson("/api/channels/chn_alpha/leave", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionId: opened.identity.sessionId,
          slotId: "A"
        })
      });
      expect(leaveAlpha.response.status).toBe(200);
    }
  });

  it("requires a real join before presence or peer resolution is allowed", async () => {
    const opened = await openSession("Scot");

    const presenceWithoutJoin = await requestJson("/api/channels/chn_alpha/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: opened.identity.sessionId,
        slotId: "A",
        onlineState: "online",
        endpoints: [
          {
            kind: "local",
            ip: "10.0.0.25",
            port: 1492
          }
        ]
      })
    });
    expect(presenceWithoutJoin.response.status).toBe(409);
    expect(presenceWithoutJoin.payload.code).toBe("managed_membership_required");

    const peersWithoutJoin = await requestJson(
      `/api/channels/chn_alpha/peers?sessionId=${encodeURIComponent(opened.identity.sessionId)}`
    );
    expect(peersWithoutJoin.response.status).toBe(409);
    expect(peersWithoutJoin.payload.code).toBe("managed_membership_required");
  });

  it("resolves peers from live presence and removes them after leave", async () => {
    const first = await openSession("Scot");
    const second = await openSession("Peer Two");

    const firstJoin = await requestJson("/api/channels/chn_alpha/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: first.identity.sessionId,
        slotId: "A",
        passcode: null
      })
    });
    expect(firstJoin.response.status).toBe(200);

    const secondJoin = await requestJson("/api/channels/chn_alpha/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "B",
        passcode: null
      })
    });
    expect(secondJoin.response.status).toBe(200);
    expect(secondJoin.payload.channel.memberCount).toBe(2);

    const secondPresence = await requestJson("/api/channels/chn_alpha/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "B",
        onlineState: "online",
        endpoints: [
          {
            kind: "public",
            ip: "198.51.100.10",
            port: 1492
          }
        ]
      })
    });
    expect(secondPresence.response.status).toBe(200);
    expect(secondPresence.payload.registrations).toHaveLength(1);

    const peers = await requestJson(
      `/api/channels/chn_alpha/peers?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(peers.response.status).toBe(200);
    expect(peers.payload.peers).toHaveLength(1);
    expect(peers.payload.peers[0]).toMatchObject({
      displayName: "Peer Two",
      channelId: "chn_alpha",
      connectionState: "idle"
    });
    expect(peers.payload.peers[0].endpoints).toEqual([
      expect.objectContaining({
        kind: "public",
        ip: "198.51.100.10",
        port: 1492,
        registrationState: "ready"
      })
    ]);

    const leave = await requestJson("/api/channels/chn_alpha/leave", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "B"
      })
    });
    expect(leave.response.status).toBe(200);
    expect(leave.payload.membership.membershipState).toBe("none");

    const peersAfterLeave = await requestJson(
      `/api/channels/chn_alpha/peers?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(peersAfterLeave.response.status).toBe(200);
    expect(peersAfterLeave.payload.peers).toHaveLength(0);
  });

  it("moves slot ownership to the replacement channel immediately after a successful switch", async () => {
    const first = await openSession("Scot");
    const second = await openSession("Peer Two");

    for (const opened of [first, second]) {
      const joinAlpha = await requestJson("/api/channels/chn_alpha/join", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionId: opened.identity.sessionId,
          slotId: "A",
          passcode: null
        })
      });
      expect(joinAlpha.response.status).toBe(200);
    }

    const secondPresence = await requestJson("/api/channels/chn_alpha/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "A",
        onlineState: "online",
        endpoints: [
          {
            kind: "public",
            ip: "198.51.100.10",
            port: 1492
          }
        ]
      })
    });
    expect(secondPresence.response.status).toBe(200);

    const initialPeers = await requestJson(
      `/api/channels/chn_alpha/peers?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(initialPeers.response.status).toBe(200);
    expect(initialPeers.payload.peers).toHaveLength(1);

    const switched = await requestJson("/api/channels/chn_bravo/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "A",
        passcode: "alpha-secret"
      })
    });
    expect(switched.response.status).toBe(200);

    const oldChannelPeers = await requestJson(
      `/api/channels/chn_alpha/peers?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(oldChannelPeers.response.status).toBe(200);
    expect(oldChannelPeers.payload.peers).toHaveLength(0);
  });

  it("expires idle sessions after the configured TTL", async () => {
    const opened = await openSession("Scot");

    await sleep(3200);

    const channels = await requestJson(
      `/api/channels?sessionId=${encodeURIComponent(opened.identity.sessionId)}`
    );
    expect(channels.response.status).toBe(401);
    expect(channels.payload.code).toBe("managed_session_expired");
  });

  it("allows late leave cleanup after the session has already expired", async () => {
    const opened = await openSession("Scot");

    const joined = await requestJson("/api/channels/chn_alpha/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: opened.identity.sessionId,
        slotId: "A",
        passcode: null
      })
    });
    expect(joined.response.status).toBe(200);

    await sleep(3200);

    const lateLeave = await requestJson("/api/channels/chn_alpha/leave", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: opened.identity.sessionId,
        slotId: "A"
      })
    });
    expect(lateLeave.response.status).toBe(200);
    expect(lateLeave.payload.membership).toMatchObject({
      channelId: "chn_alpha",
      slotId: "A",
      membershipState: "none"
    });
  });

  it("drops stale peers after the configured presence timeout while active members stay visible", async () => {
    const first = await openSession("Scot");
    const second = await openSession("Peer Two");

    for (const opened of [first, second]) {
      const joinAlpha = await requestJson("/api/channels/chn_alpha/join", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionId: opened.identity.sessionId,
          slotId: "A",
          passcode: null
        })
      });
      expect(joinAlpha.response.status).toBe(200);
    }

    const firstPresence = await requestJson("/api/channels/chn_alpha/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: first.identity.sessionId,
        slotId: "A",
        onlineState: "online",
        endpoints: [
          {
            kind: "public",
            ip: "198.51.100.11",
            port: 1492
          }
        ]
      })
    });
    expect(firstPresence.response.status).toBe(200);

    const secondPresence = await requestJson("/api/channels/chn_alpha/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "A",
        onlineState: "online",
        endpoints: [
          {
            kind: "public",
            ip: "198.51.100.12",
            port: 1492
          }
        ]
      })
    });
    expect(secondPresence.response.status).toBe(200);

    const initialPeers = await requestJson(
      `/api/channels/chn_alpha/peers?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(initialPeers.response.status).toBe(200);
    expect(initialPeers.payload.peers).toHaveLength(1);

    await sleep(1600);

    const keepAlive = await requestJson("/api/channels/chn_alpha/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: first.identity.sessionId,
        slotId: "A",
        onlineState: "online",
        endpoints: [
          {
            kind: "public",
            ip: "198.51.100.11",
            port: 1492
          }
        ]
      })
    });
    expect(keepAlive.response.status).toBe(200);

    await sleep(1200);

    const peersAfterTimeout = await requestJson(
      `/api/channels/chn_alpha/peers?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(peersAfterTimeout.response.status).toBe(200);
    expect(peersAfterTimeout.payload.peers).toHaveLength(0);
  });

  it("reports channel member counts correctly across join, replacement join, and leave", async () => {
    const first = await openSession("Scot");
    const second = await openSession("Peer Two");

    const initialChannels = await requestJson(
      `/api/channels?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(initialChannels.response.status).toBe(200);
    const initialAlphaCount = Number(
      initialChannels.payload.channels.find((channel) => channel.channelId === "chn_alpha")?.memberCount
    ) || 0;
    const initialBravoCount = Number(
      initialChannels.payload.channels.find((channel) => channel.channelId === "chn_bravo")?.memberCount
    ) || 0;

    const firstJoinAlpha = await requestJson("/api/channels/chn_alpha/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: first.identity.sessionId,
        slotId: "A",
        passcode: null
      })
    });
    expect(firstJoinAlpha.response.status).toBe(200);
    expect(firstJoinAlpha.payload.channel.memberCount).toBe(initialAlphaCount + 1);

    const secondJoinAlpha = await requestJson("/api/channels/chn_alpha/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "A",
        passcode: null
      })
    });
    expect(secondJoinAlpha.response.status).toBe(200);
    expect(secondJoinAlpha.payload.channel.memberCount).toBe(initialAlphaCount + 2);

    const afterTwoJoinAlpha = await requestJson(
      `/api/channels?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(afterTwoJoinAlpha.response.status).toBe(200);
    expect(afterTwoJoinAlpha.payload.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channelId: "chn_alpha", memberCount: initialAlphaCount + 2 }),
        expect.objectContaining({ channelId: "chn_bravo", memberCount: initialBravoCount })
      ])
    );

    const secondSwitchBravo = await requestJson("/api/channels/chn_bravo/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "A",
        passcode: "alpha-secret"
      })
    });
    expect(secondSwitchBravo.response.status).toBe(200);
    expect(secondSwitchBravo.payload.channel.memberCount).toBe(initialBravoCount + 1);

    const afterReplacementJoin = await requestJson(
      `/api/channels?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(afterReplacementJoin.response.status).toBe(200);
    expect(afterReplacementJoin.payload.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channelId: "chn_alpha", memberCount: initialAlphaCount + 1 }),
        expect.objectContaining({ channelId: "chn_bravo", memberCount: initialBravoCount + 1 })
      ])
    );

    const secondLeaveBravo = await requestJson("/api/channels/chn_bravo/leave", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: second.identity.sessionId,
        slotId: "A"
      })
    });
    expect(secondLeaveBravo.response.status).toBe(200);

    const afterLeave = await requestJson(
      `/api/channels?sessionId=${encodeURIComponent(first.identity.sessionId)}`
    );
    expect(afterLeave.response.status).toBe(200);
    expect(afterLeave.payload.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channelId: "chn_alpha", memberCount: initialAlphaCount + 1 }),
        expect.objectContaining({ channelId: "chn_bravo", memberCount: initialBravoCount })
      ])
    );
  });

  it("reports backend-authored admin summary facts for live sessions, memberships, and endpoints", async () => {
    await sleep(3200);

    const operator = await openSession("Summary Operator", {
      requestedUserId: "usr_summary_operator"
    });
    const member = await openSession("Summary Member", {
      requestedUserId: "usr_summary_member"
    });

    const operatorJoin = await requestJson("/api/channels/chn_alpha/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: operator.identity.sessionId,
        slotId: "A",
        passcode: null
      })
    });
    expect(operatorJoin.response.status).toBe(200);

    const memberJoin = await requestJson("/api/channels/chn_alpha/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: member.identity.sessionId,
        slotId: "B",
        passcode: null
      })
    });
    expect(memberJoin.response.status).toBe(200);

    const memberPresence = await requestJson("/api/channels/chn_alpha/presence", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: member.identity.sessionId,
        slotId: "B",
        onlineState: "online",
        endpoints: [
          {
            kind: "public",
            ip: "198.51.100.50",
            port: 1492
          }
        ]
      })
    });
    expect(memberPresence.response.status).toBe(200);

    const summary = await requestJson(
      `/api/admin/summary?sessionId=${encodeURIComponent(operator.identity.sessionId)}`
    );
    expect(summary.response.status).toBe(200);
    expect(summary.payload.directory).toMatchObject({
      channelCount: 2,
      protectedChannelCount: 1,
      openChannelCount: 1,
      activeSessionCount: 2,
      activeOperatorSessionCount: 1,
      activeMemberSessionCount: 1,
      joinedSlotCount: 2,
      activeChannelCount: 1,
      activeMemberCount: 2,
      onlineMemberCount: 1,
      readyEndpointCount: 1
    });
    expect(summary.payload.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelId: "chn_alpha",
          memberCount: 2,
          onlineMemberCount: 1,
          readyEndpointCount: 1
        }),
        expect.objectContaining({
          channelId: "chn_bravo",
          memberCount: 0,
          onlineMemberCount: 0,
          readyEndpointCount: 0
        })
      ])
    );

    const memberLeave = await requestJson("/api/channels/chn_alpha/leave", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: member.identity.sessionId,
        slotId: "B"
      })
    });
    expect(memberLeave.response.status).toBe(200);

    const afterLeave = await requestJson(
      `/api/admin/summary?sessionId=${encodeURIComponent(operator.identity.sessionId)}`
    );
    expect(afterLeave.response.status).toBe(200);
    expect(afterLeave.payload.directory).toMatchObject({
      joinedSlotCount: 1,
      activeChannelCount: 1,
      activeMemberCount: 1,
      onlineMemberCount: 0,
      readyEndpointCount: 0
    });
    expect(afterLeave.payload.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelId: "chn_alpha",
          memberCount: 1,
          onlineMemberCount: 0,
          readyEndpointCount: 0
        })
      ])
    );
  });
});
