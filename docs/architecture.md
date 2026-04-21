# 1492-app Architecture

## Read Order

1. `../AI_RULES.md`
2. `../CURRENT_TASK.md`
3. `./architecture.md`
4. `../NEXT_CHAT_HANDOFF.md`

## System Map

| Layer | Primary files | Responsibilities | Must not own |
| --- | --- | --- | --- |
| Native host | `src/host/udp_audio1492_host.js` | UDP sockets, handshake, encryption, transport stats, packet send/receive | channel semantics, permissions, backend logic |
| Electron main | `src/main/main.js` | window lifecycle, storage serialization, runtime config, host child-process lifecycle, quit flow | managed UX state, peer orchestration policy |
| Preload bridge | `src/main/preload.js` | supported IPC surface for renderer | business logic |
| Renderer | `src/renderer/` | app shell, managed/direct mode, admin UI, peer adaptation, NAT/runtime state | direct file I/O, host process control outside preload |
| Cloudflare backend | `backend/src/index.ts` | session issuance, channel catalog, memberships, presence, peer discovery, future admin permissions | media relay, long-term content storage |

## Source Of Truth

| Concern | Authority | Notes |
| --- | --- | --- |
| Durable desktop intent | Electron-backed storage via `src/main/main.js` | `udp1492_app_state_v2`, `udp1492_managed_profile`, and `udp1492_managed_cache` |
| Live managed session facts | Renderer memory | session ID, live memberships, presence freshness, resolved peers, NAT probe state |
| Host process availability | Electron main | renderer must tolerate `host-not-running` and `app-quitting` during teardown |
| Transport state | Native host | connected/validated peer state, ping history, jitter/loss stats |
| Live managed membership TTLs | Cloudflare Durable Objects | channel presence and membership freshness are backend-authored |
| Channel catalog today | `DirectoryDOManagedV2` durable rows plus admin mutation APIs | Seeded defaults still bootstrap the first catalog, but Phase 11 now allows backend-owned create/update/delete flows |

## Lifecycle Flows

### Managed Join Flow

1. Renderer opens or resumes a managed session with `POST /api/session/open`.
2. Renderer fetches channels with `GET /api/channels`.
3. Renderer joins a channel/slot with `POST /api/channels/{channelId}/join`.
4. Renderer ensures the host is running, then sends a `configure` payload through preload.
5. Renderer publishes presence with `POST /api/channels/{channelId}/presence`.
6. Renderer resolves peers with `GET /api/channels/{channelId}/peers`.
7. Renderer adapts resolved endpoints into host peers and keeps heartbeat/peer-refresh timers alive.

### App Teardown Flow

1. Renderer stops emitting useful work and may still have in-flight host sends.
2. Main process receives window close or `before-quit`.
3. `requestAppQuit()` marks `quitRequested`, stops the host bridge, then destroys windows.
4. `udp1492:host-send` returns `app-quitting` or `host-not-running` instead of surfacing an uncaught main-process exception.
5. Main process exits after the host stop promise settles or is forced by the stop timer.

## Preload IPC Contract

All renderer access to main-process and host functionality must go through `window.udp1492`.

### Renderer -> Main invocations

| Preload method | Main channel | Request shape | Result |
| --- | --- | --- | --- |
| `storageGet(keys)` | `udp1492:storage-get` | storage-key list/query payload | object with requested keys |
| `storageSet(values)` | `udp1492:storage-set` | object of key/value pairs | `{ ok: true }` |
| `getRuntimeConfig()` | `udp1492:runtime-config` | none | `{ managedBackendUrl, managedRequestTimeoutMs, managedLocalAddresses, managedStunServerUrls }` |
| `openAdminWindow()` | `udp1492:admin-open` | none | `{ ok: true }` |
| `getAdminState()` | `udp1492:admin-state-get` | none | latest admin snapshot or `null` |
| `requestAdminRefresh(request)` | `udp1492:admin-refresh-request` | renderer-defined refresh request object | `{ ok: true }` |
| `requestAdminAction(request)` | `udp1492:admin-action-request` | renderer-defined admin mutation request object | `{ ok: true }` |
| `startHost()` | `udp1492:host-start` | none | `{ ok: true }` |
| `sendHostMessage(message)` | `udp1492:host-send` | host protocol message object | resolves on `{ ok: true }`, rejects with `host-not-running` or `app-quitting` |
| `stopHost()` | `udp1492:host-stop` | none | `{ ok: true }` after stop settles |

### Renderer -> Main fire-and-forget

| Preload method | Main channel | Payload |
| --- | --- | --- |
| `publishAdminState(snapshot)` | `udp1492:admin-state-publish` | latest renderer-authored admin snapshot |

