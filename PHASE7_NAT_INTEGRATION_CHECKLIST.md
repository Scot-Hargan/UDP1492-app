# 1492-app Phase 7 NAT Integration Checklist

## Purpose

This checklist defines the next standalone desktop-client slice after the Phase 6 admin-surface closeout.

It is intentionally limited to a **bounded NAT integration milestone** for the Electron client.
It does **not** include TURN/media-relay redesign, a full ICE framework, backend role/permission workflows, or a broad admin-console expansion.

## Recommendation

The recommended next slice is **NAT integration planning and first client-side NAT readiness work**, not an admin mutation follow-on.

Reason:

- Phase 6 already delivered the first useful read-only operator visibility surface.
- Admin mutations would immediately pull in higher-risk backend permission/design work.
- NAT behavior is more directly tied to whether managed voice succeeds outside friendly local networks.
- The new admin surface can absorb NAT-state observability as part of the same slice, which makes Phase 6 a useful foundation rather than a dead end.

The recommended first implementation emphasis inside that slice is:

- local candidate discovery
- STUN-style mapped public candidate discovery
- explicit NAT-readiness visibility

before any deeper hole-punch orchestration or retry logic is added.

## Scope

This slice should close the desktop-client interpretation of:

- a richer managed endpoint/candidate model than local-address publication alone
- a renderer/main/host seam for controlled NAT probe or hole-punch orchestration
- bounded operator visibility for NAT candidate/probe state
- focused validation proving NAT readiness state is explicit and failure-tolerant

For this phase, the desktop app should treat NAT work as a **connectivity-readiness milestone**, not as a promise of universal NAT traversal across every topology.

## Discovery Method Priority

The Phase 7 plan should prefer NAT information-discovery methods in this order:

### 1. Local candidate discovery

Useful for:

- identifying likely LAN/interface endpoints
- building a stable baseline before public-candidate discovery
- making degraded NAT visibility understandable

This should be part of the first implementation slice.

### 2. STUN-style mapped public candidate discovery

Useful for:

- learning a public-facing `ip:port` mapping as observed externally
- distinguishing local candidates from mapped public candidates
- producing a stronger NAT-readiness signal than plain public-IP lookups

This should also be part of the first implementation slice.

### 3. Plain HTTP public-IP services

Useful only for:

- coarse diagnostics
- debugging comparisons between discovery methods

Not useful as a primary NAT mechanism because they do not reveal:

- the relevant UDP mapping
- the mapped UDP port
- probe reachability
- hole-punch viability

Therefore:

- generic HTTP IP lookups are out of scope for the main product path in the first Phase 7 slice
- if ever used, they should be debug-only or optional diagnostics

## Locked Decisions

- Keep the current UDP peer voice path as the media path. Do not redesign the product around a cloud media relay.
- Keep the existing host boundary mostly intact. Only add host-side behavior if a concrete NAT probe/orchestration blocker appears.
- Reuse the managed session/channel/presence model rather than inventing a second connectivity protocol stack.
- Extend current managed endpoint publication pragmatically:
  - preserve current local endpoint publication
  - add richer candidate or registration state only where it materially advances NAT readiness
  - do not require a full ICE implementation for the first slice
- Use the existing admin surface as the first NAT observability surface instead of building a separate NAT dashboard.
- Keep core direct mode and the closed Phase 1 through Phase 6 behavior contracts stable while adding NAT readiness work.
- Do not persist sensitive transient connectivity secrets or join passcodes.
- If STUN/public endpoint discovery is introduced, keep it configurable and bounded. Do not hardcode relay-style infrastructure assumptions deep in renderer logic.
- Prefer STUN-style mapped candidate discovery over third-party HTTP IP services for the first slice.
- Treat generic HTTP IP services as optional diagnostics only, not as a primary dependency.

## Finish Line

Phase 7 NAT integration work is complete when all of the following are true:

