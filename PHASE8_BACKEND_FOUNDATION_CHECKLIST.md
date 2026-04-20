# 1492-app Phase 8 Backend Foundation Checklist

## Purpose

This checklist defines the next product phase after the bounded Phase 7 NAT closeout.

It is intentionally limited to the **backend foundation and first real Cloudflare-managed coordination contract** for the desktop app.
It does **not** include a media relay, TURN deployment, broad admin mutation workflows, or a permanent metadata archive.

## Scope

This phase should close the planning and implementation foundation for:

- a real Cloudflare Worker plus Durable Object backend that matches the current desktop client's managed API contract
- a clear separation between live managed coordination state and locally retained reusable peer knowledge
- privacy- and retention-conscious storage rules for channels, sessions, presence, endpoint registrations, and limited admin facts
- a concrete implementation baseline for the first six managed endpoints already assumed by `src/renderer/managed-api.js`
- a bounded implementation order that moves from Cloudflare bootstrap to a usable coordination backend without redesigning the UDP voice path

For this phase, the product should treat the backend as a **coordination plane**, not a media plane.

## Product Intent Carried Forward

The backend plan must preserve the original product philosophy:

- direct peer voice/data remains the primary transport path
- managed mode exists to help coordination, discovery, status, permissions, and limited observability
- the system should be operable by someone running their own Cloudflare account, not only by a central provider
- knowledge learned in managed mode that can help direct mode later should still be kept locally in the desktop app

That means:

- live channel membership and presence may be backend-authoritative while a session is active
- reusable peer knowledge must not be trapped in the backend
- the local app should retain useful learned facts such as known peers, direct endpoints, and successful connection history where that helps private/direct use later

## Locked Decisions

- Keep voice and data peer-to-peer over UDP. Do not redesign the product around a relay service.
- Use Cloudflare Workers plus SQLite-backed Durable Objects as the first managed backend platform.
- Keep the first backend aligned to the current client contract before adding broader backend concepts.
- Treat `Group A` and `Group B` as client-side slot concepts, not backend channel types.
- Keep the host transport layer channel-agnostic. The backend should not require changes to `src/host/udp_audio1492_host.js` for the first milestone.
- Minimize long-term metadata retention:
  - no communication content storage
  - no relay packet logs
  - no unnecessary historical endpoint archive
- Preserve local reuse of learned knowledge:
  - managed mode may teach the client useful peer/friend data
  - the desktop client should keep reusable non-secret knowledge locally even if the backend was the original source
- Do not persist join passcodes in the client or backend beyond what is strictly required to validate a join request.
- Keep the first backend bounded to the existing managed API shape unless a concrete client blocker appears.

## Finish Line

Phase 8 backend foundation work is complete when all of the following are true:

1. The repository contains a clear decision record for backend responsibilities, privacy rules, retention rules, and local-knowledge retention.
2. The Cloudflare bootstrap baseline is documented well enough that future implementation work can proceed without rediscovering bindings, migrations, or entrypoints.
3. The first backend milestone is explicitly defined as implementing the six managed endpoints already assumed by the desktop client.
4. There is a concrete implementation order for Phase 10 that names the Worker and Durable Object responsibilities.
5. The next work can proceed as backend implementation rather than more abstract architecture debate.

## Current Phase 8 Status

Phase 8 planning is active and the first Phase 10 implementation slice has started.

The planning gap that existed after the Phase 7 NAT closeout is closed by this checklist:

- backend work is now the active planning direction
- the Cloudflare bootstrap has already been performed externally and is reflected in the current repo baseline
- the next implementation milestone is Phase 10: core managed API on Durable Objects
- `backend/src/index.ts` now contains the first real Phase 10 implementation pass rather than only a bootstrap hello-world

## Current Phase 9 Bootstrap Status

Cloudflare bootstrap is complete enough to start backend implementation.

Current confirmed baseline:

