# 1492-app Phase 3 Group B Checklist

## Purpose

This checklist defines the next standalone desktop-client slice after the Phase 2 protected-channel closeout.

It is intentionally limited to **activating Group B as a first-class managed slot** in the Electron client.
It does **not** include dual-ear routing, Commander Mode, admin UI, backend deployment completion, or host-protocol redesign.

## Scope

This slice should close the desktop-client interpretation of:

- two-slot managed shell behavior for `Group A` and `Group B`
- independent durable slot intent for both groups
- independent runtime join / leave / resume / recovery behavior per slot
- deterministic adaptation of two managed slots into the current host `configure.peers` path

For this phase, the desktop app should treat two-slot activation as a client-session and renderer-state milestone, not as the full product realization of multi-group audio behavior.

## Locked Decisions

- Keep `udp1492_app_state_v2.managed.slots.A/B` as the canonical durable intent model for managed channel selection.
- Do not persist join passcodes in `udp1492_app_state_v2`, `udp1492_managed_profile`, `udp1492_managed_cache`, or any other app storage key.
- Treat Phase 3 as a renderer/controller milestone first. Do not expand `src/host/udp_audio1492_host.js` unless a concrete blocker appears.
- Keep `Group A` behavior stable while `Group B` is activated. Phase 3 must not regress the completed Phase 1 or Phase 2 flows.
- Do not bundle dual-ear routing or per-group audio output semantics into this slice. Two-slot membership and transport adaptation come first.
- If the same resolved transport peer appears in both slots, handle dedupe and merge decisions in the renderer before sending host `configure.peers`.
- Keep `managedProfile.preferredChannelId` as compatibility data only. Slot intent remains the control-flow source of truth.

## Finish Line

Phase 3 Group B work is complete when all of the following are true:

1. The managed shell exposes `Group A` and `Group B` as explicit, understandable slot targets.
2. Each slot can hold its own intended channel, runtime membership state, security metadata, presence state, and peer-sync facts without leaking across slots.
3. Join, leave, switch, resume, and recovery behavior are independent per slot and remain non-destructive.
4. Managed peers resolved from one or both slots adapt deterministically into the existing host `configure.peers` path without a host-protocol redesign.
5. Playwright Electron coverage proves Group A-only, Group B-only, and dual-slot flows behave correctly.

## Current Phase 3 Status

Phase 3 Group B desktop-client work is now complete by this checklist.

The completed work in this slice includes:

- slot-scoped transient passcode handling
- slot-scoped runtime peer storage with aggregated managed transport peers
- slot-parameterized join / leave / presence / peer-refresh / recovery control flow
- explicit `Group A` / `Group B` targeting in the managed shell
- dual slot status cards in the renderer
- Playwright coverage for:
  - `Group B`-only join
  - dual-slot membership with distinct peers
  - leaving one active slot without tearing down the other slot
  - failed slot-local replacement joins without tearing down other active slots
  - overlapping endpoint dedupe and conservative shared-peer removal
  - protected `Group B` resume

With those validations in place, the Phase 3 finish line is satisfied for the desktop client.
Follow-on work should move to the next phase rather than reopening Group B slot activation.

## Checklist

### A. Managed shell and slot targeting

- [x] Expose explicit `Group A` / `Group B` targeting in the managed shell.
- [x] Render per-slot status cards so each slot shows current membership, selected intent, security mode, presence state, and peer-sync state.
- [x] Make lobby actions clearly target the active slot rather than implicitly assuming `Group A`.
- [x] Preserve clear UX for open vs protected channels when targeting either slot.

### B. State and controller ownership

- [x] Extend runtime managed session state so slot-local facts are tracked independently for `A` and `B`.
- [x] Keep durable slot intent synchronized across lobby refresh, join, leave, resume, invalid-session recovery, and invalid-membership recovery for both slots.
- [x] Ensure slot-local failures do not clear or corrupt the other slot's active membership.
- [x] Keep passcode handling slot-local, explicit, and non-persistent.

### C. Slot behavior and recovery

