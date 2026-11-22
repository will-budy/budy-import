---
name: Pit Crew Cluster — Nexus Contracts
code: pitcrew-cluster-1-nexus-contracts
version: 0.1
status: draft
last_updated: 2026-11-10
---

# Pit Crew Cluster — Nexus Contracts

How other clusters, and the Pit Crew console, call the cluster. This is a design-stage contract: capability names and payloads are *proposed* and become authoritative in the `contract` module of `pitcrew-cluster-1_repo-1` (`shared/contract`) when the first component ships. The JSON Schemas the gateway enforces will live in `charts/gateway-1/files/capabilities/ticket-engine-1.yaml`.

## Endpoint and operations

| | |
| --- | --- |
| Nexus endpoint | `ob1-nexus-pitcrew-cluster-1-endpoint-1` (never versioned) |
| Service | `PitcrewServiceV1` |
| Operations | `Execute` and `DescribeCapabilities` |
| STS audience | `urn:budy:nexus:ob1-nexus-pitcrew-cluster-1-endpoint-1:PitcrewServiceV1` |
| Component | `ticket-engine-1` (provisional) |

`Execute` takes `{component, capability, payload, idempotencyKey?, auth: {token}}` and returns `{ok, data?, error?: {code, message}}`. The caller's tenant, user and session boundary come only from the STS token; anything the payload says about them is ignored. Mutating capabilities require `idempotencyKey`.

`DescribeCapabilities` returns the capability list and, with `includeSchemas`, each capability's JSON Schema. It needs a valid token and nothing else. It does not list SOPs; use `describeSops`.

## Scope and session rules

| Kind | Token scope | Session boundary | Capabilities |
| --- | --- | --- | --- |
| Requester | Tenant | any | `describeSops`, `submitTicket`, `awaitTicket`, `getTicket`, `cancelTicket` |
| Envelope (staff) | Platform, with the agent success role | editor | `listTickets`, `claimTicket`, `releaseTicket`, `assignTicket` |
| Content (staff) | Tenant, assumed for the ticket's tenant | viewer to read, the step's boundary to act | `getTicketContent`, `listTicketEvents`, `resolveTicket`, `addComment` |

Envelope capabilities return and change only the ticket's envelope: ID, tenant, SOP, state, step, owner, queue and due time, plus the requester's short `summary`. They never return subject content. Requesters should treat `summary` as visible to all Agent Success staff and keep sensitive material in `input`.

## Capabilities

Every call is `Execute` with `component: "ticket-engine-1"`. A ticket ID has the form `tkt_<ULID>`.

| Capability | Payload | Result |
| --- | --- | --- |
| `describeSops` | `sop?` (name) | `sops[]`: name, version, lifecycle, `inputSchema`, `resultSchema`. Only SOPs the caller may submit. |
| `submitTicket` | `sop` (`{name, version}`), `input`, `summary?` (up to 140 characters), `priority?` | `ticketId`, `state`, `sop`, `dueAt?`. A repeat with the same key returns the same ticket. |
| `awaitTicket` | `ticketId`, `waitUpTo?` (seconds, default 1800, maximum 3600) | `ticketId`, `final` (boolean), `state`, and when final: `result`, `resolvedAt`. When the wait ends first, `final` is false and the caller calls again. |
| `getTicket` | `ticketId` | Envelope, and `result` when final. For the requester, its own tickets only. |
| `cancelTicket` | `ticketId`, `reason?` | `ticketId`, `state` (`cancelled`). Idempotent. Refused once final. |
| `listTickets` | `queue?`, `state?`, `owner?`, `sop?`, `dueBefore?`, `limit?` (1 to 200), `cursor?` | `tickets[]` (envelopes), `nextCursor?` |
| `claimTicket` | `ticketId` | Envelope. Refused if another person holds it. |
| `releaseTicket` | `ticketId` | Envelope |
| `assignTicket` | `ticketId`, `assignee` | Envelope |
| `getTicketContent` | `ticketId` | `input` and the subject content. Records a `content_opened` event for the caller. |
| `listTicketEvents` | `ticketId`, `limit?`, `cursor?` | `events[]` (oldest first), `nextCursor?` |
| `resolveTicket` | `ticketId`, `action`, `expectedStep`, `comment?`, `edits?` or `input?` | New `state` and `step`. |
| `addComment` | `ticketId`, `text` | The new event |

