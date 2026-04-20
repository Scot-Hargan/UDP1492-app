# UDP 1492 Desktop

Standalone Electron offshoot of the browser-based `1492` application from `C:\NodeProjects\1492`.

Source repository: <https://github.com/Scot-Hargan/UDP1492-app>

Windows downloads: <https://github.com/Scot-Hargan/UDP1492-app/releases>

See [DEVELOPMENT_NOTES.md](/C:/NodeProjects/1492-app/DEVELOPMENT_NOTES.md) before making further feature changes or release builds.

## Current Shape

- `src/main/` contains the Electron shell and preload bridge.
- `src/renderer/` contains the migrated control UI and audio worklet.
- `src/host/` contains the UDP/crypto host, now able to run over Electron IPC as well as the original native-messaging framing.

## Local Run

```powershell
npm install
npm start
```

## Windows Distributables

Single-file outputs are now wired through `electron-builder`.

```powershell
npm run dist:win:portable
npm run dist:win:nsis
```

Artifacts are written to `dist/`:

- `UDP 1492 Desktop-Portable-<version>.exe`: single-file portable app.
- `UDP 1492 Desktop-Setup-<version>.exe`: single-file one-click installer.
- `udp1492.runtime.example.json`: sidecar template for managed-backend runtime configuration.
- GitHub release uploads are automated for version tags that match `v*`.

## E2E Fixtures

Playwright Electron smoke tests and storage fixtures live under `test/`.

```powershell
npm run test:e2e
```

Fixture notes:

- `test/fixtures/storage/default.json` seeds a minimal default profile.
- `test/fixtures/storage/with-peers.json` seeds peers, active peer selection, theme, and input gain.
- Tests launch the app with an isolated `userData` directory, mock host bridge, and skipped audio capture so the suite is deterministic and safe to tear down.

## Notes

- The original browser-native-messaging dependency has been removed from this offshoot.
- Renderer storage now persists to Electron `userData` through the preload bridge.
- The host/renderer drift around `encryptionEnabled`, `jitterSamplesCount`, and `pingHistoryDuration` has been normalized here.
- Source code is released under the MIT license.
