# 1492-app Phase 13 Friends And Presence Checklist

## Purpose

This phase turns the earlier backend/admin and local-knowledge work into the first real **friend-finding and online/offline presence** product slice.

It corresponds most directly to the original product goals around:

- friend finding
- user online/offline status
- managed-assisted coordination that still avoids media relay

## Scope

Phase 13 should cover:

- bounded friend/contact concepts
- friend-oriented online/offline presence beyond only current channel membership
- a desktop surface for viewing and acting on friend presence
- using retained local knowledge plus backend coordination together, without making the backend the sole owner of the user's usable peer graph

## Product Intent Carried Forward

This phase must preserve the same philosophy:

- no media relay
- no content storage
- no requirement that the provider own all useful metadata forever
- direct/private operation should remain possible even when managed services are absent

## Dependencies

Phase 13 should not become the active implementation phase until:

1. Phase 10 core managed coordination is stable.
2. Phase 11 admin/directory/channel management exists or is sufficiently defined.
3. Phase 12 local knowledge retention exists or is far enough along that friend UX is not forced to depend entirely on backend state.

Those conditions are now met.

## Phase 12 Inputs Now Available

Phase 12 materially changed what Phase 13 can safely build on.

The first friend/presence slice can now rely on:

- a local-first retained-knowledge store in `udp1492_local_knowledge_v1`
- stable managed `userId` observations captured from managed peer refresh
- explicit direct-mode import of retained managed endpoints
- an admin inspection surface for retained peer provenance and timestamps
- a bounded local forget path for retained-only entries
- backend-authored managed session, directory, membership, and presence TTL facts that already exist without media relay

The important implication is:

- Phase 13 does not need the backend to become the permanent owner of the user's usable peer graph
- the first friend presence slice can stay local-first and query the backend only for live presence over explicitly chosen contacts

## Target Outcomes

This phase should deliver:

- a bounded friend/contact model
- backend-assisted online/offline status for friends
- desktop friend presence views
- fast jump paths from a friend entry into:
  - managed channels
  - direct endpoint reuse
  - future invitation/workflow hooks if added later

## Suggested Capability Boundaries

The first friend/presence slice should stay simple:

- explicit allow-list / trusted contacts first
- no global public directory by default
- no hidden auto-discovery of strangers
- bounded online/offline and availability facts rather than rich activity telemetry

## Recommended Authority Split

Authority should remain explicit:

- the desktop should be authoritative for the bounded friend/contact roster the operator maintains
- retained local knowledge should remain authoritative for reusable endpoint and identity observations
- the backend should be authoritative only for live managed presence/session facts
- friend presence should enrich the desktop view without deleting or replacing retained knowledge

Additional guardrails should stay explicit:

- removing a friend should not silently erase retained knowledge unless the operator explicitly chooses both actions
- backend presence should be requested only for explicitly stored friends, not for an open-ended directory
- friend presence should expose only bounded facts needed for coordination, not rich activity history

## Recommended First Schema Target

The first friend model should stay conservative:

- storage key: `udp1492_friends_v1`
- top-level structure:
  - `version`
  - `friends`
- friend records should start with:
  - `friendId`
  - `displayName`
  - `managedUserId`
  - `linkedPeerId`
  - `sources`
  - `notes`
  - `pinned`
  - `lastPresenceState`
  - `lastPresenceAt`

The important relationship is:

- the friend roster is not a replacement for `udp1492_local_knowledge_v1`
- friend entries should link to retained peers where possible instead of duplicating endpoint state

## Suggested First Backend Direction

The most privacy-bounded backend addition is:

- one minimal friend presence query over an explicit allow-list of managed user IDs

The first contract should prefer:

- request:
  - `sessionId`
  - a bounded list of `managedUserId` values already chosen locally by the operator
- response:
  - `managedUserId`
  - `displayName`
  - `onlineState`
  - `lastSeenAt`
  - bounded optional coordination hints such as visible active channel summaries when policy allows

The backend should not need to own a global social graph in the first slice.

## Finish Line

Phase 13 should be considered complete when all of the following are true:

1. The user can maintain a bounded friend/contact list.
2. The desktop app can show friend online/offline status through managed coordination.
3. Friend data and presence do not erase or replace the local retained-knowledge layer.
4. Tests cover the first friend presence flows.
5. The implementation remains privacy-bounded and coordination-only.

## Recommended Implementation Order

1. Define the friend/contact data model and authority split.
2. Add the minimal backend contract for friend presence/status.
3. Connect the backend status model to the local retained-knowledge model.
4. Add the bounded desktop friend presence surface.
5. Add tests before broadening the social layer further.

## Recommended Slice Plan

The most defensible Phase 13 path is:

### Slice 1: local friend roster and retained-knowledge linkage

- add `udp1492_friends_v1`
- keep the friend roster local-first
- link friend entries to retained peers by `managedUserId` or retained `peerId`
- keep friend labels/notes separate from endpoint observations

### Slice 2: bounded backend friend presence query

- add one backend endpoint for explicit friend presence lookup
- avoid backend-owned friend graph complexity in the first slice
- return only bounded online/offline and last-seen facts plus narrow coordination hints

### Slice 3: desktop friend presence surface

- expose a friend list in the desktop UI
- show online/offline state, last seen, and retained-knowledge linkage
- keep the first surface readable and actionable without turning into a social feed

### Slice 4: action hooks

- add a fast path from a friend entry to direct retained-endpoint import when available
- add a bounded managed jump path when a visible active channel hint exists
- keep all actions operator-driven and provenance-visible

## Explicit Non-Goals

- a public social network
- relay messaging/media
- broad activity feeds
- invasive telemetry
- central-provider lock-in for usable direct connection knowledge

## Risks To Watch

- building friend presence before local retained knowledge exists
- overexposing presence metadata
- conflating channel membership with broader friend presence semantics
- allowing friend UX to become backend-dependent in a way that undermines direct-mode goals

## Expected Primary Files

- future backend friend/presence routes in `backend/src/index.ts`
- future backend tests in `backend/test/backend.spec.mjs`
- `src/renderer/ui.js`
- future friend/contact desktop UI files or sections
- `test/e2e/app.spec.js`

## Activation Rule

This is now the active artifact after Phase 12 finished the retained-knowledge foundation needed for bounded friend and presence work.