1. The client can represent and surface a richer managed endpoint/candidate state than local addresses alone.
2. The client can surface both local candidates and STUN-style mapped public candidates clearly.
3. The client has a defined orchestration path for NAT probe/hole-punch attempts that does not destabilize the current managed session flow.
4. NAT readiness, in-progress work, and failures are explicit in the main/admin surfaces.
5. NAT-specific failures degrade cleanly to current managed behavior instead of tearing down healthy session state unnecessarily.
6. Automated validation proves the new candidate/probe state handling and failure behavior.

## Current Phase 7 Status

Phase 7 has not started yet.

The relevant baseline inherited from Phase 6 is:

- managed presence currently publishes only configured local addresses via `buildManagedPresenceEndpoints(...)`
- the managed peer model already includes endpoint objects with:
  - `kind`
  - `ip`
  - `port`
  - `registrationState`
  - `lastValidatedAt`
- the desktop client already has:
  - slot-scoped managed runtime state
  - admin-window visibility into endpoint registration state
  - testable Electron multi-window flows
- there is no current NAT probe lifecycle, public-endpoint discovery path, or probe-state UI in this repo
- there is no current STUN-style mapped public candidate gatherer in this repo
- there is no current need to depend on generic HTTP public-IP services for managed mode

That means the next work is likely a mix of endpoint-model expansion, orchestration-state wiring, and bounded UI/admin visibility.

## Recommended First-Slice Decisions

These decisions should be treated as the default unless a concrete implementation blocker appears.

### 1. Candidate kinds for the first slice

Use a small candidate vocabulary first:

- `local`
  - current LAN/interface candidates already derived from runtime-configured local addresses
- `public`
  - a discovered public-facing `ip:port` candidate if the app can gather one through STUN-style mapping discovery
- `peer`
  - peer candidates learned from the managed backend peer list
- `unknown`
  - fallback for anything the current backend already returns that the desktop app does not yet understand

Do not introduce `relay` or a full ICE candidate taxonomy in the first slice.
Do not introduce HTTP-IP-only pseudo-candidates in the first slice.

### 2. Runtime-only NAT state

The first NAT slice should keep NAT readiness and probe data runtime-only, similar to other live managed facts.

Recommended shape:

- renderer-owned runtime state, not persisted in `udp1492_app_state_v2`
- slot-scoped local/public candidate state
- peer-key-scoped probe state for remote endpoints
- timestamps for:
  - last gather attempt
  - last probe attempt
  - last success
  - last failure

Do not persist transient probe outcomes or candidate secrets.

Recommended renderer-owned runtime shape:

```js
natRuntime: {
  status: 'idle',           // overall NAT readiness summary for the renderer
  gatherer: {
    status: 'idle',         // idle|gathering|ready|failed
    source: 'none',         // none|stun
    lastStartedAt: '',
    lastCompletedAt: '',
    lastError: ''
  },
  slots: {
    A: {
      localCandidates: [],
      publicCandidates: [],
      lastGatheredAt: '',
      summaryStatus: 'idle'
    },
    B: {
      localCandidates: [],
      publicCandidates: [],
      lastGatheredAt: '',
      summaryStatus: 'idle'
    }
  },
  probes: {
    // keyed by `${slotId}:${peerKey}`
    'A:198.51.100.10:1492': {
      status: 'idle',
      lastStartedAt: '',
      lastCompletedAt: '',
      lastSuccessAt: '',
      lastFailureAt: '',
      lastError: ''
    }
  }
}
```

Candidate entries should stay small and normalized:

```js
{
  kind: 'local' | 'public' | 'peer' | 'unknown',
  ip: '198.51.100.10',
  port: 1492,
  protocol: 'udp',
  source: 'runtime-config' | 'stun' | 'managed-peer',
  discoveredAt: '2026-04-17T00:00:00.000Z'
}
```

### 3. Probe lifecycle vocabulary

Use one explicit status vocabulary everywhere in renderer/admin/test code:

- `idle`
- `gathering`
- `ready`
- `probing`
- `succeeded`
- `timed_out`
- `failed`

Keep these values stable so Playwright assertions and future admin views do not drift.

### 3a. Authority rule for discovered candidates

The plan should treat discovered candidates with explicit confidence levels:

- `local`
  - authoritative for local interface visibility only