- [x] Support joining a channel into `Group B` without disturbing an active `Group A` membership.
- [x] Support leaving one slot without tearing down the other slot.
- [x] Support replacement-channel switching per slot without destructive teardown if the replacement join fails.
- [x] Make protected-channel resume/rejoin behavior explicit and recoverable per slot when no passcode is available.

### D. Transport adaptation

- [x] Combine resolved peers from `Group A` and `Group B` into the existing renderer-owned host `configure.peers` adapter.
- [x] Define deterministic dedupe behavior when the same peer endpoint appears in both slots.
- [x] Ensure host updates remove peers only when no active slot still requires them.
- [x] Keep transport adaptation channel-agnostic from the host's perspective unless a proven blocker appears.

### E. Validation

- [x] Add Playwright coverage for joining only `Group B` from a clean managed session.
- [x] Add Playwright coverage for dual-slot membership with distinct channels active at the same time.
- [x] Add Playwright coverage proving a failure in one slot does not tear down the other slot.
- [x] Add Playwright coverage for protected-channel resume or rejoin behavior in `Group B`.
- [x] Add Playwright coverage for deterministic peer adaptation when both slots resolve peers.

## Immediate Coding Order

1. Expand the managed state model in `src/renderer/ui.js` and `src/renderer/managed-controller.js` so runtime slot-local facts are no longer hard-coded to `Group A`.
2. Add managed-shell slot targeting in `src/renderer/index.html`, `src/renderer/style.css`, and `src/renderer/ui.js`.
3. Generalize join / leave / refresh / resume flows in `src/renderer/managed-controller.js` to operate per slot.
4. Update the renderer-owned host peer adapter so two active managed slots can coexist without stale peer removal.
5. Add focused Playwright Electron coverage in `test/e2e/app.spec.js` and supporting fixtures.
6. Run `npm run test:e2e`.

## Current Implementation Baseline

This is the concrete state of the repo after the first Phase 3 implementation slice.

### `src/renderer/ui.js`

- managed runtime peer storage is now slot-scoped and aggregated for host adaptation
- transient join passcodes are now slot-scoped
- the managed shell supports explicit active-slot targeting
- the managed shell renders separate `Group A` and `Group B` summaries
- some compatibility fields still exist on `managed.session`, but active runtime membership control no longer depends on a single-slot model

### `src/renderer/managed-controller.js`

- controller flows are now slot-parameterized for join / leave / presence / peer refresh / recovery
- timers are now tracked per slot instead of through one global managed-channel timer pair
- session-open behavior remains shared at the operator/session level
- remaining work is now mostly validation and edge-case hardening rather than controller architecture

### `src/renderer/index.html` and `src/renderer/style.css`

- the shell now exposes active-slot selection and dual slot summaries
- the protected/open lobby cues continue to apply while targeting either slot
- remaining UI work, if any, should be refinement rather than structural rework

### `test/e2e/app.spec.js` and `test/e2e/fixtures.js`

- Group B join, dual-slot membership, protected Group B resume, slot-isolated leave/failure handling, and overlapping-peer dedupe are now covered
- a dedicated Group B resume storage fixture now exists
- the current Phase 3 client gap is no longer validation coverage; the next work should be a new phase definition

## Concrete Implementation Plan

This is the recommended file-level implementation plan for the first Group B slice.

### 1. Runtime model refactor without changing durable persistence

Keep the persisted shape unchanged:

- `udp1492_app_state_v2.managed.shell.activeSlotId`
- `udp1492_app_state_v2.managed.slots.A/B.intendedChannelId`

Refactor runtime-only state in memory:

- keep `managed.session` for shared operator/session facts only:
  - `status`
  - `displayName`
  - `sessionId`
  - `userId`
  - `heartbeatIntervalMs`
  - `expiresAt`
  - `lastOpenedAt`
- keep slot-local runtime facts on `managed.slots.A/B`:
  - `channelId`
  - `channelName`
  - `securityMode`
  - `membershipState`
  - `presenceState`
  - `lastPeerSyncAt`
  - `errorMessage`
