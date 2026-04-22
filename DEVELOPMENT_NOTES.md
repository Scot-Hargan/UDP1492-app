# Development Notes

This file is now the short operational companion to the lean docs set.

Read these first:

1. `AI_RULES.md`
2. `CURRENT_TASK.md`
3. `docs/architecture.md`
4. `NEXT_CHAT_HANDOFF.md`

Historical phase records now live in `docs/archive/`.

## Release Discipline

- After code changes intended to ship, bump the version in `package.json`.
- Keep the renderer and host version markers aligned when behavior changes:
  - `src/renderer/ui.js`
  - `src/host/udp_audio1492_host.js`
- Rebuild Windows artifacts with:
  - `npm run dist:win:portable`
  - `npm run dist:win:nsis`
- Do not run the two Windows build targets in parallel.
- Push `main` before tagging a release when you want the repo state and release target to match.
- Pushing a `v*` tag triggers `.github/workflows/windows-release.yml`, which rebuilds and publishes the GitHub release assets.
- Treat the tagged GitHub Actions build as the authoritative public release artifact source.

## Test Lanes

- `npm run test:backend`: backend and Durable Object behavior
- `npm run test:e2e`: default mock-based Electron coverage
- `npm run test:e2e:live-backend`: local Worker plus Electron integration seam
- `npm run test:e2e:cloudflare`: bounded hosted-backend smoke lane

Test harness reminders:

- E2E fixtures live in `test/e2e/fixtures.js`.
- Tests use isolated `userData`, a mock host bridge, and skipped audio capture.
- Close the app in tests with `electronApp.close()`, not by directly tearing down renderer windows.

## Runtime Config

- `UDP1492_MANAGED_BACKEND_URL`
- `UDP1492_MANAGED_REQUEST_TIMEOUT_MS`
- `UDP1492_MANAGED_LOCAL_ADDRESSES`
- `UDP1492_MANAGED_STUN_SERVERS`
- `.udp1492.local.json`
- `udp1492.runtime.json`
- `udp1492.runtime.example.json`

The main process resolves runtime config in this order:

1. environment variables
2. packaged sidecar config
3. repo-local dev config
4. interface-derived local addresses

## Persistence And Test Hooks

- Storage serialization in `src/main/main.js` is a hard constraint.
- Keep test-only hooks behind `UDP1492_TEST_MODE=1`.
- Do not make production behavior depend on `window.udp1492Test`.
