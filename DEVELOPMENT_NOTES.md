# Development Notes

Check this file before making further code changes.

## Release discipline

- After any code change intended to ship, bump the app version in `package.json`.
- Keep renderer/host version markers in sync when behavior changes:
  - `src/renderer/ui.js`
  - `src/host/udp_audio1492_host.js`
- Rebuild distributables after shipping changes:
  - `npm run dist:win:portable`
  - `npm run dist:win:nsis`
- Do not run the portable and NSIS builds in parallel. `electron-builder` can collide on shared `dist/` intermediates.

## Test discipline

- Run `npm run test:e2e` after meaningful UI/main-process changes.
- After a complete slice passes its intended validation, update the online GitHub repo before stopping.
- E2E tests use Playwright Electron fixtures in `test/e2e/fixtures.js`.
- Tests launch the app with:
  - isolated `userData`
  - mock host bridge
  - skipped audio capture
- For teardown, close the Electron app through `electronApp.close()`.
- Do not rely on closing renderer windows directly in tests. That was a source of unstable runs.

## Persistence precautions

- App storage writes are serialized in `src/main/main.js`.
- Do not replace that with naive read-modify-write calls from multiple concurrent IPC handlers, or peer persistence can regress.
- Packaged builds now use a stable `userData` directory name instead of relying on Electron defaults.
- Storage is read as a merged view across current and likely legacy app-data locations.
- Writes are mirrored back to those locations so upgrades and old shortcuts do not strand peer data.
- Peer persistence depends on both:
  - `udp1492_peers`
  - `udp1492_last_peers`
- Startup now falls back to restoring saved peers when `udp1492_last_peers` is missing, so saved peers remain visible after restart.

## Packaging / Windows

- Current Windows artifacts are single-file `.exe` outputs from `electron-builder`.
- The app still uses the default Electron icon.
- Release code-signing is not configured yet.
- `appId` / AUMID is set and should stay stable for future Store work.

## Current test hooks

- Test-only hooks are exposed through `window.udp1492Test`.
- They are guarded by:
  - `UDP1492_TEST_MODE=1`
  - `UDP1492_TEST_MOCK_HOST=1`
  - `UDP1492_TEST_SKIP_AUDIO=1`
  - `UDP1492_USER_DATA_DIR=<path>`
- Keep those hooks test-only. Do not make production behavior depend on them.

## Managed runtime config

- `UDP1492_MANAGED_BACKEND_URL`
  - optional app-level default backend base URL for managed mode
- `UDP1492_MANAGED_REQUEST_TIMEOUT_MS`
  - optional managed HTTP timeout override
- `UDP1492_MANAGED_LOCAL_ADDRESSES`
  - optional comma-separated override for desktop local endpoint addresses used in managed presence payloads

## Workspace reminders

- This workspace root is the git repository at `C:\NodeProjects\1492-app`.
- Prefer additive refactors around `src/renderer/ui.js`; preserve behavior and keep modules compatible with richer future features.

## Managed renderer structure

- Managed API contract normalization lives in `src/renderer/managed-api.js`.
- Managed runtime config and endpoint helpers live in `src/renderer/managed-runtime.js`.
- Managed session/channel/presence orchestration now lives in `src/renderer/managed-controller.js`.
- The Phase 6 admin surface now lives in:
  - `src/renderer/admin.html`
  - `src/renderer/admin.js`
  - `src/main/main.js` admin-window lifecycle and state relay
  - `src/main/preload.js` admin open/state/refresh bridge
- `src/renderer/ui.js` should remain the rendering and app-shell coordination layer, not the long-term home for all managed-mode control flow.
- `udp1492_app_state_v2` should persist durable operating-mode and slot-intent state only.
- Live managed session facts such as current session ID, membership status, presence, and resolved transport peers should stay runtime-only and be rebuilt on resume.

## Planning discipline

- Keep the planning artifacts current when milestone scope or architecture decisions change:
  - `MANAGED_MODE_ADAPTATION_PLAN.md`
  - `PHASE1_REVISED_CHECKLIST.md`
  - `PHASE2_CLIENT_CHECKLIST.md`
  - `PHASE3_GROUPB_CHECKLIST.md`
  - `PHASE4_DUAL_EAR_ROUTING_CHECKLIST.md`
  - `PHASE5_COMMANDER_MODE_CHECKLIST.md`
  - `PHASE6_ADMIN_SURFACE_CHECKLIST.md`
  - `PHASE0_HANDOFF.md` when historical context needs redirect notes
  - `NEXT_CHAT_HANDOFF.md` when the active slice, validation baseline, or continuation target changes
- When a phase closes and there is no new checklist yet, update the closed checklist as a validation record and note the next planning gap explicitly in `NEXT_CHAT_HANDOFF.md`.
- Treat documentation updates as part of the decision record so future implementation work can recover the rationale from Git history.
- Prefer expanding the active phase checklist with concrete file-level implementation notes over creating redundant one-off planning documents.
- Delete planning documents only when they are clearly obsolete and no longer useful as a decision record. Historical phase checklists should usually stay.
- For managed mode in the desktop app, prefer standalone-first decisions when they improve correctness:
  - app/runtime config over renderer-only configuration
  - desktop-native transport/endpoint data over extension-era placeholders
  - Electron IPC seams over browser-native-messaging assumptions