- replace the flat `managed.transportPeers` runtime list with slot-scoped runtime peer storage, for example:
  - `managed.slotTransportPeers.A`
  - `managed.slotTransportPeers.B`
- replace the single `managedJoinPasscode` value with slot-local transient passcodes keyed by slot ID.

The important constraint is that the persisted storage builder must continue writing only durable operating mode plus slot intent, not runtime membership facts.

### 2. Generalize the managed controller around `slotId`

Refactor `src/renderer/managed-controller.js` so the slot-specific helpers become parameterized:

- `getManagedSlot(slotId)`
- `syncSlotChannelState(slotId)`
- `joinManagedChannel(slotId, channelId?)`
- `leaveManagedChannel(slotId, options?)`
- `sendManagedPresence(slotId)`
- `refreshManagedPeers(slotId, options?)`
- slot-scoped recovery helpers for invalid membership and protected resume handling

Keep session-open behavior shared:

- `openSession` and resume-session identity remain one managed session for the operator
- slot memberships become separate joins under that shared session

Replace the singleton timers with slot-scoped timers keyed by slot ID:

- heartbeat timer per active slot
- peer-refresh timer per active slot

This is the core Phase 3 refactor. Until this exists, the rest of the UI work will stay cosmetic.

### 3. Minimal viable Group B shell

The first UI goal should be explicit slot targeting, not a full redesign.

Recommended shell behavior:

- keep the shared identity/session card
- add a slot target control bound to `managed.shell.activeSlotId`
- render two slot cards:
  - `Group A`
  - `Group B`
- keep one lobby list, but make its join/select actions target the active slot
- bind the visible passcode field to the active slot's transient passcode state

This yields a manageable first slice:

- one active slot target at a time for lobby actions
- both slots visible at once for status and recovery
- no need to build dual independent lobby panes

### 4. Deterministic dual-slot transport aggregation

Update the renderer-owned transport adapter in `src/renderer/ui.js`:

- replace `getManagedTransportPeers()` with slot-aware helpers
- aggregate peers from both active slots when operating in managed mode
- dedupe by concrete transport endpoint key, not by display name
- keep peer removal conservative: only remove a peer from the host when no active slot still resolves that endpoint

Recommended first rule:

- dedupe by `ip:port`
- first matching endpoint wins for display metadata
- overlapping peers should produce one host peer entry

This keeps the host channel-agnostic and avoids a premature host protocol change.

### 5. Focused validation strategy

Update Playwright in small increments rather than attempting all dual-slot coverage at once.

Recommended order:

1. `Group B` only:
   - set active slot to `B`
   - join one open channel
   - verify `A` stays empty and `B` becomes active
2. Dual-slot happy path:
   - join `A`
   - then join a different channel into `B`
   - verify both slot cards stay correct
   - verify host peer aggregation contains both slots' peers
3. Slot isolation failure case:
   - fail a `B` join or `B` replacement switch
   - prove `A` membership and peers remain active
4. Protected `B` resume case:
   - persist intended `B` channel
   - resume without passcode
   - verify recoverable `B` state without disturbing `A`

### 6. Suggested first code change order inside the repo

If Phase 3 starts immediately, the safest implementation sequence is:

1. `src/renderer/ui.js`
   Introduce slot-scoped transient passcodes and slot-scoped runtime peer storage helpers.
2. `src/renderer/managed-controller.js`
   Remove `PRIMARY_SLOT_ID` assumptions and convert the controller to slot-parameterized behavior while keeping one shared session open path.
3. `src/renderer/index.html` and `src/renderer/style.css`
   Add explicit slot targeting and a second slot status card.
4. `src/renderer/ui.js`
   Rework `renderManagedShell()` and managed transport aggregation around the new slot-aware controller behavior.
5. `test/e2e/app.spec.js` and `test/e2e/fixtures.js`
   Add `Group B`-only and dual-slot cases before attempting broader refinements.

## Explicit Non-Goals For This Slice

- per-group audio-ear mapping
- Commander Mode workflow
- admin/operator dashboard work
- backend schema redesign
- host-protocol redesign without a concrete blocker
