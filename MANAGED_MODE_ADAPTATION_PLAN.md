# 1492 Desktop Managed Mode Adaptation Plan

## Intent

This document adapts the managed-mode planning baseline from `C:\NodeProjects\1492` to the standalone Electron application in `C:\NodeProjects\1492-app`.

The product direction does not change:

- Keep the existing UDP peer voice path as the primary media path.
- Add a managed network mode backed by Cloudflare Durable Objects.
- Keep cloud services focused on coordination, discovery, status, metadata, administration, and limited observability.
- Do not redesign the product around a cloud media relay.

NAT workflow details remain deferred. The adapted plan leaves the state, schema, and API surfaces ready for that later work.

## Project-Specific Adaptation Summary

The desktop app has the same core voice/runtime model as the extension version, but the implementation seams are different.

### What stays the same

- Channel-centered product model
- Direct mode plus managed mode
- Two-group roadmap with Group A and Group B
- Commander Mode first
- Per-channel security mode
- Admin dashboard requirement
- Channel-scoped peer endpoint visibility
- Same Phase 0 / Phase 1 / later-phase ordering

### What changes in the Electron app

#### 1. Renderer replaces extension UI shell

Primary file:

- `src/renderer/ui.js`

The renderer now owns:

- operating mode
- managed session state
- peer adaptation into host config
- mode switching
- managed UI shell

This is the direct counterpart to `extension/ui.js` in the browser version.

#### 2. Storage durability is controlled by Electron main process

Primary file:

- `src/main/main.js`

The renderer persists through the preload bridge, but `main.js` is the actual authority for durable storage behavior. It already:

- serializes writes
- merges likely legacy storage locations
- mirrors writes back to those locations
- preserves peer and last-peer state across upgrades

That means storage migration planning must preserve these guarantees and must not bypass main-process storage sequencing.

#### 3. Preload bridge replaces browser extension APIs

Primary file:

- `src/main/preload.js`

The renderer uses:

- `window.udp1492.storageGet`
- `window.udp1492.storageSet`
- `window.udp1492.startHost`
- `window.udp1492.sendHostMessage`
- `window.udp1492.stopHost`

Managed-mode work in the renderer should continue using this bridge instead of introducing direct Node access.

#### 4. Embedded host bridge replaces native messaging boundary

Primary files:

- `src/main/main.js`
- `src/host/udp_audio1492_host.js`

The product intent is unchanged: the host remains transport-oriented and channel-agnostic. The difference is only that Electron starts and controls it through IPC instead of browser native messaging.

## Adapted Architecture Layers

### 1. Transport layer

Files:

- `src/host/udp_audio1492_host.js`

Responsibilities:

- peer transport
- handshake
- encryption
- packet send/receive
- low-level packet stats

Rule:

- Keep this layer unaware of channels, managed presence, permissions, or admin concepts.

### 2. Desktop shell layer

Files:

- `src/main/main.js`
- `src/main/preload.js`

Responsibilities:

- BrowserWindow lifecycle
- host process lifecycle
- durable storage reads/writes
- preload API surface
- future managed backend configuration surface if needed

Rule:

- Keep durable storage serialization and cross-version migration behavior in `main.js`.

### 3. Client session layer

Files:

- `src/renderer/ui.js`
- `src/renderer/index.html`
- `src/renderer/style.css`
- renderer helper modules

Responsibilities:

- operating mode
- channel membership state
- group slot state
- mic mode and mute state
- peer resolution and adaptation
- managed-mode UI

Rule:

- This is the correct layer for `AppStateV2` and managed-mode orchestration.

### 4. Managed coordination layer

New backend package outside the current app runtime.

Responsibilities:

- channels
- presence
- permissions
- endpoint registration
- peer discovery
- admin data
- limited observability

Rule:

- Same backend contract as the extension version, reused here.

## Phase Ordering For The Desktop App

The same phase order applies.

### Phase 0

- Introduce `AppStateV2` in `src/renderer/ui.js`
- Add mode-switch foundation
- Add managed-mode shell UI
- Centralize host-config assembly
- Preserve current direct-peer behavior

### Phase 1

- Add managed API client layer in renderer
- Add session open / channel list / join / leave / presence / peer resolution flow
- Adapt resolved peers into host `configure` payloads

## Revised Phase 1 Interpretation For The Desktop App

The original extension roadmap remains the baseline, but the desktop app should treat Phase 1 as a client milestone, not a backend deployment milestone.

### Current status

As of the current implementation:

