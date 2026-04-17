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

## Start Here

Read these in order:

1. [PHASE3_GROUPB_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE3_GROUPB_CHECKLIST.md)
2. [DEVELOPMENT_NOTES.md](C:/NodeProjects/1492-app/DEVELOPMENT_NOTES.md)
3. [MANAGED_MODE_ADAPTATION_PLAN.md](C:/NodeProjects/1492-app/MANAGED_MODE_ADAPTATION_PLAN.md)
4. [PHASE2_CLIENT_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE2_CLIENT_CHECKLIST.md)
5. [PHASE1_REVISED_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE1_REVISED_CHECKLIST.md)
6. [src/renderer/managed-controller.js](C:/NodeProjects/1492-app/src/renderer/managed-controller.js)
7. [src/renderer/ui.js](C:/NodeProjects/1492-app/src/renderer/ui.js)
8. [src/renderer/index.html](C:/NodeProjects/1492-app/src/renderer/index.html)
9. [src/renderer/style.css](C:/NodeProjects/1492-app/src/renderer/style.css)
10. [test/e2e/app.spec.js](C:/NodeProjects/1492-app/test/e2e/app.spec.js)
11. [test/e2e/fixtures.js](C:/NodeProjects/1492-app/test/e2e/fixtures.js)

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

[PHASE3_GROUPB_CHECKLIST.md](C:/NodeProjects/1492-app/PHASE3_GROUPB_CHECKLIST.md) is now the controlling checklist for the next implementation slice.

It also contains:

- finish-line criteria
- locked decisions
- immediate coding order
- current codebase baseline
- concrete file-level implementation notes for `ui.js`, `managed-controller.js`, shell updates, and Playwright expansion

## Immediate Next Slice

Do not reopen the Phase 3 Group B client checklist unless a regression appears.

The next concrete target is planning the next post-Phase-3 slice.

Reasonable next candidates, in order:

1. Decide whether the next client milestone is dual-ear routing semantics, Commander Mode groundwork, or backend/admin integration follow-through.
2. Create or update the active checklist for that next milestone before code changes begin.
3. Keep `PHASE3_GROUPB_CHECKLIST.md` as a closed decision record rather than continuing to edit it for unrelated work.

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
If work continues immediately, start by defining the next active checklist rather than reworking the closed Group B slice.