- backend workspace exists at `backend/`
- Worker name: `1492-backend-dev`
- Worker entrypoint: `backend/src/index.ts`
- Worker config: `backend/wrangler.toml`
- Durable Object bindings:
  - `CHANNEL_DO` -> `ChannelDO`
  - `DIRECTORY_DO` -> `DirectoryDO`
- migration tag `v1` is present
- `new_sqlite_classes` is configured for:
  - `ChannelDO`
  - `DirectoryDO`
- the currently deployed Worker started as a skeleton and is reachable
- the repo implementation has now progressed beyond the bootstrap seam, but deployment/verification of the new logic should still be treated as Phase 10 work in progress

This means Phase 9 infrastructure bootstrap is effectively complete for the current product need.

## Existing Desktop Client Contract

The backend should implement the contract already assumed by `src/renderer/managed-api.js` before inventing additional API surfaces.

### Required endpoints

- `POST /api/session/open`
- `GET /api/channels`
- `POST /api/channels/:channelId/join`
- `POST /api/channels/:channelId/presence`
- `GET /api/channels/:channelId/peers`
- `POST /api/channels/:channelId/leave`

### Current client expectations

`POST /api/session/open` should return:

- `identity.userId`
- `identity.sessionId`
- `identity.displayName`
- `session.openedAt`
- `session.expiresAt`
- `session.heartbeatIntervalMs`

`GET /api/channels` should return channel objects that normalize to:

- `channelId`
- `name`
- `description`
- `note`
- `securityMode`
- `requiresPasscode`
- `concurrentAccessAllowed`
- `memberCount`

`POST /api/channels/:channelId/join` should return:

- `membership.channelId`
- `membership.slotId`
- `membership.membershipState`
- `membership.joinedAt`
- `membership.leftAt`
- optional `channel` metadata

`POST /api/channels/:channelId/presence` should return:

- `presence.channelId`
- `presence.sessionId`
- `presence.onlineState`
- `presence.lastSeenAt`
- `registrations[]`
- `nextHeartbeatAt`

`GET /api/channels/:channelId/peers` should return:

- `channelId`
- `peers[]` with:
  - `userId`
  - `sessionId`
  - `channelId`
  - `displayName`
  - `connectionState`
  - `endpoints[]`

Endpoint objects should remain compatible with the current client model:

- `endpointId`
- `kind`
- `ip`
- `port`
- `registrationState`
- `lastValidatedAt`

`POST /api/channels/:channelId/leave` should return:

- `membership.channelId`
- `membership.slotId`
- `membership.membershipState`
- `membership.leftAt`

## Durable Object Responsibility Model

### Worker

The public Worker should own:

- HTTP routing
- request validation
- response normalization
- error shaping
- Durable Object dispatch
- lightweight session and request-auth checks if they remain Worker-friendly

### `DirectoryDO`

`DirectoryDO` should own:

- channel catalog
- channel metadata
- channel visibility rules
- channel-level security metadata
- member-count summaries or pointers to channel objects
- any directory-scoped lookup needed before routing into a `ChannelDO`

### `ChannelDO`

`ChannelDO` should own:

- active membership state for one channel
- presence heartbeats
- endpoint registrations
- peer-list resolution for the current channel
- short-lived recent channel/admin health facts if needed

### Session authority

The first implementation may keep session issuance simple if needed, but the plan should reserve a distinct session/identity authority for later hardening.

The important rule for the first milestone is:

- do not let session handling sprawl across every channel object without an explicit model

If implementation simplicity demands it, a lightweight Worker-managed or directory-managed session table is acceptable for the first milestone as long as it is clearly documented.

## Local Knowledge Retention Rules

The desktop app should eventually retain a reusable local knowledge layer independent of live backend state.

That local layer should be designed to keep useful non-secret facts such as:

- known peer display names
- managed user IDs when known
- last successful direct endpoints
- last successful managed endpoints
- source provenance such as `manual`, `managed`, or `imported`
- last-seen or last-connected timestamps
- future trust/pin metadata if added later

