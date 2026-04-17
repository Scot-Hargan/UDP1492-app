# 1492-app Phase 0 Handoff

## Read First

1. `C:\NodeProjects\1492-app\MANAGED_MODE_ADAPTATION_PLAN.md`
2. `C:\NodeProjects\1492-app\PHASE1_REVISED_CHECKLIST.md`
3. `C:\NodeProjects\1492-app\DEVELOPMENT_NOTES.md`
4. `C:\NodeProjects\1492-app\src\renderer\ui.js`
5. `C:\NodeProjects\1492-app\src\renderer\index.html`
6. `C:\NodeProjects\1492-app\src\renderer\style.css`
7. `C:\NodeProjects\1492-app\src\main\main.js`
8. `C:\NodeProjects\1492-app\src\main\preload.js`

## Status Note

Phase 0 is complete.

This handoff remains useful for historical context, but current planning for the next managed-mode slice should be driven by:

- `C:\NodeProjects\1492-app\PHASE1_REVISED_CHECKLIST.md`
- `C:\NodeProjects\1492-app\MANAGED_MODE_ADAPTATION_PLAN.md`

## What Is Already Decided

- Keep the existing UDP peer voice path as the media path.
- Add managed mode as a coordination layer, not a cloud media layer.
- Use the same logical roadmap as `C:\NodeProjects\1492`.
- In this Electron app, the renderer owns app/session state, while main/preload own durable storage and host lifecycle.
- Do not change `src\host\udp_audio1492_host.js` in Phase 0 unless a concrete blocker appears.

## Exact Next Implementation Target

Implement **Phase 0 only** in `1492-app`.

That means:

1. Add `AppStateV2` scaffolding to `src\renderer\ui.js`.
2. Add non-destructive storage migration for:
   - `udp1492_app_state_v2`
   - `udp1492_managed_profile`
   - `udp1492_managed_cache`
   while preserving current direct-peer keys.
3. Centralize host `configure` payload assembly in `src\renderer\ui.js`.
4. Add a managed-mode shell UI to `src\renderer\index.html` and `src\renderer\style.css`.
5. Add mode switching in the renderer.
6. Keep direct-peer behavior working.
7. Do not implement backend API calls yet.
8. Do not implement Group B, dual-ear routing, Commander Mode, admin UI, or NAT workflows yet.

## Important Electron-Specific Constraints

- Persist state only through the preload bridge in `src\main\preload.js`.
- Respect serialized storage writes in `src\main\main.js`.
- Do not bypass main-process storage with direct file I/O from the renderer.
- Keep test hooks intact.

## Practical First Coding Order

1. Add new storage key constants and `AppStateV2` helpers in `src\renderer\ui.js`.
2. Update `loadSaved()` to synthesize `AppStateV2` from existing keys when missing.
3. Add centralized helpers for:
   - operating mode
   - direct vs managed transport peers
   - full host configure payload
   - peer add/remove deltas
4. Add managed-mode shell markup in `src\renderer\index.html`.
5. Add managed-mode shell styles in `src\renderer\style.css`.
6. Wire the mode selector to renderer state.
7. Gate direct-only controls when managed mode is active.
8. Run:
   - `node --check src\\renderer\\ui.js`
   - `npm run test:e2e`
   if feasible after the changes.

## Success Criteria For This Phase

- The app starts and still restores existing peers.
- Direct-peer mode still functions.
- A managed-mode shell exists visually.
- `AppStateV2` exists and is persisted.
- Host config assembly is centralized and ready for later managed peer adaptation.
