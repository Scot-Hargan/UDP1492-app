# Next Chat Handoff

Use this file if work continues in a fresh chat.

## Repository State

- Repo: `C:\NodeProjects\1492-app`
- Branch: `main`
- Package/app version: `0.1.27`
- Renderer version marker in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js): `0.4.22`
- Phase 1 is closed
- Phase 2 protected-channel client work is closed
- Phase 3 Group B desktop-client work is closed
- Phase 4 dual-ear routing desktop-client work is closed
- Phase 5 Commander Mode desktop-client work is closed
- Phase 6 admin-surface work is closed and validated
- Phase 7 NAT integration is closed and validated for the bounded desktop-client milestone
- Phase 8 backend foundation planning is active
- Phase 9 Cloudflare bootstrap is complete locally
- Phase 10 core managed API implementation is in progress
- Phase 11 managed admin/directory planning is prepared
- Phase 12 local knowledge retention planning is prepared
- Phase 13 friends/presence planning is prepared

## Start Here

Read these in order:

1. [PHASE8_BACKEND_FOUNDATION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE8_BACKEND_FOUNDATION_CHECKLIST.md)
2. [PHASE11_MANAGED_ADMIN_DIRECTORY_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE11_MANAGED_ADMIN_DIRECTORY_CHECKLIST.md)
3. [PHASE12_LOCAL_KNOWLEDGE_RETENTION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE12_LOCAL_KNOWLEDGE_RETENTION_CHECKLIST.md)
4. [PHASE13_FRIENDS_AND_PRESENCE_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE13_FRIENDS_AND_PRESENCE_CHECKLIST.md)
5. [PHASE7_NAT_INTEGRATION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE7_NAT_INTEGRATION_CHECKLIST.md)
6. [DEVELOPMENT_NOTES.md](C:/NodeProjects/1492-app/DEVELOPMENT_NOTES.md)
7. [MANAGED_MODE_ADAPTATION_PLAN.md](C:/NodeProjects/1492-app/MANAGED_MODE_ADAPTATION_PLAN.md)
8. [backend/wrangler.toml](C:/NodeProjects/1492-app/backend/wrangler.toml)
9. [backend/wrangler.test.toml](C:/NodeProjects/1492-app/backend/wrangler.test.toml)
10. [backend/src/index.ts](C:/NodeProjects/1492-app/backend/src/index.ts)
11. [backend/vitest.config.mjs](C:/NodeProjects/1492-app/backend/vitest.config.mjs)
12. [backend/test/backend.spec.mjs](C:/NodeProjects/1492-app/backend/test/backend.spec.mjs)
13. [playwright.live.config.js](C:/NodeProjects/1492-app/playwright.live.config.js)
14. [test/e2e/live-backend.spec.js](C:/NodeProjects/1492-app/test/e2e/live-backend.spec.js)
15. [src/renderer/managed-api.js](C:/NodeProjects/1492-app/src/renderer/managed-api.js)
16. [src/renderer/managed-runtime.js](C:/NodeProjects/1492-app/src/renderer/managed-runtime.js)
17. [src/renderer/managed-controller.js](C:/NodeProjects/1492-app/src/renderer/managed-controller.js)
18. [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js)
19. [src/renderer/admin.html](C:/NodeProjects/1492-app/src/renderer/admin.html)
20. [src/renderer/admin.js](C:/NodeProjects/1492-app/src/renderer/admin.js)
21. [src/main/main.js](C:/NodeProjects/1492-app/src/main/main.js)
22. [src/main/preload.js](C:/NodeProjects/1492-app/src/main/preload.js)
23. [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
24. [test/e2e/fixtures.js](C:/NodeProjects/1492-app/test/e2e/fixtures.js)

## What Is Already Complete

### Phase 1

Phase 1 is complete by the revised desktop checklist.

Closed items include:

- managed session open/reopen
- channel list / join / leave
- presence heartbeat
- peer resolution into host `configure.peers`
- non-destructive failed channel switching
- desktop endpoint publication in presence payloads
- explicit fresh session reopen behavior
- Playwright coverage for the closeout cases

### Follow-on cleanup after Phase 1

This cleanup is complete:

- managed orchestration extracted into `src/renderer/managed-controller.js`
- runtime config and endpoint helpers formalized in `src/renderer/managed-runtime.js`
- `AppStateV2` restored to slot-oriented durable intent
- `udp1492_app_state_v2` now persists durable operating mode + slot intent only
- live managed session facts remain runtime-only
- legacy managed app state is normalized on startup

### Phase 2

Phase 2 client security work is complete.

Closed items include:

- slot intent is the authoritative durable channel-selection source
- slot-level `securityMode` stays synchronized from lobby cache / join / leave / resume / reset flows
- runtime control flow no longer relies on `managedProfile.preferredChannelId` when slot intent already exists
- open/protected lobby cues are explicit in the managed shell
- protected joins require explicit passcode handling without persistence
- failed protected-channel switches preserve the current active membership
- protected intended-channel resume without a passcode is explicit and recoverable
- Playwright coverage exists for the protected-channel closeout cases

### Phase 3

The Group B desktop-client checklist is complete and validated.

Closed items in this slice include:

- slot-scoped transient passcode handling
- slot-scoped runtime peer storage with aggregated managed transport peers
- slot-parameterized join / leave / presence / peer-refresh / recovery control flow
- explicit `Group A` / `Group B` slot targeting in the managed shell
- dual slot status cards in the renderer
- Playwright coverage for:
  - `Group B`-only join
  - dual-slot membership
  - slot-isolated leave behavior
  - slot-isolated failure behavior
  - overlapping endpoint dedupe with conservative peer removal
  - protected `Group B` resume

### Phase 4

The dual-ear routing desktop-client checklist is complete and validated.

Closed items in this slice include:

- renderer-owned route computation keyed by managed slot ownership and transport endpoint
- pan-aware playback routing for `Group A`, `Group B`, and shared peers
- managed-shell routing cues for the fixed left/right mapping
- a renderer test hook exposing routing snapshots for Playwright
- Playwright route validation for:
  - `Group A`-only peers
  - `Group B`-only peers
  - distinct dual-slot peers
  - overlapping shared peers
  - slot leave/failure route recomputation

### Phase 5

The Commander groundwork desktop-client checklist is complete and validated.

Closed items in this slice include:

- persisted Commander preference scaffolding for `micMode`, `muteState`, and placeholder `pttBindings`
- renderer-owned transmit-target computation keyed by slot ownership and transport endpoint
- managed-shell Commander controls for `single` vs `commander` mode and `All` / `Group A` / `Group B` mute/PTT actions
- subset send behavior in Commander mode without a host-protocol redesign
- a renderer test hook exposing Commander snapshots and synthetic send behavior for Playwright
- Playwright Commander validation for:
  - migrated/default preference persistence
  - `single`-mode baseline targeting
  - `Group A` Commander targeting
  - `Group B` Commander targeting
  - overlap dedupe for shared endpoints

### Phase 6

The admin surface desktop-client checklist is complete and validated.

Closed items in this slice include:

- a dedicated Electron admin window with explicit open/focus/close lifecycle
- preload/main/renderer relay APIs for admin snapshot publication and refresh requests
- a bounded read-only admin renderer for channels, memberships/presence, endpoint registration state, and limited local stats
- runtime-only raw resolved-peer storage so endpoint registration state stays visible without persisting live managed facts
- Playwright coverage for:
  - opening the admin surface
  - empty-state rendering
  - populated admin data views
  - refresh failure while the main control window remains stable

### Phase 7

The bounded desktop-client NAT milestone is now complete and validated.

Closed items in this milestone include:

- renderer-owned NAT runtime state with explicit candidate and gather-status vocabulary
- local candidate normalization from configured managed addresses
- renderer-side STUN-style mapped public candidate discovery using WebRTC ICE gathering
- managed presence publication that can include both local and mapped public candidates
- bounded NAT-readiness visibility in the main managed shell
- read-only NAT candidate/gather visibility in the admin surface
- renderer-owned per-peer NAT probe state with bounded admin/main visibility
- transport-authoritative probe upgrades derived from existing host ping/handshake evidence
- deterministic Playwright NAT mocks plus coverage for advisory success, transport-authoritative success, timeout visibility, and non-destructive failure handling

### Phase 8

Phase 8 backend foundation planning is now active.

Closed planning decisions in this phase include:

- the backend is coordination-only, not a media relay
- Cloudflare Workers plus SQLite-backed Durable Objects are the active backend platform
- managed-mode knowledge that is reusable for direct/private use should remain retainable locally in the desktop app
- the first implementation milestone should match the existing desktop client contract before adding broader backend features
- the active planning artifact is now [PHASE8_BACKEND_FOUNDATION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE8_BACKEND_FOUNDATION_CHECKLIST.md)

### Phase 9

The Cloudflare bootstrap baseline is now complete locally.

Current backend bootstrap state includes:

- Worker scaffold in [backend](C:/NodeProjects/1492-app/backend)
- config in [backend/wrangler.toml](C:/NodeProjects/1492-app/backend/wrangler.toml)
- Worker entrypoint in [backend/src/index.ts](C:/NodeProjects/1492-app/backend/src/index.ts)
- Durable Object bindings:
  - `CHANNEL_DO` -> `ChannelDO`
  - `DIRECTORY_DO` -> `DirectoryDO`
- migration `v1` using SQLite-backed `new_sqlite_classes`

Phase 9 bootstrap is closed enough for current product needs.

### Phase 10

Phase 10 core managed API implementation is now in progress.

The current backend implementation in [backend/src/index.ts](C:/NodeProjects/1492-app/backend/src/index.ts) now includes:

- Worker routing for the six managed endpoints the desktop client already expects
- SQL-backed `DirectoryDO` session issuance/validation, seeded channel catalog behavior, and slot-membership tracking
- SQL-backed `ChannelDO` join, presence, peer listing, leave, and member-count behavior
- CORS-friendly responses for the Electron renderer
- seeded development channels including one protected path for passcode validation
- membership-gated `presence` / `peers` behavior so a valid session cannot bypass `join`
- replacement-join handoff that clears old-channel slot ownership immediately on successful switch
- a dedicated Playwright Electron lane that exercises the desktop client against a real local `wrangler dev` Worker
- env-driven backend lifecycle timing for session expiry and stale presence cleanup hardening without changing deploy defaults
- directory cleanup of stale slot membership when sessions expire

Backend-focused automated validation now exists in:

- [backend/wrangler.test.toml](C:/NodeProjects/1492-app/backend/wrangler.test.toml)
- [backend/vitest.config.mjs](C:/NodeProjects/1492-app/backend/vitest.config.mjs)
- [backend/test/backend.spec.mjs](C:/NodeProjects/1492-app/backend/test/backend.spec.mjs)
- [playwright.live.config.js](C:/NodeProjects/1492-app/playwright.live.config.js)
- [test/e2e/live-backend.spec.js](C:/NodeProjects/1492-app/test/e2e/live-backend.spec.js)

Current limitations of the in-progress slice:

- the default desktop Playwright suite still uses mocks; real-backend coverage still lives in a separate dedicated config/script
- channel provisioning is still seeded/static, not admin-driven
- auth hardening remains intentionally lightweight

## Active Planning Artifact

[PHASE8_BACKEND_FOUNDATION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE8_BACKEND_FOUNDATION_CHECKLIST.md) is now the active controlling artifact.

It contains:

- the backend/product philosophy that managed mode coordinates while voice/data remain peer-to-peer
- local-knowledge retention rules for managed-learned peer/friend data that should remain reusable for direct mode
- the confirmed Cloudflare bootstrap baseline now present in `backend/`
- the exact six-endpoint managed API contract already assumed by the desktop client
- the `Worker` / `DirectoryDO` / `ChannelDO` responsibility model
- privacy and retention rules for presence, endpoints, and limited admin facts
- the implementation order for Phase 10 core managed API work
- the current split between mock-first desktop coverage and the dedicated live-Worker Electron integration lane

Prepared follow-on artifacts for the next phases now exist in:

- [PHASE11_MANAGED_ADMIN_DIRECTORY_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE11_MANAGED_ADMIN_DIRECTORY_CHECKLIST.md)
- [PHASE12_LOCAL_KNOWLEDGE_RETENTION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE12_LOCAL_KNOWLEDGE_RETENTION_CHECKLIST.md)
- [PHASE13_FRIENDS_AND_PRESENCE_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE13_FRIENDS_AND_PRESENCE_CHECKLIST.md)

[PHASE7_NAT_INTEGRATION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE7_NAT_INTEGRATION_CHECKLIST.md) now remains the closed validation record for the NAT milestone.

## Immediate Next Slice

Do not reopen the Phase 3 Group B client checklist unless a regression appears.
Do not reopen the Phase 4 dual-ear routing checklist unless a regression appears.
Do not reopen the Phase 5 Commander checklist unless a regression appears.
Do not reopen the Phase 6 admin checklist unless a regression appears.
Do not reopen the closed Phase 7 NAT milestone unless a regression or a new explicit NAT requirement appears.

The next concrete target is now:

1. Continue and harden Phase 10 core managed API behavior in `backend/`.
2. Broaden real-backend desktop validation beyond the current protected-join, dual-slot, Group B leave-preservation, replacement-join, stale-peer, and idle-session-expiry cases.
3. Keep the backend aligned to the six existing client endpoints before adding broader admin/friend features.
4. Preserve the current host boundary and peer-to-peer media path.
5. Treat local retention of managed-learned reusable peer knowledge as a required future client rule while implementing the backend.

After the current Phase 10 closeout, the planned follow-on sequence is:

1. `Phase 11`: managed admin and directory productization
2. `Phase 12`: local reusable knowledge retention
3. `Phase 13`: friends and broader online/offline presence

## Important Constraints

- Do not persist join passcodes anywhere.
- Keep `udp1492_app_state_v2.managed.slots.A/B` as the canonical durable intent model.
- `managedProfile.preferredChannelId` should remain compatibility data only.
- Do not redesign the host protocol unless a concrete blocker appears.
- Avoid touching [src/host/udp_audio1492_host.js](C:/NodeProjects/1492-app/src/host/udp_audio1492_host.js) unless the renderer/client work hits a real blocker.
- Keep planning and handoff documents current when the active phase or design decisions change.
- Keep the backend coordination-only:
  - no voice/data relay
  - no content storage
  - no unnecessary long-term metadata archive
- Be aware the current local worktree may include externally created backend bootstrap files in `backend/` plus unrelated package-file edits. Check `git status --short` before committing new work.

## Validation Baseline

Last clean validation before this handoff:

- `npm run test:backend`
- `npm run test:e2e`
- `npm run test:e2e:live-backend`
- `node --check src\\renderer\\ui.js`
- `npx wrangler deploy --dry-run --config backend/wrangler.toml`

Validated implementation updates after that baseline:

- admin window lifecycle and relay logic added in [src/main/main.js](C:/NodeProjects/1492-app/src/main/main.js) and [src/main/preload.js](C:/NodeProjects/1492-app/src/main/preload.js)
- read-only admin renderer added in [src/renderer/admin.html](C:/NodeProjects/1492-app/src/renderer/admin.html) and [src/renderer/admin.js](C:/NodeProjects/1492-app/src/renderer/admin.js)
- main renderer admin snapshot/refresh wiring plus runtime-only resolved-peer detail added in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js) and [src/renderer/managed-controller.js](C:/NodeProjects/1492-app/src/renderer/managed-controller.js)
- admin entry control and shared styling added in [src/renderer/index.html](C:/NodeProjects/1492-app/src/renderer/index.html) and [src/renderer/style.css](C:/NodeProjects/1492-app/src/renderer/style.css)
- Playwright admin multi-window coverage added in [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
- NAT candidate/runtime state, WebRTC gather flow, and mapped-public endpoint publication added in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js), [src/renderer/managed-controller.js](C:/NodeProjects/1492-app/src/renderer/managed-controller.js), and [src/renderer/managed-runtime.js](C:/NodeProjects/1492-app/src/renderer/managed-runtime.js)
- managed runtime config support for STUN server URLs added in [src/main/main.js](C:/NodeProjects/1492-app/src/main/main.js)
- main-shell NAT status and refresh control added in [src/renderer/index.html](C:/NodeProjects/1492-app/src/renderer/index.html)
- admin NAT inspection surface added in [src/renderer/admin.html](C:/NodeProjects/1492-app/src/renderer/admin.html), [src/renderer/admin.js](C:/NodeProjects/1492-app/src/renderer/admin.js), and [src/renderer/style.css](C:/NodeProjects/1492-app/src/renderer/style.css)
- Playwright NAT coverage and renderer NAT test hooks added in [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
- per-peer NAT probe state, probe refresh hooks, and probe summaries added in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js) and [src/renderer/managed-controller.js](C:/NodeProjects/1492-app/src/renderer/managed-controller.js)
- admin probe inspection visibility added in [src/renderer/admin.html](C:/NodeProjects/1492-app/src/renderer/admin.html), [src/renderer/admin.js](C:/NodeProjects/1492-app/src/renderer/admin.js), and [src/renderer/style.css](C:/NodeProjects/1492-app/src/renderer/style.css)
- Playwright probe timeout coverage and probe debug hooks added in [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
- transport-authoritative probe upgrades using existing host `peerUpdate` / `pingHistory` evidence added in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js) without widening the host IPC contract
- Playwright host-evidence NAT validation added in [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
- package/app version bumped to `0.1.23`
- renderer version bumped to `0.4.22`
- `PHASE7_NAT_INTEGRATION_CHECKLIST.md`, `MANAGED_MODE_ADAPTATION_PLAN.md`, and `NEXT_CHAT_HANDOFF.md` updated for the Phase 7 closeout
- backend Cloudflare bootstrap was later added externally in `backend/` with:
  - `wrangler.toml`
  - `src/index.ts`
  - Worker name `1492-backend-dev`
  - Durable Object bindings `CHANNEL_DO` / `DIRECTORY_DO`
  - migration `v1` using SQLite-backed `new_sqlite_classes`
- `PHASE8_BACKEND_FOUNDATION_CHECKLIST.md`, `MANAGED_MODE_ADAPTATION_PLAN.md`, and `DEVELOPMENT_NOTES.md` were then updated to make backend implementation the active next phase
- `backend/src/index.ts` was later upgraded from a bootstrap skeleton to the first real Phase 10 implementation slice:
  - Worker routing for the six managed endpoints
  - `DirectoryDO` SQL-backed sessions, seeded channels, and slot-membership tracking
  - `ChannelDO` SQL-backed memberships, presence, endpoints, and peer listing
  - server-side membership gates for `presence` and `peers`
  - replacement-join handoff that clears the old channel on successful switch
- backend Cloudflare tests were then added in:
  - `backend/vitest.config.mjs`
  - `backend/test/backend.spec.mjs`
- the desktop app was then wired into a dedicated local live-backend validation lane without disturbing the default mock suite:
  - `playwright.live.config.js` starts `wrangler dev` through Playwright `webServer`
  - `test/e2e/live-backend.spec.js` drives the Electron app against the real local Worker
  - `playwright.config.js` ignores the live spec so `npm run test:e2e` stays mock-based and stable
  - `package.json` now exposes `npm run test:e2e:live-backend`
- the default Playwright suite also had one bounded assertion relaxed so the replacement-join regression test accepts either the local passcode-required guard or the backend invalid-passcode response while still enforcing the membership-preservation invariant
- backend lifecycle hardening was then added:
  - `backend/src/index.ts` now reads `MANAGED_HEARTBEAT_INTERVAL_MS`, `MANAGED_SESSION_TTL_MS`, and `MANAGED_PRESENCE_TTL_MS`
  - `DirectoryDO` now clears stale `slot_memberships` when sessions expire
  - `backend/wrangler.test.toml` now drives short-TTL backend unit coverage
  - `backend/test/backend.spec.mjs` now covers idle session expiry, stale peer cleanup, and channel member-count transitions across join/replacement/leave
  - `test/e2e/live-backend.spec.js` now covers:
    - protected seeded-channel passcodes
    - dual-slot Alpha + Bravo membership against the real Worker
    - Group B leave while Group A remains active
    - stale peer disappearance after timeout
    - Alpha -> Bravo replacement join
    - idle session expiry recovery
  - `src/renderer/ui.js` now exposes test-only `window.udp1492ManagedDebug` hooks for live managed lifecycle coverage
  - `test/e2e/app.spec.js` now has one bounded input-value assertion to stabilize the fresh-session reopen regression test
- package/app version bumped to `0.1.27`
- backend validation was run with:
  - `npm run test:backend`
  - `npm run test:e2e`
  - `npm run test:e2e:live-backend`
  - `node --check src\\renderer\\ui.js`
  - `npx wrangler deploy --dry-run --config backend/wrangler.toml`
  - a local `wrangler dev` smoke flow covering open session, list channels, join, presence, peers, and leave through the Electron app

Safe validation commands for the next chat:

- `node --check src\\main\\main.js`
- `node --check src\\main\\preload.js`
- `node --check src\\renderer\\ui.js`
- `node --check src\\renderer\\managed-controller.js`
- `node --check src\\renderer\\admin.js`
- `node --check test\\e2e\\app.spec.js`
- `npm run test:backend`
- `npm run test:e2e`
- `npm run test:e2e:live-backend`
- `npx wrangler deploy --dry-run --config backend/wrangler.toml`

## Useful Test Fixtures

- [test/fixtures/storage/managed-resume.json](C:/NodeProjects/1492-app/test/fixtures/storage/managed-resume.json)
- [test/fixtures/storage/managed-legacy-state.json](C:/NodeProjects/1492-app/test/fixtures/storage/managed-legacy-state.json)
- [test/fixtures/storage/managed-slot-precedence.json](C:/NodeProjects/1492-app/test/fixtures/storage/managed-slot-precedence.json)
- [test/fixtures/storage/managed-group-b-resume.json](C:/NodeProjects/1492-app/test/fixtures/storage/managed-group-b-resume.json)

## Release / Packaging Notes

- Windows release workflow is tag-driven
- Workflow file: [.github/workflows/windows-release.yml](C:/NodeProjects/1492-app/.github/workflows/windows-release.yml)
- Release publishing was fixed earlier by building with `--publish never` in the build step
- Latest published release from the prior chat context was `v0.1.13`
- Current code version is `0.1.27`
- After a complete validated slice, update the online GitHub repo before stopping

## If Continuing Immediately

Do not re-open the Phase 1 question.
Treat Phase 1 as closed.
Treat Phase 2 as closed.
Treat Phase 3 Group B desktop-client activation as closed.
Treat Phase 4 dual-ear routing as closed.
Treat Phase 5 Commander groundwork as closed.
Treat Phase 6 admin surface as closed.
Treat Phase 7 NAT integration as closed for the bounded desktop-client milestone.
If work continues immediately, keep `PHASE8_BACKEND_FOUNDATION_CHECKLIST.md` active until the current Phase 10 closeout is judged complete enough to hand off to `PHASE11_MANAGED_ADMIN_DIRECTORY_CHECKLIST.md`.