`action` is one of the actions the current step allows. The standard human step offers `approve`, `reject`, `edit_approve`, `send_back` and `update_input`. `expectedStep` is the step the caller saw; if the ticket has moved, the call is refused rather than applied.

`submitTicket` is validated twice. The gateway checks the envelope against the capability's schema. The component then checks `input` against the named SOP version's input schema and refuses the call, creating no ticket, if the SOP is unknown, deprecated or retired, or the input does not match.

## Errors

Failures return as `ok: false` with a code from the shared envelope. Where a caller needs to tell two causes apart, the message begins with a stable reason token (*proposed*, until the shared envelope gains more codes).

| Reason | Code | Retry |
| --- | --- | --- |
| `SOP_UNKNOWN` | `NOT_FOUND` | No |
| `SOP_DEPRECATED`, `SOP_RETIRED` | `INVALID_ARGUMENT` | No; choose a newer version |
| `INPUT_INVALID` (fields listed) | `INVALID_ARGUMENT` | No |
| `TICKET_NOT_FOUND` | `NOT_FOUND` | No |
| `CONFLICT` (ticket moved on, held by someone else, or action not allowed at this step) | `INVALID_ARGUMENT` | Only after re-reading the ticket |
| `NOT_PERMITTED` | `PERMISSION_DENIED` | No |
| Token missing, expired or wrong audience | `UNAUTHORIZED` | No; get a new token |
| Dependency down | `UNAVAILABLE` | Yes, with backoff |
| Anything else | `INTERNAL` | Yes, a limited number of times |

`nonRetryableErrorTypes` for callers: `INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED`, `UNAUTHORIZED`.

## Timeouts

| Capability | Timeout | Notes |
| --- | --- | --- |
| `submitTicket`, `cancelTicket`, `getTicket`, `describeSops` | 15 s | Accept or reject target: p99 under 5 s (PRD) |
| Envelope capabilities and `resolveTicket`, `addComment`, `getTicketContent`, `listTicketEvents` | 15 s | The action is applied or refused in this window |
| `awaitTicket` | 1 h 1 m (the longest `waitUpTo` plus margin) | Bounded so no Nexus call lives for the ticket's whole life; the caller re-calls until `final` is true |

## Caller guidance

A workflow in another cluster submits, then waits. This is a sketch, not the typed binding.

```go
nc := workflow.NewNexusClient(contract.NexusEndpoint, contract.ServiceName)

// 1. Submit: short call; accepted or rejected now.
var sub contract.ExecuteResponse
fut := nc.ExecuteOperation(ctx, contract.OperationExecute, submitRequest, workflow.NexusOperationOptions{})
if err := fut.Get(ctx, &sub); err != nil { return err }
if !sub.OK { return nonRetryable(sub.Error) } // rejected: no ticket exists

// 2. Wait: repeat until the ticket is final.
for {
    var res contract.ExecuteResponse
    f := nc.ExecuteOperation(ctx, contract.OperationExecute, awaitRequest(ticketID), workflow.NexusOperationOptions{})
    if err := f.Get(ctx, &res); err != nil { return err }
    if awaited(res).Final { return awaited(res).Result }
}
```

Guidance:

- Always send an `idempotencyKey` on `submitTicket`. Reuse the same key when retrying so a retry returns the same ticket.
- Store the `ticketId`. It is the only handle.
- Do not keep the caller's token waiting on a ticket. Each call carries a fresh token.
- Pin the SOP version in the request. Use `describeSops` at build or deploy time to see which versions are active and what input they expect.
- Treat `final: false` as normal, not as an error.

## Versioning policy

- The service version covers the whole contract. A breaking change to a capability's payload or meaning adds `PitcrewServiceV2` beside `V1`; `V1` is never edited incompatibly.
- New capabilities and new optional fields are additive and do not change the version.
- An SOP version's input and result schemas are part of that SOP version, not of the service. Changing them means publishing a new SOP version. Old versions keep working until retired.
