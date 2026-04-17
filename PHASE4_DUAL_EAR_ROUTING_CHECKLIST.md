# 1492-app Phase 4 Dual-Ear Routing Checklist

## Purpose

This checklist defines the next standalone desktop-client slice after the Phase 3 Group B closeout.

It is intentionally limited to **dual-ear playback routing for managed Group A / Group B memberships** in the Electron client.
It does **not** include Commander Mode, admin UI, backend deployment completion, NAT work, customizable routing matrices, or host-protocol redesign.

## Scope

This slice should close the desktop-client interpretation of:

- deterministic left/right ear routing for managed `Group A` and `Group B`
- deterministic handling when the same resolved peer endpoint belongs to both slots
- renderer-owned audio graph changes needed to route playback per slot without changing the host transport contract
- operator-visible cues so the current ear assignment is understandable while using managed mode
- focused validation proving routing state updates correctly as slots join, leave, fail over, and overlap

For this phase, the desktop app should treat dual-ear routing as a **renderer playback milestone**, not as the full realization of Commander workflow, per-peer custom mixing, or backend-driven role policy.

## Locked Decisions

- Use a fixed initial routing model for this phase:
  - `Group A` routes left
  - `Group B` routes right
  - peers present in both slots route to both ears / centered playback
- Keep direct-mode peers centered. Dual-ear routing in this phase is for managed two-slot playback, not the direct peer editor.
- Keep the host contract channel-agnostic. Do not add ear metadata to `configure.peers` or redesign `src/host/udp_audio1492_host.js` unless a concrete blocker appears.
- Derive routing from managed slot ownership of each resolved transport peer keyed by `ip:port`, not from display names or DOM state.
- Apply routing in the renderer playback graph after decode and before final output.
- Do not add persisted operator routing preferences in this phase. Fixed semantics first, customization later if still needed.
- If slot ownership for a peer changes at runtime, update routing in place without requiring a full transport disconnect/reconnect.
- Preserve the Phase 1, Phase 2, and Phase 3 behavior contracts while adding routing semantics. This phase must not regress session, membership, resume, or peer adaptation correctness.

## Finish Line

Phase 4 dual-ear routing work is complete when all of the following are true:

1. Managed playback sends `Group A`-only peers to the left ear and `Group B`-only peers to the right ear.
2. A peer endpoint that is active in both slots plays to both ears instead of being dropped or arbitrarily pinned to one side.
3. Join, leave, replacement-switch, and overlap changes update routing deterministically without stale ear assignment.
4. The operator can see, from the shell or peer list, how managed routing currently works without needing source-code knowledge.
5. Direct mode remains behaviorally unchanged.
6. Automated validation proves the computed routing state for `A`-only, `B`-only, dual-slot, overlap, and slot-isolation transitions.

## Current Phase 4 Status

Phase 4 dual-ear routing work is now complete by this checklist.

The completed work in this slice includes:

- renderer-owned route computation keyed by managed slot ownership and transport endpoint
- left/right/center routing semantics for `Group A`, `Group B`, and shared peers
- pan-aware playback wiring in the renderer audio path without changing the host contract
- managed-shell routing cues for the fixed Phase 4 semantics
- a test-only routing snapshot exposed for Playwright validation
- Playwright coverage proving:
  - `Group A`-only peers compute to the left ear
  - `Group B`-only peers compute to the right ear
  - distinct dual-slot peers compute to opposite ears
  - overlapping peers compute to centered / both-ear playback
  - slot leave/failure transitions preserve or recompute routing deterministically

With those changes validated, the Phase 4 dual-ear playback milestone is closed for the desktop client.

## Checklist

### A. Routing model and state ownership

- [x] Add a renderer-owned routing helper that computes each managed transport peer's playback route from slot ownership.
- [x] Define deterministic routing outcomes for `A`-only, `B`-only, and shared `A+B` membership.
- [x] Keep routing derivation keyed by transport endpoint so overlap/dedupe behavior stays aligned with Phase 3 peer aggregation.
- [x] Ensure slot-local leave/failure transitions recompute routing without clearing unrelated active peers.

### B. Audio graph adaptation

- [x] Replace the current single-path peer playback connection with a routing-aware graph that can send peers left, right, or center/both.
- [x] Keep the routing change in the renderer playback layer after decode and before final output.
- [x] Update routing in place when slot ownership changes, without requiring a full app reconnect.
- [x] Preserve existing peer gain and mute behavior while adding left/right routing.

### C. Operator visibility

- [x] Add a concise managed-mode cue that explains the fixed Phase 4 routing semantics.
- [x] Surface enough peer- or slot-level routing status that the operator can tell why a managed peer is heard in the left ear, right ear, or both.
- [x] Keep the UI refinement small and consistent with the existing shell rather than introducing a large mixer surface.