- `public` discovered by STUN-style gathering
  - useful for NAT readiness and diagnostics
  - not automatically authoritative for the actual host media socket unless implementation proves the discovery path matches transport ownership
- `peer`
  - authoritative only as remote candidate data returned by the managed backend

This rule should prevent the first slice from overclaiming what a discovered mapped endpoint means.

### 4. Backend assumptions for the first slice

Assume the first client milestone may need one of these two paths:

1. no new backend endpoint at all
   - the app gathers local/public candidates locally
   - the existing peer list remains the source of remote candidate visibility
2. a minimal backend extension only if required
   - enough to register or acknowledge richer endpoint candidate metadata
   - not a broad NAT service or relay design

If a backend change is required, keep it small enough that the desktop client can still be validated with Playwright mocks.

Recommended default assumption:

- first-slice candidate discovery should not depend on generic public-IP HTTP services

### 5. Admin-surface role in this slice

The admin window should expose NAT state for inspection only:

- local/public candidate summaries
- per-slot gather state
- per-peer probe state
- last success/failure timestamps

Do not turn the admin surface into the primary place to start or manage NAT probes unless the main shell becomes too noisy.

## Checklist

### A. Candidate model / publication

- [ ] Define the first NAT candidate model for the desktop app.
- [ ] Add explicit support for:
  - local candidates
  - STUN-style mapped public candidates
- [ ] Decide what additional endpoint data must be published or consumed beyond current local endpoints.
- [ ] Keep the first candidate model compatible with the existing managed presence/session shape where possible.
- [ ] Ensure transient connectivity facts remain runtime-only unless there is a clear durable need.
- [ ] Keep generic HTTP public-IP discovery out of the primary candidate path.

### B. Probe orchestration

- [ ] Define the renderer/main/host seam for NAT probe or hole-punch orchestration.
- [ ] Keep the first probe lifecycle explicit:
  - idle
  - gathering
  - probing
  - ready
  - failed / timed out
- [ ] Avoid destabilizing healthy managed memberships when NAT work fails.
- [ ] Preserve the channel-agnostic host boundary unless a concrete blocker requires expansion.

### C. UI / admin visibility

- [ ] Add bounded NAT-state visibility to the main managed shell where it helps recovery.
- [ ] Extend the admin surface just enough to inspect candidate and probe state.
- [ ] Keep loading/timeout/error states explicit.
- [ ] Avoid turning this slice into a full network-diagnostics suite.

### D. Validation

- [ ] Add Playwright coverage for NAT-state rendering.
- [ ] Add Playwright coverage for probe success-path state transitions if they can be mocked cleanly.
- [ ] Add Playwright coverage for timeout/error states.
- [ ] Add Playwright coverage proving healthy managed session behavior is preserved when NAT work fails.

## Immediate Coding Order

1. Define the candidate/probe state model in the renderer and document the required backend assumptions.
2. Add local candidate and STUN-style mapped public candidate discovery.
3. Add the renderer/main/preload seam for later NAT probe orchestration.
4. Add bounded NAT-state visibility to the main shell and admin window.
5. Add focused Playwright validation for candidate/probe states and failure handling.
6. Run `npm run test:e2e`.

## Implementation Sequence By File

This is the recommended order of actual code changes once Phase 7 implementation starts.

### Step 1. `src/renderer/managed-runtime.js`

- add candidate normalization helpers
- add a helper for converting configured local addresses into normalized `local` candidate records
- if a STUN-style gatherer lands in the renderer, keep candidate parsing/normalization helpers here rather than in `ui.js`

### Step 2. `src/renderer/ui.js`

- add `natRuntime` container creation/reset helpers
- add snapshot builders so NAT state is visible to the admin window and Playwright hooks
- add small managed-shell NAT status cues without widening the main shell too aggressively

### Step 3. `src/renderer/managed-controller.js`

- own gather lifecycle transitions
- trigger candidate gather at bounded moments:
  - managed session open
  - explicit refresh
  - possibly managed slot join if justified
- keep gather failure non-destructive to existing slot/session state

### Step 4. `src/renderer/admin.js`

- render detailed NAT candidate/probe inspection views from the existing snapshot relay
- prefer summaries first, raw detail second