### Main -> Renderer events

| Preload listener | Event | Payload |
| --- | --- | --- |
| `onAdminState(cb)` | `udp1492:admin-state` | latest admin snapshot |
| `onAdminRefreshRequest(cb)` | `udp1492:admin-refresh-request` | refresh request object |
| `onAdminActionRequest(cb)` | `udp1492:admin-action-request` | admin mutation request object |
| `onHostMessage(cb)` | `udp1492:host-message` | native-host protocol event |
| `onHostDisconnect(cb)` | `udp1492:host-disconnect` | `{ code, signal, ... }` |

### Test-only preload surface

Available only when `UDP1492_TEST_MODE=1`.

| Method | Channel | Purpose |
| --- | --- | --- |
| `udp1492Test.emitHostMessage(message)` | `udp1492:test:host-message` | inject mock host events |
| `udp1492Test.emitHostDisconnect(payload)` | `udp1492:test:host-disconnect` | inject disconnect events |
| `udp1492Test.getSentHostMessages()` | `udp1492:test:host-sent` | inspect mock-host outbound messages |

## Host Protocol Contract

### Renderer/Main -> Host messages

| `type` | Shape | Meaning |
| --- | --- | --- |
| `version` | `{ type: 'version', version }` | handshake/version probe |
| `configure` | `{ type: 'configure', peers, port, deadTime, pingInterval, pingHistoryDuration, statsReportInterval, jitterSamplesCount, encryptionEnabled }` | full runtime configuration update |
| `configure` peer delta | `{ type: 'configure', peers: [{ ...peer, remove?: true }] }` | add/update/remove a peer without rebuilding the full config |
| `sendData` | `{ type: 'sendData', destination?, dataType, data, isBase64, doStats, timestamp }` | transmit encoded media/data to all connected peers or one destination |
| `disconnect` | `{ type: 'disconnect' }` | stop peer communication and exit host process |

Expected peer fields in `configure.peers` include `name`, `ip`, `port`, `sharedKey`, and optional identity fields used by direct mode.

### Host -> Renderer messages

| `type` | Shape | Meaning |
| --- | --- | --- |
| `log` / `info` / `status` | `{ type, message }` | diagnostic text |
| `error` | `{ type: 'error', message, ... }` | host-side error |
| `version` | `{ type: 'version', version }` | host version response |
| `state` | `{ type: 'state', latched, encryptionEnabled }` | host runtime state |
| `receivedata` | `{ type: 'receivedata', peerKey, data, timestamp, dataType }` | received media/data frame |
| `pingHistory` | `{ type: 'pingHistory', peerKey, pingHistory }` | RTT history for one peer |
| `stats` | `{ type: 'stats', peerKey, dataType, stats }` | jitter, out-of-order, duplicate, and loss stats |
| `peerUpdate` | `{ type: 'peerUpdate', key, field, ... }` | peer-specific updates such as `connected`, `validated`, `theirId`, or `myId` |
| `encryption_mismatch` | `{ type: 'encryption_mismatch', localState, remoteState }` | encryption policy mismatch signal |
| disconnect event | emitted separately as `udp1492:host-disconnect` | host process exit notification |

## Managed Backend API Contract

All public endpoints live under `/api`. Error responses use a normalized JSON envelope:

```json
{
  "code": "managed_api_error_code",
  "message": "Human-readable message",
  "details": {}
}
```

### `GET /api/health`

Response:

```json
{
  "status": "ok",
  "service": "1492-backend-dev",
  "storage": "durable-objects-sqlite"
}
```

### `POST /api/session/open`

Request:

```json
{
  "displayName": "Scot",
  "clientVersion": "0.4.23",
  "mode": "managed",
  "requestedUserId": "usr_existing_optional",
  "resumeSessionId": "ses_previous_optional"
}
```

Response:

```json
{
  "identity": {
    "userId": "usr_...",
    "sessionId": "ses_...",
    "displayName": "Scot",
    "role": "operator"
  },
  "session": {
    "openedAt": "2026-04-20T00:00:00.000Z",
    "expiresAt": "2026-04-20T02:00:00.000Z",
    "heartbeatIntervalMs": 15000,
    "permissions": {
      "canReadAdminSummary": true,
      "canManageChannels": true,
      "canManagePasscodes": true
    }
  }
}
```

### `GET /api/channels?sessionId=...`

Response:

```json
{
  "channels": [
    {
      "channelId": "chn_alpha",
      "name": "Alpha",
      "description": "Primary coordination channel",
      "note": "Seeded development channel",
      "securityMode": "open",
      "requiresPasscode": false,
      "concurrentAccessAllowed": true,
      "memberCount": 0
    }
  ],
  "syncedAt": "2026-04-20T00:00:00.000Z"
}
```

