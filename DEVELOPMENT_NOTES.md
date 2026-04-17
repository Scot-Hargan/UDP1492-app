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

## Workspace reminders

- This workspace root is not a git repository, so do not assume `git status` is available here.
- Prefer additive refactors around `src/renderer/ui.js`; preserve behavior and keep modules compatible with richer future features.

## Planning discipline

- Keep the planning artifacts current when milestone scope or architecture decisions change:
  - `MANAGED_MODE_ADAPTATION_PLAN.md`
  - `PHASE1_REVISED_CHECKLIST.md`
  - `PHASE0_HANDOFF.md` when historical context needs redirect notes
- Treat documentation updates as part of the decision record so future implementation work can recover the rationale from Git history.
- For managed mode in the desktop app, prefer standalone-first decisions when they improve correctness:
  - app/runtime config over renderer-only configuration
  - desktop-native transport/endpoint data over extension-era placeholders
  - Electron IPC seams over browser-native-messaging assumptions
