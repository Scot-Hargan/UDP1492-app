# 1492-app Phase 5 Commander Mode Checklist

## Purpose

This checklist defines the next standalone desktop-client slice after the Phase 4 dual-ear routing closeout.

It is intentionally limited to **Commander Mode groundwork for managed transmit behavior** in the Electron client.
It does **not** include admin UI, backend role/permission redesign, NAT work, global OS-level hotkey registration, or host-protocol redesign.

## Scope

This slice should close the desktop-client interpretation of:

- persisted mic-mode and transmit-control preferences needed for Commander workflows
- deterministic transmit-target computation for `All`, `Group A`, and `Group B`
- renderer-owned Commander controls for mute / push-to-talk behavior in managed mode
- overlap handling when one peer endpoint belongs to both managed slots
- focused validation proving the computed transmit-target set updates correctly as slots join, leave, overlap, or change control state

For this phase, the desktop app should treat Commander Mode as a **renderer transmit-control milestone**, not as a full command/admin product realization.

## Locked Decisions

- Keep Commander transmit targeting in the renderer. Do not redesign `src/host/udp_audio1492_host.js` for group semantics unless a concrete blocker appears.
- Preserve current direct-mode behavior. Commander Mode in this phase is for managed two-slot workflows, not the direct peer editor.
- Use existing transport peer ownership keyed by `ip:port` as the source of truth for target computation.
- Introduce a bounded persisted preference model for Commander groundwork:
  - `micMode`
  - `muteState`
  - any placeholder `pttBindings` fields needed for later work
- Do not persist transient press/hold state for on-screen push-to-talk controls.
- In `single` mic mode, transmit behavior should remain equivalent to today's all-target managed send path.
- In `commander` mic mode, transmit selection should support:
  - `All`
  - `Group A`
  - `Group B`
- If a peer endpoint belongs to both slots, dedupe the transport endpoint and send only once per frame, even if both selected transmit scopes include it.
- Keep the first Commander slice UI-local:
  - on-screen controls first
  - no global keyboard capture or OS registration in this phase
- Preserve the closed Phase 1 through Phase 4 behavior contracts while adding Commander controls. This phase must not regress managed session, slot isolation, peer adaptation, or dual-ear receive routing.

## Finish Line

Phase 5 Commander Mode groundwork is complete when all of the following are true:

1. The app persists the minimum Commander preference model needed for mic mode and slot-scoped mute/PTT state.
2. Managed mode exposes understandable controls for `single` vs `commander` mic behavior and for transmit targeting of `All`, `Group A`, and `Group B`.
3. The renderer computes deterministic transmit target sets from managed slot ownership without changing the host transport contract.
4. Shared endpoints that belong to both slots are deduped so transmit delivery stays correct and non-duplicative.
5. The app can validate computed Commander state and transmit targeting without relying on live microphone capture in Playwright.
6. Direct mode remains behaviorally unchanged.

## Current Phase 5 Status

Phase 5 Commander groundwork is now complete by this checklist.

The completed work in this slice includes:

- persisted Commander preferences for `micMode`, `muteState`, and placeholder `pttBindings`
- managed-shell Commander controls for `single` vs `commander` behavior and `All` / `Group A` / `Group B` mute/PTT actions
- deterministic transmit-target computation keyed by managed slot ownership and transport endpoint
- renderer-owned subset send behavior for Commander mode without a host-protocol redesign
- a Commander snapshot and synthetic send hook for Playwright validation
- Playwright coverage proving:
  - migrated/default Commander preference persistence
  - `single` mode target behavior
  - `Group A` Commander targeting
  - `Group B` Commander targeting
  - overlap dedupe for shared endpoints

With those changes validated, the Phase 5 Commander groundwork milestone is closed for the desktop client.

## Checklist

### A. Commander state model

- [x] Extend persisted app state with the minimum Commander preference model needed for `micMode`, `muteState`, and future-safe `pttBindings` placeholders.
- [x] Keep transient press/hold state runtime-only and out of durable storage.
- [x] Define safe defaults so upgraded installs remain stable and default to non-Commander behavior.
- [x] Preserve compatibility with existing Phase 1 through Phase 4 storage behavior.

### B. Transmit target computation

- [x] Add a renderer-owned helper that computes transmit target sets for `All`, `Group A`, and `Group B` from managed slot ownership.
- [x] Keep target computation keyed by transport endpoint so overlap handling stays aligned with Phase 3 and Phase 4 peer aggregation/routing.
- [x] Dedupe shared endpoints so Commander transmit sends one frame per concrete peer endpoint.
- [x] Keep single-mode transmit behavior equivalent to the current baseline unless Commander controls explicitly narrow the target set.

### C. Commander controls

- [x] Add a compact managed-mode control surface for `micMode` selection.
- [x] Add mute / push-to-talk controls for `All`, `Group A`, and `Group B`.
- [x] Keep the first Commander slice UI-local and mouse/keyboard-in-window only; do not add OS-level hotkeys yet.
- [x] Make the current transmit intent understandable from the shell without introducing a full mixer or admin dashboard.

### D. Send-path integration