### Phase 11 permission model

The currently implemented bounded vocabulary is:

- `operator`
- `member`

Role assignment is intentionally conservative:

- the first active session for the retained operator user becomes `operator`
- subsequent concurrent sessions become `member`
- if the operator session expires, a later session may acquire the operator slot

Permission behavior is:

- all valid managed sessions may read `GET /api/channels`
- all valid managed sessions may read `GET /api/admin/summary`
- only `operator` sessions may call `/api/admin/channels/create`, `/api/admin/channels/update`, or `/api/admin/channels/delete`

Important permission error code:

- `managed_admin_forbidden`

### `GET /api/admin/summary?sessionId=...`

Response:

```json
{
  "viewer": {
    "sessionId": "ses_...",
    "userId": "usr_...",
    "displayName": "Scot",
    "role": "member"
  },
  "permissions": {
    "canReadAdminSummary": true,
    "canManageChannels": false,
    "canManagePasscodes": false
  },
  "directory": {
    "channelCount": 2,
    "protectedChannelCount": 1,
    "openChannelCount": 1,
    "activeSessionCount": 2,
    "activeOperatorSessionCount": 1,
    "activeMemberSessionCount": 1,
    "joinedSlotCount": 1,
    "activeChannelCount": 1,
    "activeMemberCount": 1,
    "onlineMemberCount": 1,
    "readyEndpointCount": 1,
    "sessionTtlMs": 7200000,
    "presenceTtlMs": 45000,
    "observedAt": "2026-04-20T00:00:00.000Z"
  },
  "channels": [
    {
      "channelId": "chn_alpha",
      "name": "Alpha",
      "description": "Primary coordination channel",
      "note": "Seeded development channel",
      "securityMode": "open",
      "requiresPasscode": false,
      "concurrentAccessAllowed": true,
      "memberCount": 1,
      "onlineMemberCount": 1,
      "readyEndpointCount": 1,
      "lastPresenceAt": "2026-04-20T00:00:00.000Z"
    }
  ]
}
```

This endpoint is intentionally readable by members so the desktop admin surface can show backend-authored facts in read-only mode.

### `POST /api/admin/channels/create`

Request:

```json
{
  "sessionId": "ses_...",
  "channelId": "chn_ops",
  "name": "Operations",
  "description": "Operator-managed channel",
  "note": "Optional operator note",
  "securityMode": "passcode",
  "passcode": "rotating-secret",
  "concurrentAccessAllowed": true
}
```

Response:

```json
{
  "channel": {
    "channelId": "chn_ops",
    "name": "Operations",
    "description": "Operator-managed channel",
    "note": "Optional operator note",
    "securityMode": "passcode",
    "requiresPasscode": true,
    "concurrentAccessAllowed": true,
    "memberCount": 0
  }
}
```

Notes:

- only operator sessions may call this endpoint
- plaintext passcodes are accepted only on input and are never returned
- persisted protected-channel secrets are stored server-side as salted one-way hashes

### `POST /api/admin/channels/update`

Request:

```json
{
  "sessionId": "ses_...",
  "channelId": "chn_ops",
  "name": "Operations Updated",
  "description": "Updated operator-managed channel",
  "note": "Updated note",
  "securityMode": "open",
  "passcode": null,
  "concurrentAccessAllowed": false
}
```

Response:

```json
{
  "channel": {
    "channelId": "chn_ops",
    "name": "Operations Updated",
    "description": "Updated operator-managed channel",
    "note": "Updated note",
    "securityMode": "open",
    "requiresPasscode": false,
    "concurrentAccessAllowed": false,
    "memberCount": 0
  }
}
```

Notes:

- only operator sessions may call this endpoint
- protected channels may rotate a passcode by supplying a new plaintext input, which is re-hashed before persistence
- leaving `passcode` empty while keeping `securityMode: "passcode"` preserves the existing stored secret

### `POST /api/admin/channels/delete`

Request:

```json
{
  "sessionId": "ses_...",
  "channelId": "chn_ops"
}
```

Response:

```json
{
  "deleted": true,
  "channelId": "chn_ops"
}
```

Notes:

- only operator sessions may call this endpoint
- delete is guarded when active memberships still target the channel
- current guardrail error code for that case is `managed_channel_delete_active`

### `POST /api/channels/{channelId}/join`

Request:

```json
{
  "sessionId": "ses_...",
  "slotId": "A",
  "passcode": "optional"
}
```

Response:

