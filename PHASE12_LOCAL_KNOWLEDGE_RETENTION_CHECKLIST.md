# 1492-app Phase 12 Local Knowledge Retention Checklist

## Purpose

This phase operationalizes one of the most important product principles already locked in planning:

- knowledge learned in managed mode that is useful for direct/private operation should remain reusable locally

Phase 12 is where that principle becomes a real desktop data model instead of only a design note.

## Scope

This phase should add a bounded local knowledge layer for:

- known peers
- known managed identities
- successful direct endpoints
- successful managed endpoints
- source/provenance markers such as `manual`, `managed`, or `imported`
- bounded last-seen / last-connected facts

This data should be **local-first** and should survive backend unavailability.

## Product Intent Carried Forward

This phase is central to the project's privacy stance:

- the backend may coordinate
- the backend should not trap useful connection knowledge
- the desktop app should stay useful for direct/private operation even if the managed service disappears

## Dependencies

Phase 12 should follow the basic backend contract work and should ideally begin after:

1. Phase 10 core managed coordination is stable enough to trust managed-learned facts.
2. Phase 11 channel/admin work is at least directionally clear, if not fully complete.

Some preparatory refactors could happen earlier, but the local knowledge model should not be rushed in before the managed facts feeding it are stable enough.

## Target Outcomes

This phase should deliver:

- a local durable store for reusable peer knowledge
- a normalization layer for managed-learned vs manually entered data
- merge/update rules so newer managed observations can enrich local entries without destroying trusted manual data
- direct-mode reuse of locally retained endpoints where appropriate
- user-visible inspection and possibly bounded maintenance controls for the retained knowledge layer

## Suggested Local Data Model

The local knowledge layer should be designed to support entries such as:

- `peerId` or local stable key
- `displayName`
- `managedUserId`
- known endpoints:
  - direct endpoints
  - managed-learned endpoints
  - last successful endpoint
- provenance/source
- timestamps:
  - first seen
  - last seen
  - last connected
- future trust/pin metadata

## Authority Rules

Authority should remain explicit:

- backend is authoritative for live managed session/channel/presence state
- desktop local storage is authoritative for reusable retained knowledge
- managed observations may enrich local records
- backend disappearance must not erase useful local knowledge

## Finish Line

Phase 12 should be considered complete when all of the following are true:

1. Managed-learned reusable peer data is retained locally in a stable schema.
2. Direct mode can reuse at least some of that locally retained knowledge.
3. Local merge/provenance rules are implemented and documented.
4. Tests cover retention, update, and reuse behavior.
5. The feature still respects the project's privacy/non-relay philosophy.

## Recommended Implementation Order

1. Define the local schema and merge rules.
2. Add storage migration/bootstrap support in the desktop app.
3. Capture managed-learned facts into the local store.
4. Use the local store in bounded direct-mode flows.
5. Add inspection/maintenance UI only after the model is stable.

## Explicit Non-Goals

- central cloud contact storage as the primary authority
- broad social-network features
- permanent backend endpoint archives
- automatic trust decisions without operator visibility

## Risks To Watch

- letting ephemeral live state leak into the durable local knowledge layer
- overwriting trusted manual data too aggressively
- storing secrets instead of reusable non-secret facts
- building a complex contact system before the retained-knowledge model is coherent

## Expected Primary Files

- `src/renderer/ui.js`
- `src/renderer/managed-controller.js`
- `src/main/main.js`
- `src/main/preload.js`
- future local-storage fixtures under `test/fixtures/storage/`
- `test/e2e/app.spec.js`

## Activation Rule

This should become an active artifact after the backend/product phases ahead of it make the retained-knowledge inputs stable enough to be worth preserving.
