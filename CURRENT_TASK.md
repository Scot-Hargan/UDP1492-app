# Current Task

## Active Slice

Phase 13 planning is current, but implementation is paused for user testing on `v0.3.1`.

Primary artifact:

- `PHASE13_FRIENDS_AND_PRESENCE_CHECKLIST.md`

Current shipped baseline:

- `v0.3.1` is the active release.
- Managed transport endpoint authority is now fixed:
  - the app-chosen UDP listen port is authoritative
  - Web NAT discovery is advisory-only
- Phase 11 admin/directory work is complete.
- Phase 12 finish-line conditions are satisfied.
- Retained knowledge is local-first, reused in bounded direct flows, inspectable in the admin surface, and covered by mocked plus live backend tests.

## Goals

- Define a bounded friend/contact model that builds on `udp1492_local_knowledge_v1` instead of replacing it.
- Keep the friend roster local-first while using the backend only for live managed presence.
- Plan the first desktop friend presence surface and the first operator-driven action hooks.
- Preserve the project privacy stance: coordination-only, no relay, no provider lock-in for usable direct knowledge.

## In Scope

- `PHASE13_FRIENDS_AND_PRESENCE_CHECKLIST.md`
- `docs/decisions/002-managed-transport-endpoint-authority.md`
- `docs/architecture.md`
- `backend/src/index.ts`
- `backend/test/backend.spec.mjs`
- `src/renderer/ui.js`
- future friend/contact renderer UI files or sections
- `test/e2e/app.spec.js`
- `test/e2e/live-backend.spec.js`

## Out Of Scope

- a public social network
- relay messaging or media
- backend ownership of the user's full usable contact graph
- broad activity feeds or invasive telemetry
- trust automation that hides provenance from the operator

## Minimum Validation

For planning/documentation-only updates:

- no mandatory runtime validation

For the first implementation slice:

- `npm run test:backend`
- `npm run test:e2e`
- `npm run test:e2e:live-backend`

For a release cut:

- `npm run dist:win:portable`
- `npm run dist:win:nsis`
- push `main`
- push `v*` tag so `.github/workflows/windows-release.yml` publishes GitHub release assets

## Next Resume Slice

1. Implement `udp1492_friends_v1` as a local-first friend roster.
2. Link friend entries to retained peers and managed user IDs without duplicating endpoint authority.
3. Add the first bounded desktop friend surface for roster CRUD and retained-knowledge linkage.
4. Only after the local roster exists, add the minimal backend friend presence query over an explicit allow-list of managed user IDs.