- [x] Thread Commander target computation into the existing renderer transmit path without redesigning the host message contract.
- [x] Ensure managed transmit can target subsets of active peers while direct-mode send behavior remains unchanged.
- [x] Keep overlap handling deterministic when one peer belongs to both selected transmit scopes.
- [x] Ensure mute / PTT state changes update target selection immediately without reconnecting transport.

### E. Validation

- [x] Add a testable Commander-state / transmit-target snapshot or equivalent test-only hook so Playwright can verify control state without relying on microphone capture.
- [x] Add Playwright coverage for persisted default Commander preferences after migration/load.
- [x] Add Playwright coverage for `single` mode behavior remaining equivalent to the current all-peer baseline.
- [x] Add Playwright coverage for Commander `Group A` transmit targeting.
- [x] Add Playwright coverage for Commander `Group B` transmit targeting.
- [x] Add Playwright coverage for overlapping endpoints so shared peers are deduped when both scopes apply.

## Immediate Coding Order

1. Extend `src/renderer/ui.js` with the minimum persisted Commander preference model and migration-safe defaults.
2. Add deterministic transmit-target helpers derived from managed slot ownership keyed by transport endpoint.
3. Add the minimal Commander control surface in `src/renderer/index.html`, `src/renderer/style.css`, and `src/renderer/ui.js`.
4. Thread Commander target computation into the renderer send path while preserving direct-mode behavior and the current host contract.
5. Add a test-only Commander snapshot surface in the renderer for Playwright assertions.
6. Add focused Playwright Electron coverage in `test/e2e/app.spec.js`.
7. Run `npm run test:e2e`.

## Current Implementation Baseline

### `src/renderer/ui.js`

- managed slot ownership, receive routing, Commander preferences, and transmit-target computation are now renderer-owned
- managed transport peers remain deduped by `ip:port`
- the transmit path now preserves direct-mode baseline behavior while supporting renderer-owned subset sends in Commander mode
- Commander snapshots and synthetic send hooks now exist for Playwright validation

### `src/renderer/managed-controller.js`

- slot membership, peer refresh, leave isolation, and protected recovery are already slot-aware
- this phase should consume that slot ownership for transmit decisions rather than reopening controller architecture

### `src/host/udp_audio1492_host.js`

- the host already supports `sendData` to `all` or a single destination peer key
- that is sufficient for a renderer-owned first Commander slice if subset targeting is implemented by per-peer sends
- avoid expanding host group semantics unless the renderer approach proves insufficient

### `test/e2e/app.spec.js`

- Playwright now validates Commander preference persistence, target computation, and subset-send behavior through explicit computed-state hooks rather than live microphone transmission

## Concrete Implementation Plan

### 1. Add a bounded Commander preference layer

Introduce only the preference fields that materially support the first Commander slice.

Recommended durable shape:

- `micMode`
- `muteState.allMuted`
- `muteState.slotA`
- `muteState.slotB`
- placeholder `pttBindings.all`
- placeholder `pttBindings.slotA`
- placeholder `pttBindings.slotB`

Keep transient hold-state and active-press state runtime-only.

### 2. Keep transmit group semantics in the renderer

The host only knows peers.
It does not need to know `Group A`, `Group B`, or Commander roles.

For the first Commander slice:

- compute target peer keys in the renderer
- when needed, emit one `sendData` message per selected peer key
- keep `destination: 'all'` behavior available for the unchanged baseline path

That preserves the current host/renderer seam and avoids premature protocol changes.

### 3. Keep the first UI slice narrow

Do not build a mixer and do not start with global hotkeys.

The first useful Commander surface should be:

- mic mode selector:
  - `Single`
  - `Commander`
- transmit controls:
  - `All`
  - `Group A`
  - `Group B`
- visible mute/PTT state for each scope

That is enough to prove the model before introducing keybinding capture or richer operator workflows.

### 4. Handle overlap explicitly

If the same endpoint belongs to both slots:

- receive routing is already centered from Phase 4
- Commander transmit should still send only one copy per endpoint
- a shared peer should be included if either active transmit scope selects it

This overlap rule must be explicit in both implementation and tests.

### 5. Validation strategy that matches the repo

Do not rely on live microphone capture in Playwright.

Instead, add a narrow test-only surface that exposes:

- current mic mode
- current mute / PTT state
- current computed transmit target keys for:
  - `All`
  - `Group A`
  - `Group B`

Recommended validation order:

1. default migrated state:
   - assert `single` mic mode
   - assert mute state defaults are safe
2. `single` mode:
   - assert computed target behavior matches the current all-peer baseline
3. Commander `Group A`:
   - dual-slot session
   - assert only Group A peer keys are targeted
4. Commander `Group B`:
   - dual-slot session
   - assert only Group B peer keys are targeted
5. overlap:
   - shared endpoint in both slots
   - assert one deduped target key, not duplicate sends

## Explicit Non-Goals For This Slice

- admin/operator dashboard work
- backend role/permission redesign
- NAT integration
- OS-level global hotkey registration
- full keybinding capture/editor UI
- user-configurable routing matrices
- host-protocol redesign without a concrete blocker
