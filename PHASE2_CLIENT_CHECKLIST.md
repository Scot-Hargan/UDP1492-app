# 1492-app Phase 2 Client Checklist

## Purpose

This checklist defines the next standalone desktop-client slice after the Phase 1 client closeout and the managed-state cleanup pass.

It is intentionally limited to **Phase 2 channel security and membership rules** in the Electron client.
It does **not** include Group B, dual-ear routing, Commander Mode, admin UI, or backend deployment completion.

## Scope

This slice should close the desktop-client interpretation of:

- per-channel security metadata
- passcode-protected joins
- mixed open and protected channel deployments
- correct non-persistent passcode handling

For the desktop app, backend-side endpoint encryption-at-rest remains a backend concern unless a concrete client contract change appears.

## Locked Decisions

- Do not persist join passcodes in `udp1492_app_state_v2`, `udp1492_managed_profile`, `udp1492_managed_cache`, or any other app storage key.
- Treat `udp1492_app_state_v2.managed.slots.A/B` as the canonical durable intent model.
- Keep `managedProfile.preferredChannelId` only as compatibility data during the transition, not as the long-term control-flow source of truth.
- Keep security decisions in the renderer/controller layer. Do not expand the host protocol unless a concrete blocker appears.

## Finish Line

Phase 2 client work is complete when all of the following are true:

1. Open and protected channels render clearly and consistently in the managed lobby.
2. Protected channels require a passcode to join, and that passcode is never persisted.
3. Switching between open and protected channels remains non-destructive when the replacement join fails.
4. Resume and rejoin behavior against protected channels is explicit and recoverable rather than opaque.
5. Mixed open/protected deployments are covered by Playwright Electron tests.

## Checklist

### A. State contract hardening

- [x] Make slot intent in `udp1492_app_state_v2.managed.slots.A/B` the authoritative durable channel-selection source.
- [x] Keep slot-level `securityMode` synchronized across lobby refresh, join, leave, resume, and invalid-session/membership recovery.
- [x] Reduce runtime control-flow reliance on `managedProfile.preferredChannelId` to compatibility fallback only.

### B. Protected-channel UX

- [ ] Show clear lobby metadata for open vs protected channels.
- [ ] Make protected-channel actions and passcode prompts explicit in the managed shell.
- [ ] Clear passcode input on success, leave, failed resume, and session/membership reset.

### C. Mixed deployment behavior

- [x] Open and protected channels can coexist in one lobby without stale state leaks.
- [ ] Failed protected-channel switches preserve the current active membership.
- [ ] Resume against a protected intended channel without a passcode yields a clear recoverable state.

### D. Validation

- [x] Add a regression test proving legacy managed state is normalized into slot intent.
- [x] Add a regression test proving slot intent, not profile fallback, drives channel selection behavior.
- [x] Add a regression test proving passcodes are never written to durable storage.
- [x] Add a regression test covering open/protected mixed deployments.

## Immediate Coding Order

1. Harden slot-level security ownership in `src/renderer/ui.js` and `src/renderer/managed-controller.js`.
2. Remove remaining active-behavior dependence on `managedProfile.preferredChannelId` where slot intent already exists.
3. Tighten protected-channel shell behavior in `src/renderer/index.html`, `src/renderer/style.css`, and `src/renderer/ui.js`.
4. Add the focused Playwright regression cases.
5. Run `npm run test:e2e`.
