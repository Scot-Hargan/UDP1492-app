# 1492-app Revised Phase 1 Checklist

## Purpose

This checklist records the current desktop-app interpretation of managed-mode Phase 1.

It intentionally narrows the finish line to the standalone Electron client slice.
It does **not** require a live Cloudflare deployment to declare the client phase complete.

## Current Position

Phase 0 is complete.

Most of the original Phase 1 client surface is already implemented:

- managed API client layer in the renderer
- session open
- channel list
- channel join / leave
- presence heartbeat
- peer resolution
- transport peer adaptation into host `configure.peers`
- managed-mode persistence through the existing preload/main storage path
- runtime-config fallback for managed backend URL and request timeout

The remaining work is now correctness and desktop-specific integration work, not broad new surface area.

## Revised Phase 1 Finish Line

Phase 1 is complete when all of the following are true:

1. Managed mode can open or reopen a session without stale backend/profile state leaking across environments.
2. Switching from one managed channel to another is non-destructive if the replacement join fails.
3. Managed presence publishes a usable desktop transport endpoint so other peers can resolve this client.
4. Managed peer resolution continues adapting into the existing UDP host path without changing host protocol shape.
5. The above behaviors are covered by Playwright Electron tests.

## Remaining Checklist

### A. Session and channel correctness

- [ ] `Open Session` must force a fresh session when the operator intentionally reopens managed mode after changing backend configuration or identity fields.
- [ ] Joining a replacement channel must not tear down the currently joined channel until the replacement join succeeds.
- [ ] Session-expiry and membership-loss recovery paths should keep renderer state consistent and non-destructive.

### B. Desktop-native endpoint publication

- [ ] Expose a runtime transport snapshot from desktop shell / host control into the renderer.
- [ ] Replace the placeholder `buildManagedPresenceEndpoints()` behavior with a real endpoint payload.
- [ ] Prefer desktop-known transport facts over extension-era assumptions.
- [ ] Keep the host channel-agnostic even while exposing the minimum data needed for managed presence.

### C. Validation and regression coverage

- [ ] Add an end-to-end test proving a failed channel switch preserves the original membership.
- [ ] Add an end-to-end test proving managed presence publishes an endpoint payload.
- [ ] Add an end-to-end test proving explicit session reopen does not reuse stale session state across backend/profile changes.

## Desktop-First Planning Decisions

These decisions supersede extension-oriented assumptions when they conflict with the Electron app's needs.

### 1. Standalone runtime data is a feature, not a workaround

The desktop app directly owns:

- host lifecycle
- preload IPC
- durable storage behavior
- runtime configuration
- future transport diagnostics

That means Phase 1 and later phases should prefer desktop-native seams where they improve correctness.

### 2. Backend deployment work is not on the Phase 1 critical path

The client phase is complete when the desktop app correctly implements the documented managed contract and can be validated against mocks or a test target.

Building or deploying the Cloudflare backend is parallel work, not a requirement for closing the desktop client milestone.

### 3. Backend configuration should move toward app-level runtime config

The renderer field is still useful for development and overrides, but the standalone app should treat runtime/app config as the primary durable configuration surface over time.

### 4. Endpoint publication should be desktop-native

The renderer should not stay stuck with browser-era limitations if the desktop shell and host can provide better transport information.

### 5. Keep the native host protocol stable for Phase 1

Managed mode should continue adapting into the host's existing peer-oriented `configure` payloads unless a concrete protocol blocker appears.

## Planned Follow-On After Phase 1

Once the Phase 1 checklist above is complete, the next cleanup slice should be a small standalone-first refactor:

- extract managed orchestration out of `src/renderer/ui.js` into a dedicated controller/module
- formalize the runtime transport info bridge for presence publication
- make app-level backend configuration the primary source, with renderer override as a secondary path

That refactor should happen before broadening the scope to:

- Group B
- dual-ear routing
- Commander Mode
- admin surface
- NAT integration
