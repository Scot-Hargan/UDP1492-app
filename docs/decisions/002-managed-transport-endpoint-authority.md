# Decision 002: Managed Transport Endpoint Authority

## Status

Accepted.

## Context

Managed mode publishes presence endpoints through the backend and later adapts resolved peer endpoints back into the desktop transport configuration.

The browser-side NAT discovery path can observe public IP and port tuples through WebRTC/STUN, but those observations are not authoritative for the UDP audio host. The actual transport listener is the desktop app's chosen UDP listen port, configured for the native host.

The regression fixed in `11135b0` showed the failure mode clearly:

- advisory browser NAT discovery reported a remapped public port
- managed presence published that remapped port as if it were transport-authoritative
- peer adaptation later preferred the public endpoint and tried to call the wrong UDP port

That behavior spreads bad port information and breaks audio establishment.

## Decision

The authoritative transport port in managed mode is the app-chosen UDP listen port.

Web NAT discovery remains advisory-only:

- it may contribute public IP hints
- it must not override the chosen transport port
- it must not cause managed peer adaptation to prefer a mismatched remapped port

Operationally this means:

- managed presence publishes endpoints on the chosen listen port
- advisory public IPs, when included, are published on that chosen port
- managed peer adaptation accepts only transport endpoints on the chosen listen port

## Consequences

Positive:

- prevents the desktop from disseminating browser-observed remapped ports as authoritative audio endpoints
- keeps transport authority aligned with the configured native host listener
- matches the current product constraint that the native host should not grow a separate NAT discovery protocol for this slice

Tradeoff:

- some translated-NAT scenarios may still fail because the app does not currently verify an externally observed transport port
- that failure mode is preferred over spreading incorrect port data

## Explicit Non-Decision

This decision does not add native-host NAT discovery or transport-authoritative external port verification.

Those can be revisited later if the product needs a stronger NAT traversal story, but they are intentionally out of scope for the current desktop/managed architecture.
