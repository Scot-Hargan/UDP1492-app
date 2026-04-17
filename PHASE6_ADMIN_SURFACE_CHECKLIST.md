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
- Stage data sources pragmatically for the first slice:
  - reuse existing renderer/session/cache data when it already exists
  - reuse current managed HTTP surfaces where they are sufficient
  - do not block the admin surface on brand-new backend admin endpoints unless a concrete blocker appears
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
- the current managed API client only exposes session open, channel list, join, presence, peer list, and leave flows
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
- [ ] Decide which first-slice admin views can be powered from existing managed session/cache state versus which require additional fetch surfaces.
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
- current shutdown logic assumes one main window and host lifecycle owned from that shell

### `src/renderer/`

- the main shell focuses on direct mode, managed slots, receive routing, and Commander transmit controls
- there is no separate admin UI surface yet
- current managed state already includes useful read-only facts for an initial inspection window:
  - channel lobby cache
  - slot membership state
  - peer resolution / endpoint selection data
  - runtime stats already shown in the main shell

### `src/renderer/managed-api.js`

- current managed HTTP support is limited to:
  - session open
  - channel list
  - join
  - presence
  - peer list
  - leave
- there are no current dedicated admin endpoints in this repo

### `src/main/preload.js`

- the preload bridge already exposes storage, runtime-config, and host lifecycle APIs
- there is no current bridge API for opening or coordinating a second admin window

### `test/e2e/`

- Playwright already drives the Electron app and managed flows
- the next phase can extend that harness to validate a dedicated admin window and its read-only data states

## Concrete Implementation Plan

### 1. Start with a separate admin window, not an in-shell dashboard

The main voice-control shell is already dense.
The first admin slice should open a second `BrowserWindow` rather than widening `src/renderer/index.html` into a mixed operator/admin interface.

Recommended first rule:

- main window stays focused on voice/session control
- admin window stays focused on inspection and refresh
- closing the admin window must not affect transport, session state, or the main renderer lifecycle

### 2. Use staged data sources instead of blocking on new backend admin APIs

The repo does not currently expose dedicated admin HTTP endpoints.
That means the first slice should explicitly allow a staged view model:

- view data already present in the main renderer/runtime model
- view data already obtainable from current managed endpoints
- reserve richer admin-only datasets for a later follow-on if they require backend changes

Recommended first-view priority:

1. managed channels from lobby cache / refresh
2. current slot memberships and presence state
3. resolved peers and endpoint registration state already normalized through peer resolution
4. limited stats already available locally

### 3. Keep the first admin surface read-only and bounded

Do not build editing workflows yet.

The first useful admin window should answer:

- what channels exist
- which slots/channels are active right now
- which peers/endpoints are resolved
- whether presence and peer resolution look healthy
- what limited local stats are visible

That is enough to reduce operator dependence on debug logs without turning the slice into backend administration.

### 4. Define the Electron seam before UI work

Before building the window UI, define:

- how the main window opens the admin window
- whether the admin surface reuses `index.html` with a mode flag or uses a dedicated renderer entrypoint
- what preload APIs are needed for:
  - window open/close
  - admin data snapshot
  - refresh requests

This decision should be locked early because it shapes the test strategy and file layout.

### 5. Validation strategy that matches the repo

The first admin slice should validate window behavior and displayed state, not backend mutation flows.

Recommended validation order:

1. open admin window from the main shell
2. assert the main window remains usable
3. assert the admin window shows the first bounded views
4. assert empty/error states render cleanly when admin data is unavailable
5. assert refresh updates the admin surface without disturbing the main window

## Explicit Non-Goals For This Slice

- backend schema redesign
- role/permission authoring UI
- NAT integration
- large observability pipelines
- host-protocol redesign without a concrete blocker