Authority rules:

- backend is authoritative for live managed session/channel/presence state
- local app is authoritative for reusable learned knowledge kept for direct/private operation
- managed data may enrich local data
- backend disappearance should not erase useful local knowledge

This local-knowledge retention is a required design principle even if the first backend milestone does not yet implement the full friend/contact feature set.

## Privacy And Retention Rules

The first backend should explicitly minimize retained metadata.

Recommended defaults:

- presence expires on heartbeat timeout
- endpoint registration state is short-lived and tied to presence freshness
- peer visibility is derived from current channel presence, not permanent endpoint history
- no communication content storage
- no voice/data relay logs
- no long-term NAT candidate archive by default
- limited admin facts should be bounded and aggregate where possible
- the desktop app, not the backend, should remain the best place for long-lived reusable peer knowledge

## Current Repo Baseline For Backend Work

### `backend/wrangler.toml`

Currently defines:

- Worker name `1492-backend-dev`
- `main = "src/index.ts"`
- compatibility date `2024-04-01`
- durable object bindings for `CHANNEL_DO` and `DIRECTORY_DO`
- migration `v1` using `new_sqlite_classes`

### `backend/src/index.ts`

Currently provides:

- public Worker routing for:
  - `POST /api/session/open`
  - `GET /api/channels`
  - `POST /api/channels/:channelId/join`
  - `POST /api/channels/:channelId/presence`
  - `GET /api/channels/:channelId/peers`
  - `POST /api/channels/:channelId/leave`
- `DirectoryDO` SQL-backed session and channel catalog handling
- `ChannelDO` SQL-backed live membership, presence, endpoint registration, and peer resolution handling
- CORS-friendly HTTP responses for the Electron renderer
- seeded development channels for initial backend bring-up

### Live desktop integration lane

The repo now also includes a dedicated local real-backend Electron validation path:

- `playwright.live.config.js` starts `wrangler dev` through Playwright `webServer`
- `test/e2e/live-backend.spec.js` drives the desktop client against the local Worker
- `package.json` exposes this as `npm run test:e2e:live-backend`
- the default `npm run test:e2e` suite intentionally stays mock-based by ignoring `live-backend.spec.js`
- lifecycle-sensitive backend unit tests use `backend/wrangler.test.toml`
- backend timing can now be overridden through:
  - `MANAGED_HEARTBEAT_INTERVAL_MS`
  - `MANAGED_SESSION_TTL_MS`
  - `MANAGED_PRESENCE_TTL_MS`

This is the first real Phase 10 implementation slice, not the final backend closeout.

## Phase 10 Objective

Phase 10 should implement the core managed API on the bootstrap Cloudflare foundation now present in `backend/`.

Phase 10 should be considered complete when:

1. The Worker implements the six required managed endpoints with real request/response logic.
2. The desktop app can complete the current managed session/channel/presence/peer flow against the Cloudflare backend instead of only Playwright mocks.
3. Presence and endpoint registration state are coordination-only and degrade cleanly when stale.
4. The implementation remains privacy-bounded and does not add a relay/media path.

## Current Phase 10 Status

Phase 10 is now in progress.

The current implementation baseline already includes:

- Worker routing for the six managed endpoints
- directory-owned session issuance and validation
- directory-owned slot-to-channel membership tracking so successful replacement joins can hand off ownership cleanly
- directory-owned seeded channel catalog
- channel-owned membership join/leave state
- channel-owned presence heartbeat registration with endpoint ingestion
- channel-owned peer listing from live active presence
- server-side membership gates so `presence` and `peers` require a real join instead of only a valid session
- basic protected-channel passcode enforcement for seeded development channels
- a dedicated local Playwright Electron path that validates session open, channel list, join, presence-driven peer visibility, and leave against the actual Worker
- env-driven lifecycle timing so session expiry and stale presence cleanup can be hardened without changing deploy defaults
- slot-membership cleanup when sessions expire in the directory object
- live Electron coverage for:
  - protected-channel passcode enforcement
  - real dual-slot Alpha + Bravo membership
  - Group B leave while Group A remains active
  - stale peer cleanup after presence timeout
  - replacement join from Alpha to protected Bravo
  - idle session expiry recovery in the desktop client

