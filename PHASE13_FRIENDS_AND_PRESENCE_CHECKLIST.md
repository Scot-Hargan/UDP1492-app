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

This should become an active artifact only after the current coordination/admin/retained-knowledge foundation is ready to support it cleanly.