### D. Validation

- [x] Add a testable routing snapshot or equivalent test-only hook so Playwright can verify computed ear assignments without relying on speaker output.
- [x] Add Playwright coverage for `Group A`-only routing.
- [x] Add Playwright coverage for `Group B`-only routing.
- [x] Add Playwright coverage for dual-slot routing with distinct peers.
- [x] Add Playwright coverage for overlapping peer endpoints resolving to both ears / centered playback.
- [x] Add Playwright coverage proving slot leave/failure transitions update routing without disturbing the other slot.

## Immediate Coding Order

1. Extend `src/renderer/ui.js` with deterministic routing helpers derived from managed slot peer ownership keyed by transport endpoint.
2. Refactor the renderer playback graph in `src/renderer/ui.js` so peer playback can target left, right, or both ears while preserving gain/mute behavior.
3. Add the minimal managed-shell / peer-list routing cues in `src/renderer/index.html`, `src/renderer/style.css`, and `src/renderer/ui.js`.
4. Add a test-only routing snapshot surface in the renderer so Playwright can assert routing state directly.
5. Add focused Playwright Electron coverage in `test/e2e/app.spec.js`.
6. Run `npm run test:e2e`.

## Current Implementation Baseline

### `src/renderer/ui.js`

- managed transport peers are already aggregated across slots through `getManagedTransportPeers()`
- overlap handling is already deduped by `ip:port`
- renderer helpers now derive per-peer routing from slot ownership
- decoded playback now routes peers through a pan-aware output path with left/right/center semantics
- managed-shell routing cues are now rendered for the fixed Phase 4 mapping
- a test-only routing snapshot is now exposed from the renderer for Playwright assertions

### `src/renderer/managed-controller.js`

- slot ownership and peer refresh behavior are already slot-aware
- per-slot leave/failure isolation is already validated
- this phase should consume that slot ownership for playback routing rather than reopening controller architecture

### `src/host/udp_audio1492_host.js`

- the host still receives channel-agnostic peer transport configuration
- nothing in the current host contract needs ear metadata for Phase 4
- avoid touching the host unless the renderer playback approach proves insufficient

### `test/e2e/app.spec.js`

- Playwright can already inspect UI state and sent host messages
- route-state assertions now run against a renderer-owned routing snapshot
- the validation path avoids fragile speaker-output assertions while still proving deterministic route computation

## Concrete Implementation Plan

### 1. Add a computed routing layer above playback nodes

Introduce renderer helpers that answer questions like:

- which slots currently own peer `ip:port`
- what route should that peer use:
  - `left`
  - `right`
  - `center`

This should build on the existing slot-scoped managed peer storage instead of inventing a second ownership model.

### 2. Keep routing out of the host contract

The host only needs to know which peers to exchange UDP with.
Ear placement is a local playback concern, so Phase 4 should keep:

- `configure.peers` unchanged
- managed peer dedupe unchanged for transport
- routing logic local to decoded playback in the renderer

That preserves the current host/renderer seam and avoids turning a playback feature into a protocol redesign.

### 3. Minimal playback graph change

The current graph sends every peer into the same output path.
Phase 4 should introduce a small routing-aware layer per peer, for example:

- peer gain node
- stereo pan or equivalent left/right assignment node
- shared output / master gain

The important requirement is not the exact node type but the behavior:

- `Group A` peers become left-biased
- `Group B` peers become right-biased
- shared peers remain audible in both ears
- peer mute and gain still work

### 4. Minimal operator-facing UI

Do not build a full mixer.

The first useful UI slice should be:

- a brief managed-shell note that `Group A` is left and `Group B` is right
- a compact routing label for managed peers, or equivalent slot summary cue

That should be enough for an operator to understand what they are hearing without introducing configuration complexity before it is justified.

### 5. Validation strategy that matches the repo

Do not rely on speaker-output assertions in Playwright.

Instead, add a narrow test-only surface that exposes the renderer's computed routing state, such as:

- peer key
- owning slots
- computed route

Recommended validation order:

1. `Group A` only:
   - one managed peer
   - assert route `left`
2. `Group B` only:
   - one managed peer
   - assert route `right`
3. Dual-slot distinct peers:
   - assert `A` peer left
   - assert `B` peer right
4. Overlap:
   - same endpoint present in both slots
   - assert route `center` / both
5. Leave/failure isolation:
   - remove one slot
   - assert the surviving peer route updates correctly without clearing the other slot

## Explicit Non-Goals For This Slice

- Commander Mode workflow
- admin/operator dashboard work
- backend policy or schema redesign
- NAT integration
- user-configurable routing matrices
- per-peer saved pan preferences
- host-protocol redesign without a concrete blocker
