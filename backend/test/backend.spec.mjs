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
});
