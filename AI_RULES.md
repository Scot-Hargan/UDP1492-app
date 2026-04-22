# AI Rules

Read these first, in order:

1. `AI_RULES.md`
2. `CURRENT_TASK.md`
3. `docs/architecture.md`
4. `NEXT_CHAT_HANDOFF.md`

Open `docs/archive/` or `MANAGED_MODE_ADAPTATION_PLAN.md` only when the current docs are insufficient.

## Immutable Rules

- Keep the product coordination-only. The backend may coordinate sessions, channels, permissions, and presence, but it must not become a media relay, TURN dependency, or content storage unless explicitly requested.
- Preserve the peer-to-peer voice path. Media and transport stay between peers; managed mode is a control plane.
- Treat `src/host/udp_audio1492_host.js` as a transport component, not an application-state component. Do not modify it unless there is a concrete blocker or an explicit request.
- Do not redesign the host protocol casually. Extend renderer, main-process, or backend logic first.
- Do not persist channel join passcodes in desktop storage. Transient join passcodes may exist only in runtime memory long enough to complete a join attempt.
- Phase 11 backend administration must not store protected-channel passcodes in plaintext. Use a one-way verification scheme.

## Ownership Boundaries

- `src/host/udp_audio1492_host.js`: UDP transport, handshake, encryption, packet stats, and transport-level peer state only.
- `src/main/main.js`: window lifecycle, storage serialization, runtime config loading, host child-process lifecycle, and quit sequencing.
- `src/main/preload.js`: the only supported renderer bridge for storage, admin IPC, and host IPC.
- `src/renderer/`: app shell, managed/direct mode, admin UI consumption, peer adaptation, NAT/runtime state, and user workflow.
- `backend/src/index.ts`: managed coordination APIs, directory/channel durable state, and permission/admin logic.

## State Rules

- Durable operating intent belongs in desktop storage, primarily `udp1492_app_state_v2`, `udp1492_managed_profile`, and `udp1492_managed_cache`.
- Live managed facts such as current session ID, current membership status, presence freshness, resolved peers, and NAT probe state stay runtime-only unless a phase explicitly promotes them to durable state.
- Main-process storage sequencing in `src/main/main.js` is authoritative. Do not bypass it with direct renderer file I/O.
- `managedProfile.preferredChannelId` is compatibility data. Slot intent in `udp1492_app_state_v2.managed.slots.A/B` is the authoritative durable channel-selection model.

## Documentation Rules

- Keep `CURRENT_TASK.md` focused on the active slice only.
- Keep `NEXT_CHAT_HANDOFF.md` as a terse state tracker, not a narrative history.
- Put completed phase artifacts in `docs/archive/`.
- Record durable architecture decisions in `docs/decisions/`.

## Validation Rules

- Run `npm run test:backend` after meaningful backend or Durable Object changes.
- Run `npm run test:e2e` after meaningful renderer or Electron main/preload changes.
- Run `npm run test:e2e:live-backend` when changing the desktop-to-backend integration seam.
- Run `npm run test:e2e:cloudflare` only for the bounded hosted-backend smoke lane.