### Step 5. `src/main/preload.js` and `src/main/main.js`

- only add IPC if NAT probe mechanics or telemetry genuinely need it
- do not add IPC just for candidate display if the renderer can gather and publish the data directly

### Step 6. `src/host/udp_audio1492_host.js`

- only touch this step if the first real transport-aware NAT probe requires host participation
- if touched, keep messages additive and transport-oriented

## File Ownership Plan

This is the recommended ownership map for the first implementation slice.

### `src/renderer/managed-runtime.js`

- expand endpoint/candidate helpers
- normalize candidate-kind labels if needed
- keep publication helper logic concentrated here
- prefer candidate-gather normalization here over ad hoc parsing in the UI layer

### `src/renderer/managed-controller.js`

- own NAT gather/probe lifecycle orchestration if it remains session-scoped
- translate managed API/backend responses into renderer runtime state
- centralize recovery behavior so NAT failures do not leak into ad hoc UI code

### `src/renderer/ui.js`

- own runtime NAT state containers
- render bounded NAT readiness cues in the managed shell
- publish NAT/admin snapshot data to the admin window

### `src/renderer/admin.js`

- render read-only NAT candidate/probe inspection data
- avoid owning NAT orchestration logic

### `src/main/main.js` and `src/main/preload.js`

- add only the IPC seams needed for NAT probe requests or telemetry
- keep the admin-window relay model intact
- do not migrate NAT workflow ownership into main process without a concrete reason

### `src/host/udp_audio1492_host.js`

- only change if concrete UDP probe mechanics require low-level host participation
- keep host messages transport-oriented rather than channel-aware

## Decision Gate: Renderer Discovery vs Host Participation

This is the key architectural gate for the first implementation slice.

### Renderer-only is acceptable when:

- the goal is NAT readiness visibility
- the gathered mapped public candidate is being shown as diagnostic or advisory
- no claim is made that the discovered public mapping is definitively the media socket mapping

### Host participation becomes necessary when:

- the app needs transport-authoritative public `ip:port` facts
- the app wants to probe or punch using the actual media UDP socket
- the renderer-side discovery result is no longer sufficient for the user-facing claims being made

If the slice crosses that line, record the escalation explicitly and narrow the host change to that concrete need.

## Backend Contract Questions To Answer During Implementation

These are the key questions the code slice should answer quickly.

1. Can the first public candidate be gathered locally without a new backend dependency?
2. Does the managed presence payload need richer endpoint metadata than `kind`, `ip`, and `port` for the first useful NAT slice?
3. Can peer-probe orchestration be represented as a renderer/runtime concern while the host remains mostly unchanged?
4. What is the minimum additional response shape, if any, needed from the backend to surface useful NAT readiness state?

If any answer forces a larger redesign, stop and capture that explicitly in the checklist before widening the implementation scope.

5. Can STUN-style mapped public candidate discovery be introduced without creating product dependence on generic public-IP HTTP services?
6. At what point does the app need host-authoritative mapping discovery instead of renderer-side advisory discovery?

## Validation Strategy

The first NAT slice should be validated in this order:

1. local candidate state renders without requiring a mapped public candidate
2. STUN-style mapped public candidate state renders when discovery succeeds
3. gather failure or no-candidate state is explicit and recoverable
4. probe in-progress state is visible in both main/admin surfaces if probes are included in the slice
5. success-path state is visible if it can be mocked deterministically
6. timeout/failure state is explicit and recoverable
7. healthy managed slot/session state survives NAT failure paths

Recommended Playwright style:

- mock probe/gather responses rather than depending on real network traversal
- assert renderer/admin snapshots instead of speaker-output or real WAN behavior
- do not depend on live third-party public-IP services in tests
- keep failure assertions concrete:
  - no unwanted slot leave
  - no session reset
  - no passcode loss beyond existing rules

Recommended first test seam:

- expose NAT snapshot state through the existing renderer/admin debug snapshot model
- mock gather results and failures in renderer space first
- only add host-specific test hooks if the slice actually crosses into host participation

## Current Implementation Baseline

### `src/renderer/managed-runtime.js`

