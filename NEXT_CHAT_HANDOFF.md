# Next Chat Handoff

Use this file if work continues in a fresh chat.

## Repository State

- Repo: `C:\NodeProjects\1492-app`
- Branch: `main`
- Package/app version: `0.1.21`
- Renderer version marker in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js): `0.4.20`
- Phase 1 is closed
- Phase 2 protected-channel client work is closed
- Phase 3 Group B desktop-client work is closed
- Phase 4 dual-ear routing desktop-client work is closed
- Phase 5 Commander Mode desktop-client work is closed
- Phase 6 admin-surface work is closed and validated
- Phase 7 NAT integration is active and the first NAT-readiness slice is validated

## Start Here

Read these in order:

1. [PHASE7_NAT_INTEGRATION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE7_NAT_INTEGRATION_CHECKLIST.md)
2. [PHASE6_ADMIN_SURFACE_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE6_ADMIN_SURFACE_CHECKLIST.md)
3. [DEVELOPMENT_NOTES.md](C:/NodeProjects/1492-app/DEVELOPMENT_NOTES.md)
4. [MANAGED_MODE_ADAPTATION_PLAN.md](C:/NodeProjects/1492-app/MANAGED_MODE_ADAPTATION_PLAN.md)
5. [PHASE5_COMMANDER_MODE_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE5_COMMANDER_MODE_CHECKLIST.md)
6. [PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md)
7. [PHASE3_GROUPB_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE3_GROUPB_CHECKLIST.md)
8. [PHASE2_CLIENT_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE2_CLIENT_CHECKLIST.md)
9. [PHASE1_REVISED_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE1_REVISED_CHECKLIST.md)
10. [src/renderer/managed-runtime.js](C:/NodeProjects/1492-app/src/renderer/managed-runtime.js)
11. [src/renderer/managed-api.js](C:/NodeProjects/1492-app/src/renderer/managed-api.js)
12. [src/renderer/managed-controller.js](C:/NodeProjects/1492-app/src/renderer/managed-controller.js)
13. [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js)
14. [src/renderer/admin.html](C:/NodeProjects/1492-app/src/renderer/admin.html)
15. [src/renderer/admin.js](C:/NodeProjects/1492-app/src/renderer/admin.js)
16. [src/main/main.js](C:/NodeProjects/1492-app/src/main/main.js)
17. [src/main/preload.js](C:/NodeProjects/1492-app/src/main/preload.js)
18. [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
19. [test/e2e/fixtures.js](C:/NodeProjects/1492-app/test/e2e/fixtures.js)

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

### Phase 7 first slice

The first bounded NAT-readiness slice is now implemented and validated.

Closed items in this slice include:

- renderer-owned NAT runtime state with explicit candidate and gather-status vocabulary
- local candidate normalization from configured managed addresses
- renderer-side STUN-style mapped public candidate discovery using WebRTC ICE gathering
- managed presence publication that can include both local and mapped public candidates
- bounded NAT-readiness visibility in the main managed shell
- read-only NAT candidate/gather visibility in the admin surface
- deterministic Playwright NAT mocks plus coverage for success rendering and non-destructive failure handling

## Active Planning Artifact

[PHASE7_NAT_INTEGRATION_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE7_NAT_INTEGRATION_CHECKLIST.md) is now the controlling checklist for the next implementation slice.

It contains:

- the recommendation to prioritize NAT integration over an admin mutation follow-on
- finish-line criteria for a bounded NAT-readiness milestone
- locked decisions around candidate publication, probe orchestration, and host-boundary restraint
- explicit preference for local-candidate plus STUN-style mapped public candidate discovery over generic HTTP public-IP lookups
- current implementation baseline for managed runtime/api/controller/admin seams
- recommended first-slice decisions for candidate kinds, runtime-only NAT state, and probe lifecycle vocabulary
- a concrete runtime NAT-state shape and a renderer-vs-host decision gate for candidate authority
- a file-ownership map for renderer/main/preload/host responsibilities
- a step-by-step implementation sequence by file
- concrete implementation notes and non-goals for the first NAT slice
- the updated completion state for the first validated NAT-readiness milestone

## Immediate Next Slice

Do not reopen the Phase 3 Group B client checklist unless a regression appears.
Do not reopen the Phase 4 dual-ear routing checklist unless a regression appears.
Do not reopen the Phase 5 Commander checklist unless a regression appears.
Do not reopen the Phase 6 admin checklist unless a regression appears.

The next concrete target is the next bounded follow-on inside Phase 7, not a new phase.

The most likely coding targets are:

1. Decide whether later NAT claims need transport-authoritative host participation instead of renderer-advisory discovery.
2. Add an explicit NAT probe/timeout path only if the product actually needs it.
3. Extend validation to cover timeout-specific NAT behavior if that path is introduced.
4. Keep the host boundary and admin surface bounded unless the checklist is explicitly revised.

## Important Constraints

- Do not persist join passcodes anywhere.
- Keep `udp1492_app_state_v2.managed.slots.A/B` as the canonical durable intent model.
- `managedProfile.preferredChannelId` should remain compatibility data only.
- Do not redesign the host protocol unless a concrete blocker appears.
- Avoid touching [src/host/udp_audio1492_host.js](C:/NodeProjects/1492-app/src/host/udp_audio1492_host.js) unless the renderer/client work hits a real blocker.
- Keep planning and handoff documents current when the active phase or design decisions change.

## Validation Baseline

Last clean validation before this handoff:

- `node --check src\\main\\main.js`
- `node --check src\\main\\preload.js`
- `node --check src\\renderer\\ui.js`
- `node --check src\\renderer\\managed-controller.js`
- `node --check src\\renderer\\admin.js`
- `node --check test\\e2e\\app.spec.js`
- `npm run test:e2e`
- result: `32/32` passing

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
- package/app version bumped to `0.1.21`
- renderer version bumped to `0.4.20`
- `PHASE7_NAT_INTEGRATION_CHECKLIST.md`, `MANAGED_MODE_ADAPTATION_PLAN.md`, and `NEXT_CHAT_HANDOFF.md` updated for the Phase 7 first-slice closeout

Safe validation commands for the next chat:

- `node --check src\\main\\main.js`
- `node --check src\\main\\preload.js`
- `node --check src\\renderer\\ui.js`
- `node --check src\\renderer\\managed-controller.js`
- `node --check src\\renderer\\admin.js`
- `node --check test\\e2e\\app.spec.js`
- `npm run test:e2e`

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
- Current code version is `0.1.21`
- After a complete validated slice, update the online GitHub repo before stopping

## If Continuing Immediately

Do not re-open the Phase 1 question.
Treat Phase 1 as closed.
Treat Phase 2 as closed.
Treat Phase 3 Group B desktop-client activation as closed.
Treat Phase 4 dual-ear routing as closed.
Treat Phase 5 Commander groundwork as closed.
Treat Phase 6 admin surface as closed.
Treat Phase 7 NAT integration as active.
If work continues immediately, stay inside the Phase 7 checklist and start from the next bounded follow-on slice rather than reopening planning or Phase 6 work.