- Phase 0 is complete
- the revised standalone desktop Phase 1 client slice is complete
- Cloudflare/backend deployment work remains parallel and intentionally outside the Phase 1 client closeout definition

### Revised Phase 1 finish line

For `1492-app`, Phase 1 should be considered complete when the desktop client:

1. opens or reopens managed sessions cleanly
2. joins and leaves a single managed channel without destructive switching behavior
3. publishes a usable transport endpoint through managed presence
4. resolves peers and adapts them into the existing UDP host `configure.peers` path
5. has Playwright Electron coverage for those behaviors

### Explicit non-goal for closing desktop Phase 1

Do not require a live Cloudflare deployment to declare the desktop client slice complete.

The backend workspace and deployment remain important, but they are parallel work and should not block the client milestone.

### Planning artifact

The concrete closeout checklist and closeout record now live in:

- `C:\NodeProjects\1492-app\PHASE1_REVISED_CHECKLIST.md`

The completed protected-channel client slice is recorded in:

- `C:\NodeProjects\1492-app\PHASE2_CLIENT_CHECKLIST.md`

The next active desktop-client implementation plan should be driven by:

- `C:\NodeProjects\1492-app\PHASE3_GROUPB_CHECKLIST.md`

### Standalone-first decisions

The Electron app should now prefer the following when they improve correctness:

- app/runtime config over renderer-only backend URL entry
- desktop-native endpoint publication over browser-era placeholder behavior
- Electron IPC seams over extension-native-messaging assumptions
- preserving the current host protocol shape unless a concrete blocker appears

### Phase 2

Phase 2 client security work is complete in the desktop app:

- per-channel security metadata is rendered explicitly in the lobby
- protected joins require a passcode without persisting it
- failed protected-channel switches preserve the active membership
- protected intended-channel resume is explicit and recoverable
- Playwright coverage exists for the protected-channel closeout cases

### Phase 3+

The next active client milestone should now progress in this order:

- `Phase 3`: activate `Group B` as a first-class managed slot
- dual-ear routing after two-slot membership is stable
- Commander Mode
- admin surface
- NAT integration

### Immediate standalone-first cleanup before broader Phase 2/3 work

This cleanup is now complete in the desktop app:

- durable `AppStateV2` now focuses on operating mode and managed slot intent
- `Group A` and `Group B` slot records are present even while only `Group A` is active
- live session IDs, transient membership state, presence state, and resolved peer data are no longer persisted in `udp1492_app_state_v2`

This keeps the Electron client aligned with the original roadmap and reduces stale-state risk before full two-slot runtime behavior expands the model.

### Immediate standalone-first planning target after Phase 2

The next focused implementation target should be:

- make `Group B` explicit in the managed shell
- generalize managed runtime slot behavior beyond `Group A`
- preserve non-destructive per-slot join / leave / resume / recovery behavior
- adapt one or two active slots into the existing host peer configuration path

That work is intentionally captured in `PHASE3_GROUPB_CHECKLIST.md` before any routing or Commander-specific behavior is added.

### Current Phase 3 client status

The Group B client slice is now complete on the desktop side and includes:

- explicit slot targeting for `Group A` and `Group B` in the managed shell
- slot-parameterized managed controller flows
- slot-scoped transient passcodes
- slot-scoped runtime peer storage with aggregated host adaptation
- Playwright coverage for Group B join, dual-slot membership, slot-isolated leave/failure behavior, overlapping-peer dedupe, and protected Group B resume

The Phase 3 desktop-client milestone is therefore closed. Follow-on work should move to the next product phase rather than reopening Group B slot activation unless a regression appears.

## Renderer State Model Adaptation

The same `AppStateV2` model should be used in the Electron renderer, with one project-specific note:

- durable state still lives in the renderer model
- actual persistence is mediated through `window.udp1492.storageSet`
- `src/main/main.js` remains responsible for write ordering and mirrored persistence

Recommended canonical key names remain the same:

- `udp1492_app_state_v2`
- `udp1492_managed_profile`
- `udp1492_managed_cache`

That consistency is useful because the Electron app is an offshoot of the original project and the same logical model should apply.

## Storage Migration Adaptation

### Current Electron storage behavior that must be preserved

`src/main/main.js` already provides important guarantees:

- serialized writes via `storageWriteQueue`
- merged reads across likely legacy directories
- mirrored writes back to storage copies
- merge logic for:
  - `udp1492_peers`
  - `udp1492_last_peers`

The managed-mode migration must preserve these behaviors.

