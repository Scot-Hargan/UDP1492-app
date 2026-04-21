# 1492-app Phase 11 Managed Admin And Directory Checklist

## Purpose

This phase follows the bounded Phase 10 core managed API hardening work.

Its purpose is to move the backend from a seeded coordination baseline to the first real **operator-managed service layer** for channels, permissions, and backend-backed admin facts.

This phase is still coordination-only.
It does **not** introduce a media relay, TURN dependency, or broad social-network features.

## Scope

Phase 11 should introduce the first backend-managed administrative surface for:

- channel provisioning beyond the current seeded defaults
- channel metadata updates
- channel protection/passcode administration
- bounded permissions for who can view or mutate channel/admin data
- backend-provided admin facts that are more authoritative than the current mostly client-derived read-only admin view

The key shift is:

- Phase 10 proves the core runtime contract
- Phase 11 begins the first durable backend administration contract

## Product Intent Carried Forward

This phase must preserve the original product direction:

- voice/data stay peer-to-peer
- managed mode remains a coordination plane
- self-hosting on an operator's own Cloudflare account stays viable
- the backend remains privacy-bounded and should not become a long-term metadata archive

## Dependencies

The dependency that originally blocked activation is now satisfied:

1. Phase 10 should be considered closed enough that the six core managed endpoints are stable.
2. The desktop client should have enough real-backend validation that admin/directory work is not masking basic coordination regressions.

Phase 11 is now the active controlling artifact.

## Target Outcomes

This phase should deliver:

- backend-owned channel creation/update/delete flows
- channel-level policy fields managed by the backend instead of only seeded in code
- bounded role/permission concepts such as:
  - owner
  - admin
  - operator
  - member
- backend-provided admin read APIs for:
  - channel summaries
  - current member counts
  - bounded presence/endpoint health summaries
  - recent coordination-state health facts
- a desktop admin surface that can start consuming those backend facts

## Suggested Backend Shape

The backend should stay conservative and incremental.

Suggested additions:

- a directory/admin API surface in the Worker
- `DirectoryDO` ownership of channel catalog mutation and permission checks
- explicit request validation and normalized error envelopes for admin mutations
- bounded storage of protected-channel secrets:
  - do not store plaintext passcodes if a non-reversible comparison approach is practical
  - document the chosen storage/validation approach clearly

## Finish Line

Phase 11 should be considered complete when all of the following are true:

1. Channels are no longer limited to seeded development defaults.
2. A bounded permission model exists for channel/admin mutations.
3. The admin surface can read at least one backend-authored administrative summary instead of relying only on renderer-derived facts.
4. Protected-channel administration has a documented and implemented server-side storage/validation approach.
5. Automated tests exist for the first backend admin/directory flows.

## Recommended Implementation Order

1. Define the minimal role/permission vocabulary.
2. Define the backend mutation/read contracts for channel administration.
3. Implement backend storage/model changes in `DirectoryDO`.
4. Add backend-focused tests first.
5. Add a bounded desktop admin consumer path after the backend contracts are stable.

## Explicit Non-Goals

- media relay or TURN
- full identity/account platform
- broad audit-log/archive features
- public server discovery
- friend requests or social graph UX
- redesigning the current host transport layer

## Risks To Watch

- allowing permissions/auth to sprawl without a clear model
- overbuilding admin mutation APIs before basic operator needs are pinned down
- storing protected-channel secrets carelessly
- letting backend stats become a hidden long-term metadata archive

## Expected Primary Files

- `backend/src/index.ts`
- `backend/test/backend.spec.mjs`
- `src/renderer/admin.js`
- `src/renderer/admin.html`
- `src/renderer/ui.js`
- `CURRENT_TASK.md`
- `docs/architecture.md`

## Activation Rule

This is now the active controlling artifact after the Phase 10 closeout.

## Closeout Status

Phase 11 is now complete.

Delivered scope:

- backend-owned channel create, update, and delete flows are implemented in the Worker and `DirectoryDOManagedV2`
- the bounded permission model is implemented as `operator` and `member`
- backend-authored admin summaries are available to the desktop admin surface
- desktop admin mutation controls are operator-only, while member sessions remain read-only
- protected-channel passcodes are stored and verified server-side using salted one-way hashes
- automated coverage exists at the backend, mocked Electron E2E, and live Worker E2E layers

Deferred vocabulary:

- `owner` and `admin` were listed as possible future concepts, but the intentionally shipped Phase 11 vocabulary is only `operator` and `member`