- publishes local managed presence endpoints from configured local addresses only
- has no current public-endpoint discovery helper
- has no NAT candidate-state model yet

### `src/renderer/managed-api.js`

- current managed HTTP support is limited to:
  - session open
  - channel list
  - join
  - presence
  - peer list
  - leave
- there are no current dedicated NAT-orchestration endpoints in this repo

### `src/renderer/managed-controller.js`

- already owns managed session/channel/presence/peer orchestration
- is the likely place to centralize NAT readiness flow if it stays session-scoped
- currently has no candidate gathering/probe lifecycle

### `src/main/` and `src/host/`

- the app already has a workable renderer/main/preload/host seam
- there is no current IPC path for NAT probe requests or probe telemetry
- `src/host/udp_audio1492_host.js` should remain transport-oriented and channel-agnostic

### `src/renderer/admin.*`

- the admin surface already exposes endpoint registration state and limited local stats
- it is a natural place to add bounded NAT candidate/probe visibility
- it should not become the primary orchestration surface for NAT actions

## Concrete Implementation Plan

### 1. Start with NAT readiness, not universal traversal claims

The first useful slice should answer:

- what local/public candidates does this client believe it has
- what candidate state was published or consumed
- whether a NAT probe was attempted
- whether it succeeded, timed out, or failed

That is a better first milestone than pretending the desktop app already solves every network topology.

### 2. Reuse the existing managed coordination path

The desktop app already has managed presence and peer resolution.

The next slice should prefer:

- extending the current endpoint model
- extending current managed API assumptions only where required
- keeping NAT readiness scoped to the same managed session/channel identity

That avoids inventing a parallel connectivity control plane.

Recommended first interpretation:

- candidate gathering state is attached to the current managed session/runtime model
- peer probe state is attached to slot ownership plus remote `ip:port`
- current managed peer resolution remains the source of remote endpoint awareness
- local candidate discovery and mapped public candidate discovery come before complex probe automation

Recommended first operator wording:

- `Local candidate(s) discovered`
- `Mapped public candidate discovered`
- `No mapped public candidate discovered`
- `Mapped public candidate is advisory until transport-authoritative probing exists`

### 3. Keep host changes minimal and justified

The host is still the right place for low-level UDP behavior, but the app should not rush into a large host redesign.

Recommended rule:

- renderer/controller owns NAT workflow state and recovery semantics
- host owns any concrete UDP probe send/receive mechanics only if the renderer cannot safely do the work without it

Practical consequence:

- do not start by redesigning `configure.peers`
- prefer additive host messages such as a bounded `natProbe` command only if needed
- keep existing audio send behavior and Commander routing logic untouched unless NAT probe work exposes a real flaw

### 4. Use the admin surface for observability, not control sprawl

Phase 6 already created the right inspection surface.

The next NAT slice should add:

- candidate lists or summaries
- per-peer probe state
- timeout/failure timestamps or summaries

It should not immediately add a large operator workflow surface unless the implementation proves it is needed.

### 5. Validate failure behavior as hard as success behavior

NAT work is risky because partial failure is normal.

The first NAT slice should explicitly prove:

- timeouts do not destroy healthy slot state
- stale candidate data is recoverable
- session/channel state remains understandable while NAT work is degraded

It should also prove:

- absence of a mapped public candidate does not read as a catastrophic session failure
- local-only visibility is still understandable to the operator

## Concrete Non-Blocking Assumptions

These are acceptable assumptions for the first implementation pass:

- the first NAT slice may improve readiness visibility more than real-world success rate
- public candidate discovery may be absent behind some networks and should be rendered as degraded, not exceptional
- NAT probe attempts may be operator-visible even if they are not yet automatically retried
- the admin surface may show richer NAT detail than the main shell, while the main shell only shows concise recovery cues
- STUN-style mapped public candidate discovery is a stronger first input than generic HTTP public-IP discovery for this product

## Explicit Non-Goals For This Slice

- TURN/media-relay product redesign
- guaranteed traversal across every NAT type
- backend role/permission authoring UI
- broad admin mutation workflows
- full network-diagnostics suite
- host-protocol redesign without a concrete blocker