### Adapted migration rule

Do not move migration logic into the main process first.

Instead:

- keep `main.js` as the durability layer
- perform `AppStateV2` synthesis in `src/renderer/ui.js`
- persist new keys through preload storage APIs
- continue writing legacy peer keys during migration

This matches the extension plan while respecting Electron's storage architecture.

### Adapted persistence rule

Persist through main-process storage:

- `udp1492_app_state_v2`
- `udp1492_managed_profile`
- `udp1492_managed_cache`
- existing legacy keys during transition

Do not bypass the preload bridge for storage work.

## Host-Config Adapter Adaptation

The same adapter rule applies in the desktop renderer.

### Renderer-owned adapter boundary

`src/renderer/ui.js` should translate:

- direct peer records, or
- managed `ResolvedPeer[]`

into:

- host `configure.peers`

The host remains unaware of:

- `channelId`
- `slotId`
- `userId`
- `sessionId`
- admin metadata

### Electron-specific note

In the desktop app, this adapter ultimately calls:

- `window.udp1492.sendHostMessage(...)`

instead of browser native messaging.

That changes the transport boundary location but not the contract shape.

## Managed UI Adaptation

The same first managed UI slice should be added to:

- `src/renderer/index.html`
- `src/renderer/style.css`
- `src/renderer/ui.js`

### First managed UI slice for the desktop app

- mode selector
- managed identity card
- channel lobby
- active Group A card
- direct-only peer controls hidden when managed mode is active

This is a direct adaptation of the extension Phase 0 shell, but it belongs in the renderer HTML/CSS instead of extension resources.

## Main-Process Considerations Unique To Electron

### 1. Backend configuration surface

Later managed-mode work will likely need a configurable backend base URL.

Recommended location:

- store backend URL and related non-secret environment info through the same app storage path or an Electron-controlled config source

Do not hardcode deployment-specific backend URLs deep inside renderer logic.

### 2. Window model for future admin UI

The desktop app can support the admin requirement in two Electron-native ways:

- separate BrowserWindow for admin
- docked renderer panel inside the main window

Recommended first desktop interpretation:

- use a docked panel first for development speed
- keep a separate window as a later option if the workflow needs it

This is slightly different from the extension version because Electron has fewer surface limitations.

### 3. Test harness integration

The existing Playwright Electron setup is an advantage.

Managed-mode additions should preserve:

- test-only hooks in preload
- isolated `userData`
- mock host support
- no hard dependency on live audio capture during tests

The managed-mode renderer work should add test-friendly seams rather than ad hoc globals.

## Concrete File Mapping

### Original extension project

- `extension/ui.js`
- `extension/control.html`
- `extension/style.css`
- browser storage APIs
- native messaging bridge

### Desktop adaptation

- `src/renderer/ui.js`
- `src/renderer/index.html`
- `src/renderer/style.css`
- preload storage bridge
- Electron host bridge

### New responsibilities in desktop app

- `src/main/main.js`
  - preserve serialized storage semantics
  - later host any backend config or multi-window admin wiring

- `src/main/preload.js`
  - remain the renderer boundary for storage and host IPC
  - later expose managed test hooks if needed

## Implementation Order For 1492-app

### First slice for this repo

1. Add `AppStateV2` scaffolding to `src/renderer/ui.js`
2. Add storage migration bootstrap using preload storage APIs
3. Add mode-switch foundation in renderer
4. Add managed-mode shell to `src/renderer/index.html` and `src/renderer/style.css`
5. Centralize host `configure` payload assembly in renderer
6. Keep `src/host/udp_audio1492_host.js` unchanged unless blocked

### Second slice for this repo

1. Add managed API client methods in renderer
2. Add single-channel managed join / leave / heartbeat / peer resolution flow
3. Adapt resolved peers into host config
4. Add renderer-side cleanup timers and reconnect handling

## Acceptance Criteria For Adapted Planning

This adaptation is complete when the desktop project is understood as:

- the same product roadmap
- the same managed-mode state and API model
- a different storage/runtime boundary through Electron main/preload
- the same transport rule that the host stays channel-agnostic

## Immediate Next Implementation Target For 1492-app

The next coding target for this repo should be:

- `Phase 3` Group B activation only
- explicit slot targeting in the managed shell
- slot-local runtime state and recovery for `A` and `B`
- deterministic dual-slot peer adaptation into the current host `configure.peers` path

That should happen before dual-ear routing, Commander Mode, admin work, or backend redesign.
