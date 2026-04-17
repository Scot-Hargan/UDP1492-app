# Next Chat Handoff

Use this file if work continues in a fresh chat.

## Repository State

- Repo: `C:\NodeProjects\1492-app`
- Branch: `main`
- Package/app version: `0.1.17`
- Renderer version marker in [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js): `0.4.16`
- Phase 1 is closed
- Phase 2 protected-channel client work is closed
- Phase 3 Group B desktop-client work is closed
- Phase 4 dual-ear routing planning is now active

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

## Active Planning Artifact

[PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md) is now the controlling checklist for the next implementation slice.

It also contains:

- finish-line criteria
- locked decisions
- immediate coding order
- current codebase baseline
- concrete file-level implementation notes for `ui.js`, `preload.js`, shell updates, and Playwright expansion

## Immediate Next Slice

Do not reopen the Phase 3 Group B client checklist unless a regression appears.

The next concrete target is implementing Phase 4 dual-ear routing from the new checklist.

The first coding targets should be:

1. Add deterministic renderer-side routing helpers derived from slot ownership by `ip:port`.
2. Refactor playback so managed peers can route left, right, or center/both without changing the host contract.
3. Add a minimal test-only routing snapshot so Playwright can validate route computation directly.
4. Add focused e2e coverage for `A`-only, `B`-only, dual-slot, overlap, and slot-isolation route updates.

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

Planning-only updates after that validation:

- `PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md` created
- `MANAGED_MODE_ADAPTATION_PLAN.md` updated for the Phase 4 planning target
- `DEVELOPMENT_NOTES.md` updated to include the new active planning artifact
- `NEXT_CHAT_HANDOFF.md` updated to point the next chat at Phase 4 instead of Phase 3 closeout

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
- Current code version is `0.1.17`
- After a complete validated slice, update the online GitHub repo before stopping

## If Continuing Immediately

Do not re-open the Phase 1 question.
Treat Phase 1 as closed.
Treat Phase 2 as closed.
Treat Phase 3 Group B desktop-client activation as closed.
Treat Phase 4 dual-ear routing as the active next slice.
If work continues immediately, start from the Phase 4 checklist and implement renderer-side routing plus testable route-state validation.
