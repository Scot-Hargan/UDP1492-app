# 1492-app Phase 6 Admin Surface Checklist

## Purpose

This checklist defines the next standalone desktop-client slice after the Phase 5 Commander Mode groundwork closeout.

It is intentionally limited to **an operator/admin surface for managed-state inspection** in the Electron client.
It does **not** include backend schema redesign, role/permission authoring workflows, NAT work, or large observability infrastructure changes.

## Scope

This slice should close the desktop-client interpretation of:

- a dedicated admin/operator surface for viewing managed operational state
- inspection of channels, memberships, presence, endpoint registration state, and limited stats
- a renderer/main-process seam for opening and maintaining the admin surface in Electron
- focused validation proving the admin surface can display and refresh the expected managed data views

For this phase, the desktop app should treat admin work as a **read-first observability milestone**, not as a full backend administration console.

## Locked Decisions

- Prefer a separate admin window first over embedding a large admin dashboard inside the main control shell.
- Keep the first admin slice read-only:
  - inspection first
  - mutation workflows later only if justified
- Keep the managed voice path and host contract unchanged. The admin surface must not redesign `src/host/udp_audio1492_host.js`.
- Reuse the existing managed identity/session model instead of inventing a separate admin auth path in the desktop client.
- Keep the initial view set bounded to:
  - channels
  - memberships/presence
  - endpoint registration state
  - limited stats / recent events if data is available
- Do not block core app use if the admin surface fails to load or refresh.
- Preserve the closed Phase 1 through Phase 5 behavior contracts while adding the admin surface.

## Finish Line

Phase 6 admin surface work is complete when all of the following are true:

1. The app can open a dedicated admin/operator surface without disturbing the main voice-control shell.
2. The admin surface can display the core managed inspection views required for channels, presence, endpoints, and limited stats.
3. Admin refresh behavior is understandable and non-destructive to the main session.
4. The first admin slice remains read-only and bounded in scope.
5. Automated validation proves the surface opens, renders its core views, and handles missing/failed data cleanly.

## Current Phase 6 Status

Phase 6 has not started yet.

The relevant baseline inherited from Phase 5 is:

- managed session, slot state, dual-ear receive routing, and Commander transmit groundwork are already renderer-owned
- the current app has no dedicated admin surface, window, or read-only inspection panels
- the current Playwright harness already supports Electron multi-window launch patterns if needed

That means the next work is primarily Electron windowing, admin data presentation, and validation work.

## Checklist

### A. Admin window / shell ownership

- [ ] Define the Electron ownership model for the admin surface:
  - separate `BrowserWindow` first
  - explicit open/close lifecycle
- [ ] Ensure opening or closing the admin surface does not disrupt the main control window.
- [ ] Keep the initial shell lightweight and read-first.

### B. Admin data views

- [ ] Add bounded read-only views for channels, memberships/presence, endpoint state, and limited stats/events when available.
- [ ] Keep empty/error/loading states explicit.
- [ ] Avoid turning the first slice into a full dashboard framework.

### C. Data access and refresh

- [ ] Define the renderer/main/preload seam needed to fetch or relay admin data for the surface.
- [ ] Keep refresh actions explicit and non-destructive.
- [ ] Handle missing backend/admin data gracefully without destabilizing the main session.

### D. Validation

- [ ] Add Playwright coverage for opening the admin surface.
- [ ] Add Playwright coverage for rendering core data views.
- [ ] Add Playwright coverage for empty/error states.
- [ ] Add Playwright coverage proving the main voice-control window remains stable while the admin surface is used.

## Immediate Coding Order

1. Define the Electron window lifecycle for the admin surface in `src/main/`.
2. Add a minimal admin shell UI and bounded read-only views.
3. Wire refresh/loading/error handling for the first supported admin datasets.
4. Add focused Playwright Electron coverage for the extra window and read-only data states.
5. Run `npm run test:e2e`.

## Current Implementation Baseline

### `src/main/`

- the app already manages the main window and preload bridge
- there is no dedicated admin window or lifecycle yet

### `src/renderer/`

- the main shell focuses on direct mode, managed slots, receive routing, and Commander transmit controls
- there is no separate admin UI surface yet

### `test/e2e/`

- Playwright already drives the Electron app and managed flows
- the next phase can extend that harness to validate a dedicated admin window and its read-only data states

## Explicit Non-Goals For This Slice

- backend schema redesign
- role/permission authoring UI
- NAT integration
- large observability pipelines
- host-protocol redesign without a concrete blocker
