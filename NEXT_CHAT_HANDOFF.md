# Next Chat Handoff

Use this file if work continues in a fresh chat.

## Repository State

- Repo: `C:\NodeProjects\1492-app`
- Branch: `main`
- Package/app version: `0.1.18`
- Renderer version marker in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js): `0.4.17`
- Phase 1 is closed
- Phase 2 protected-channel client work is closed
- Phase 3 Group B desktop-client work is closed
- Phase 4 dual-ear routing desktop-client work is closed

## Start Here

Read these in order:

1. [PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md)
2. [DEVELOPMENT_NOTES.md](C:/NodeProjects/1492-app/DEVELOPMENT_NOTES.md)
3. [MANAGED_MODE_ADAPTATION_PLAN.md](C:/NodeProjects/1492-app/MANAGED_MODE_ADAPTATION_PLAN.md)
4. [PHASE3_GROUPB_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE3_GROUPB_CHECKLIST.md)
5. [PHASE2_CLIENT_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE2_CLIENT_CHECKLIST.md)
6. [PHASE1_REVISED_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE1_REVISED_CHECKLIST.md)
7. [src/renderer/managed-controller.js](C:/NodeProjects/1492-app/src/renderer/managed-controller.js)
8. [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js)
9. [src/renderer/index.html](C:/NodeProjects/1492-app/src/renderer/index.html)
10. [src/renderer/style.css](C:/NodeProjects/1492-app/src/renderer/style.css)
11. [src/main/preload.js](C:/NodeProjects/1492-app/src/main/preload.js)
12. [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
13. [test/e2e/fixtures.js](C:/NodeProjects/1492-app/test/e2e/fixtures.js)

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

## Active Planning Artifact

[PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md) is now a closed decision record for the completed dual-ear routing slice.

It also contains:

- finish-line criteria
- locked decisions
- immediate coding order
- current codebase baseline
- concrete file-level implementation notes for `ui.js`, shell updates, and Playwright expansion

## Immediate Next Slice

Do not reopen the Phase 3 Group B client checklist unless a regression appears.
Do not reopen the Phase 4 dual-ear routing checklist unless a regression appears.

The next concrete target is planning the post-Phase-4 slice around Commander Mode groundwork.

The next planning targets should be:

1. Define the minimum Commander Mode milestone that fits after the now-closed dual-ear routing slice.
2. Create the next active checklist before code changes begin.
3. Keep `PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md` as a closed decision record rather than continuing to edit it for unrelated work.

## Important Constraints

- Do not persist join passcodes anywhere.
- Keep `udp1492_app_state_v2.managed.slots.A/B` as the canonical durable intent model.
- `managedProfile.preferredChannelId` should remain compatibility data only.
- Do not redesign the host protocol unless a concrete blocker appears.
- Avoid touching [src/host/udp_audio1492_host.js](C:/NodeProjects/1492-app/src/host/udp_audio1492_host.js) unless the renderer/client work hits a real blocker.
- Keep planning and handoff documents current when the active phase or design decisions change.

## Validation Baseline

Last clean validation before this handoff:

- `node --check src\\renderer\\ui.js`
- `node --check src\\renderer\\managed-controller.js`
- `npm run test:e2e`
- result: `26/26` passing

Validated implementation updates after that baseline:

- dual-ear routing helpers and pan-aware playback added in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js)
- managed routing cue added in [src/renderer/index.html](C:/NodeProjects/1492-app/src/renderer/index.html)
- route-state assertions added in [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
- package/app version bumped to `0.1.18`
- renderer version bumped to `0.4.17`
- `PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md`, `MANAGED_MODE_ADAPTATION_PLAN.md`, and `NEXT_CHAT_HANDOFF.md` updated to mark Phase 4 closed

Safe validation commands for the next chat:

- `node --check src\\renderer\\ui.js`
- `node --check src\\renderer\\managed-controller.js`
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
- Current code version is `0.1.18`
- After a complete validated slice, update the online GitHub repo before stopping

## If Continuing Immediately

Do not re-open the Phase 1 question.
Treat Phase 1 as closed.
Treat Phase 2 as closed.
Treat Phase 3 Group B desktop-client activation as closed.
Treat Phase 4 dual-ear routing as closed.
If work continues immediately, start by drafting the next active checklist for Commander Mode groundwork rather than modifying the closed Phase 4 slice.