```json
{
  "membership": {
    "channelId": "chn_alpha",
    "slotId": "A",
    "membershipState": "joined",
    "joinedAt": "2026-04-20T00:00:00.000Z"
  },
  "channel": {
    "channelId": "chn_alpha",
    "name": "Alpha",
    "description": "Primary coordination channel",
    "note": "Seeded development channel",
    "securityMode": "open",
    "requiresPasscode": false,
    "concurrentAccessAllowed": true,
    "memberCount": 1
  }
}
```

Important error codes:

- `managed_passcode_required`
- `managed_passcode_invalid`
- `managed_channel_not_found`

### `POST /api/channels/{channelId}/presence`

Request:

```json
{
  "sessionId": "ses_...",
  "userId": "usr_...",
  "slotId": "A",
  "onlineState": "online",
  "clientVersion": "0.4.23",
  "endpoints": [
    {
      "endpointId": "optional",
      "kind": "local",
      "ip": "192.0.2.10",
      "port": 1492
    }
  ]
}
```

Response:

```json
{
  "presence": {
    "channelId": "chn_alpha",
    "sessionId": "ses_...",
    "onlineState": "online",
    "lastSeenAt": "2026-04-20T00:00:00.000Z"
  },
  "registrations": [
    {
      "endpointId": "end_A_local_192_0_2_10_1492",
      "kind": "local",
      "registrationState": "ready",
      "lastValidatedAt": "2026-04-20T00:00:00.000Z"
    }
  ],
  "nextHeartbeatAt": "2026-04-20T00:00:15.000Z"
}
```

### `GET /api/channels/{channelId}/peers?sessionId=...`

Response:

```json
{
  "channelId": "chn_alpha",
  "peers": [
    {
      "userId": "usr_...",
      "sessionId": "ses_...",
      "channelId": "chn_alpha",
      "displayName": "Peer One",
      "connectionState": "idle",
      "endpoints": [
        {
          "endpointId": "end_A_local_198_51_100_10_1492",
          "kind": "local",
          "ip": "198.51.100.10",
          "port": 1492,
          "registrationState": "ready",
          "lastValidatedAt": "2026-04-20T00:00:00.000Z"
        }
      ]
    }
  ],
  "resolvedAt": "2026-04-20T00:00:00.000Z"
}
```

### `POST /api/channels/{channelId}/leave`

Request:

```json
{
  "sessionId": "ses_...",
  "slotId": "A"
}
```

Response:

```json
{
  "membership": {
    "channelId": "chn_alpha",
    "slotId": "A",
    "membershipState": "none",
    "leftAt": "2026-04-20T00:00:00.000Z"
  }
}
```

## Phase 11 Closeout Rule

Phase 11 is now implemented and documented. The controlling contract for this phase is:

- members may read backend-authored admin summaries but remain read-only
- only operators may mutate channel catalog state or protected-channel secrets
- protected-channel passcodes are stored server-side as salted one-way hashes, not plaintext

## Phase 12 Planning Constraints

Phase 12 should treat the existing local storage surface as the starting point, not as legacy clutter to replace blindly.

Current local durable inputs already in use are:

- `udp1492_peers` for manual direct peers
- `udp1492_last_peers` for direct recency
- `udp1492_managed_profile` for managed identity/profile facts
- `udp1492_managed_cache` for backend-authored directory/admin cache facts

Current managed facts that are still mostly ephemeral are:

- resolved managed peers
- reusable managed endpoints
- successful managed observations that could help later direct/private operation

The recommended Phase 12 direction is:

1. add one bounded retained-knowledge store instead of a second overlapping persistence model
2. bootstrap that store from existing manual/direct keys
3. enrich it with managed observations after peer refresh and successful use
4. reuse retained facts in bounded direct-mode flows only after provenance and merge rules are stable

The first bounded direct-mode reuse path should stay explicit and operator-driven:

- surface retained managed endpoints as direct-peer import suggestions
- prefill the existing peer editor from retained knowledge rather than auto-activating those endpoints
- merge the resulting manual import back into the retained record when the endpoint matches

Recommended retained-knowledge boundaries:

- keep it local-first
- store reusable non-secret facts only
- do not persist passcodes
- do not persist backend-only live session or membership state as durable authority
- make provenance explicit so manual/operator-entered knowledge is not silently overwritten by managed observations

Recommended first schema target:

- storage key `udp1492_local_knowledge_v1`
- versioned top-level object
- peer-centric records with:
  - stable local `peerId`
  - optional `managedUserId`
  - display/provenance fields
  - reusable endpoint observations
  - bounded first-seen / last-seen / last-connected timestamps

Recommended merge rules:

- manual direct-peer edits outrank managed observations for trusted operator-entered fields
- managed observations may add identities and endpoints when they do not destroy manual intent
- endpoint dedupe should rely on stable reusable facts like `kind + ip + port`
- direct-success timestamps may enrich usefulness without changing provenance
