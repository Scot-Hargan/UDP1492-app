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
2. Phase 11 channel/admin work is complete enough that managed identity, directory, and peer-resolution inputs are stable.

Some preparatory refactors could happen earlier, but the local knowledge model should not be rushed in before the managed facts feeding it are stable enough.

## Phase 11 Inputs Now Available

Phase 11 materially changed what Phase 12 can safely build on.

The retained-knowledge layer can now rely on these concrete inputs:

- manual direct peers persisted in `udp1492_peers`
- direct recency persisted in `udp1492_last_peers`
- managed identity facts persisted in `udp1492_managed_profile`
- backend-authored directory/admin facts persisted in `udp1492_managed_cache`
- managed resolved peers and endpoint observations produced during peer refresh in renderer memory
- stable managed `userId` assignment and bounded `operator` / `member` semantics

The important implication is:

- Phase 12 does not need new backend features before it starts
- Phase 12 should build on existing local storage and migration paths instead of inventing a parallel persistence subsystem

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

Recommended concrete starting shape:

- storage key: `udp1492_local_knowledge_v1`
- top-level structure:
  - `version`
  - `peers`
- peer records should start conservatively with:
  - `peerId`
  - `displayName`
  - `managedUserId`
  - `manualPeerKey`
  - `sources`
  - `endpoints`
  - `firstSeenAt`
  - `lastSeenAt`
  - `lastConnectedAt`

Endpoint records should remain reusable and non-secret:

- `kind`
- `ip`
- `port`
- `source`
- `channelId`
- `slotId`
- `firstSeenAt`
- `lastSeenAt`
- `lastConnectedAt`

Do not retain:

- passcodes
- session IDs as durable authority
- channel membership state as durable authority
- backend-only live-presence facts that are only meaningful during an active session

## Authority Rules

Authority should remain explicit:

- backend is authoritative for live managed session/channel/presence state
- desktop local storage is authoritative for reusable retained knowledge
- managed observations may enrich local records
- backend disappearance must not erase useful local knowledge

Additional merge rules should be explicit before implementation:

- manual display names and manually entered direct peer endpoints outrank managed observations
- managed observations may attach `managedUserId`, additional names, and reusable endpoints when no manual value is being overwritten
- endpoint dedupe should be based on stable reusable facts such as `kind + ip + port`
- direct-success timestamps may update retained endpoint usefulness without rewriting manual provenance
- deletion of a manual peer in the current direct-peer UI should not silently destroy unrelated managed-learned identity history unless Phase 12 explicitly links those records
- retained knowledge must remain bounded and inspectable; no hidden trust escalation

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
3. Mirror manual direct-peer edits into the local store so existing workflows remain authoritative.
4. Capture managed-learned identities and endpoints into the local store during peer refresh and successful managed use.
5. Use the local store in bounded direct-mode flows.
6. Add inspection/maintenance UI only after the model is stable.

## Recommended Slice Plan

The most defensible Phase 12 path is:

### Slice 1: schema, bootstrap, and migration safety

- add `udp1492_local_knowledge_v1`
- normalize the store on load alongside existing app-state and managed-cache normalization
- bootstrap manual peers from `udp1492_peers`
- keep legacy direct-peer storage working during the transition

### Slice 2: managed observation capture

- retain managed identities from session/profile/admin-summary facts
- retain reusable managed endpoints from resolved peer refreshes
- record provenance and timestamps without persisting ephemeral membership state

### Slice 3: bounded direct reuse

- reuse retained endpoints in one narrow direct-mode path first
- prefer suggestion/import or derived peer synthesis before large UI redesign
- keep manual peer editing as the safest override path

### Slice 4: inspection and maintenance

- expose retained knowledge in a bounded UI
- show provenance and last-seen/last-connected facts
- support minimal maintenance controls only after the merge model is proven

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
- future local-storage fixtures under `test/fixtures/storage/`
- `test/e2e/app.spec.js`
- `CURRENT_TASK.md`
- `docs/architecture.md`

## Activation Rule

This is now the active artifact after Phase 11 closeout made the retained-knowledge inputs stable enough to preserve.
