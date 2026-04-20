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

- Run `npm run test:backend` after meaningful Cloudflare Worker / Durable Object changes.
- Run `npm run test:e2e` after meaningful UI/main-process changes.
- Run `npm run test:e2e:live-backend` after changes that affect the desktop client to Worker integration seam.
- Run `npm run test:e2e:cloudflare` when you need a baseline smoke check against the hosted Cloudflare backend.
- After a complete slice passes its intended validation, update the online GitHub repo before stopping.
- E2E tests use Playwright Electron fixtures in `test/e2e/fixtures.js`.
- The dedicated live-backend lane is configured in `playwright.live.config.js` and owns local `wrangler dev` lifecycle through Playwright `webServer`.
- The dedicated hosted-backend smoke lane is configured in `playwright.cloudflare.config.js` and targets the repo-local or env-configured Cloudflare backend URL without starting a local Worker.
- Keep the hosted Cloudflare lane bounded and reliable. It currently covers:
  - managed session open
  - lobby/channel load
  - Alpha join/leave
  - protected Bravo passcode enforcement
  - one real peer-resolution path against hosted presence
- Backend unit tests use `backend/wrangler.test.toml` so expiry-sensitive lifecycle cases can run against short TTLs without changing deploy defaults.
- The live-backend lane now also covers real dual-slot Alpha/Bravo membership and Group B leave-preservation; keep new live tests focused on backend truth rather than replaying the full mock suite.
- Keep the default `npm run test:e2e` suite mock-based and stable; do not fold live Worker startup into the shared Electron fixture path.
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
- `.udp1492.local.json`
  - optional gitignored repo-local development config file
  - supports `managedBackendUrl`, `managedRequestTimeoutMs`, `managedLocalAddresses`, and `managedStunServerUrls`
  - env vars still override this file when both are present
  - the hosted Cloudflare smoke lane also uses this file when `UDP1492_MANAGED_BACKEND_URL` is not set
- `udp1492.runtime.json`
  - packaged/runtime sidecar config for non-dev use
  - the app looks for it next to the packaged executable first, then in `userData`
  - supported keys are `managedBackendUrl`, `managedRequestTimeoutMs`, `managedLocalAddresses`, and `managedStunServerUrls`
  - env vars still override the sidecar when both are present
  - this is the preferred direction for future helper setup, QR-assisted bootstrap, and import/export flows

## Backend workspace

- The Cloudflare backend scaffold now lives in `backend/`.
- Current bootstrap files include:
  - `backend/wrangler.toml`
  - `backend/src/index.ts`
- Durable Object bindings currently configured there are:
  - `CHANNEL_DO` -> `ChannelDO`
  - `DIRECTORY_DO` -> `DirectoryDO`
- Treat `backend/.wrangler/` as local Cloudflare state, not as a durable decision record.
- Keep the backend coordination-only:
  - no voice/data relay path
  - no content storage
  - no host-protocol redesign unless a concrete blocker appears

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
- Test-only managed lifecycle hooks now live behind `window.udp1492ManagedDebug` in `src/renderer/ui.js`.
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
  - `PHASE7_NAT_INTEGRATION_CHECKLIST.md`
  - `PHASE8_BACKEND_FOUNDATION_CHECKLIST.md`
  - `PHASE11_MANAGED_ADMIN_DIRECTORY_CHECKLIST.md`
  - `PHASE12_LOCAL_KNOWLEDGE_RETENTION_CHECKLIST.md`
  - `PHASE13_FRIENDS_AND_PRESENCE_CHECKLIST.md`
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