The current known bounds of this first implementation slice are:

- seeded channels are development defaults, not an admin-configured provisioning system
- session/auth hardening is intentionally lightweight
- the default desktop suite still runs against mocks; live Worker coverage currently exists as a separate dedicated config/script
- richer friend/admin mutation workflows remain out of scope

## Recommended Phase 10 Implementation Order

1. Define shared request/response helpers and error envelopes in `backend/src/index.ts` or a small adjacent backend module structure.
2. Implement session open handling first so the backend can issue/validate session identity.
3. Implement channel directory/listing behavior in `DirectoryDO`.
4. Implement channel join/leave/presence/peer flows in `ChannelDO`.
5. Thread endpoint registration and peer response shaping through the current client endpoint model.
6. Add small backend-focused validation before wiring the desktop app to the live URL.
7. Add a dedicated desktop integration lane against local `wrangler dev` without destabilizing the default mock suite.
8. Only after the core contract works, consider richer admin or friend-oriented extensions.

## Current Validation Notes

The backend implementation should currently be validated with:

- `npx wrangler deploy --dry-run --config backend/wrangler.toml`
- `npm run test:backend`
- `npm run test:e2e:live-backend`
- a local `wrangler dev` smoke flow that exercises:
  - session open
  - channel list
  - join
  - presence
  - peers
  - leave

The current automated backend suite covers:

- session open
- channel list
- session resume
- protected-channel passcode enforcement
- membership-required gating for `presence` and `peers`
- peer visibility from live presence
- replacement-join handoff that removes stale old-channel visibility immediately
- idle session expiry after the configured TTL
- stale peer cleanup after the configured presence timeout while an active member stays fresh
- channel member-count transitions across join, replacement join, and leave
- Electron desktop integration against the real local Worker for open-session, seeded-channel join, peer visibility, and leave
- Electron desktop integration against the real local Worker for:
  - protected seeded-channel passcodes
  - dual-slot Alpha + Bravo membership
  - Group B leave while Group A remains active
  - replacement join into protected Bravo
  - stale peer disappearance after timeout
  - idle session expiry recovery

Those checks now prove bundling, baseline request flow, and one bounded end-to-end desktop path against the live Worker. Broader desktop/backend coverage still remains future hardening work.

## Explicit Non-Goals For This Phase

- media relay or TURN deployment
- universal NAT traversal guarantees
- full ICE negotiation infrastructure
- broad admin mutation workflows
- long-term observability archive
- full friend/contact UX in the desktop client
- host-protocol redesign
- moving group-slot semantics into the backend

## Operator Tasks Already Completed

The operator has already completed the Cloudflare portal/bootstrap work needed for the current phase.

That means future "Scot, please have your LLM help you..." tasks should now focus on:

- any missing Cloudflare deployment details that become concrete implementation blockers
- troubleshooting Worker or Durable Object deployment behavior
- environment and route configuration needed to test the real backend from the desktop client

## Immediate Next Slice

Do not reopen the closed Phase 3 through Phase 7 client checklists unless regression work requires it.

The next implementation slice should be:

- Phase 10 core managed API hardening plus broader real-backend desktop validation

The first files to inspect and evolve are:

- `backend/wrangler.toml`
- `backend/wrangler.test.toml`
- `backend/src/index.ts`
- `playwright.live.config.js`
- `test/e2e/live-backend.spec.js`
- `src/renderer/managed-api.js`
- `src/renderer/managed-controller.js`
- `test/e2e/app.spec.js`
