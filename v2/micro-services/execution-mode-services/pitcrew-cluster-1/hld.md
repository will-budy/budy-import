---
name: Pit Crew Cluster — HLD
code: pitcrew-cluster-1-hld
version: 0.1
status: draft
last_updated: 2026-11-10
---

# Pit Crew Cluster — High Level Design

> **Draft.** Decisions the owner has taken are in the Design Decisions Log. Everything marked *proposed* here, and every item under Open Questions, is not decided. Components, task queues and capability names follow the cluster standard and are provisional until the first component ships.

## Overview

`pitcrew-cluster-1` is Agent Success's ticket and approval service. Other clusters hand it a ticket under a named procedure (an SOP). It checks the request, answers accept or reject at once, then drives the ticket through the SOP's steps: an AI reviewer, a person, or an automated action at each step. It owns the tickets and their history in its own PostgreSQL database, and gives Agent Success staff one console to work them. This replaces the Jira Service Desk review path of the Mark 2 build and the cluster-specific approval screens.

It is a Nexus-first cluster like the others: one Nexus endpoint, service `PitcrewServiceV1`, the two fixed operations `Execute` and `DescribeCapabilities`, a generic `gateway-1` that authenticates and validates, and components behind it. Its distinguishing pattern is that **the workflow is an interpreter and the procedure is data**. One Temporal workflow type loops over steps read from a versioned SOP (a Kubernetes custom resource), runs the actor the step names, applies the outcome and moves on. Changing how Agent Success handles a kind of ticket is a new SOP version, not a code deploy.

Two speeds are kept apart. Accepting or rejecting a ticket is a short call that returns a ticket ID. Resolving it can take hours, so the requester collects the result with a second, long-running call, or fetches it later. The console reads the queue from PostgreSQL for speed and sends every change through the gateway as the person acting, under a session they have deliberately assumed.

## Architecture Diagram

```text
 requesting service (other clusters)                 Agent Success staff (browser)
   │ Nexus Execute: submitTicket, awaitTicket              │ sign in: platform portal (Dex, Google groups)
   ▼                                                       ▼ STS handoff: system-scope session
 ┌─ pitcrew namespace ─────────────────────────────────────────────────────────────────┐
 │  gateway-1  (STS token, payload schema, coarse authorize)                             │
 │     │ child workflow                                                                  │
 │     ▼                                                                                 │
 │  ticket-engine-1  (Temporal worker, Pinned)             console-1  (SPA + BFF)        │
 │   entrypoint workflow ── submitTicket ─▶ starts TicketWorkflowV1 (independent run)    │
 │   TicketWorkflowV1: load SOP ▶ run step actor ▶ transition ▶ repeat                   │
 │   activities: register, load-sop, run-ai-step, assign-human, transition, notify       │
 │        │  ▲ Updates (human actions)                       │ queue reads: read role     │
 │        │  └───────────────────── via gateway-1 ◀──────────┘ changes: Execute as user   │
 └────────┼───────────────┬──────────────────────┬─────────────────┬─────────────────────┘
          ▼               ▼                      ▼                 ▼
    PostgreSQL       Kubernetes API         LLM router         notifications
  ob1-pitcrew-db-1  SOP and prompt CRs   (Nexus, AI steps)   (Slack, email)
```

External systems: the auth cluster (STS for tokens and session exchange, OpenFGA for permissions), Temporal, PostgreSQL (Vault-issued credentials), the Kubernetes API, the platform's LLM router, and a notification channel.

## Deployment Model

| Property | Value |
| --- | --- |
| Type | Umbrella chart `pitcrew-cluster-1-repo-1`, namespace `ob1-tf-eks-de-v2-pitcrew-1-ns-1`, one sub-chart per component |
| Language | Go for services; the console is a React single-page app with a Node BFF in one container, per the [platform console standard](../../../ref/platform-console-standard.md) |
| `gateway-1` | Exists. Temporal worker with the Nexus service; reads capability manifests from a ConfigMap |
| `ticket-engine-1` | Temporal worker, Pinned worker versioning, one task queue, one entrypoint workflow switching on capability, plus `TicketWorkflowV1` |
| `console-1` | Deployment behind the platform UI, route launched through a `nexusTarget` so one token serves the console and the gateway |
| Storage | `ob1-pitcrew-db-1` (provisioned), one database for this cluster, split into a `meta` and a `content` schema |
| `sql-exporter-1` | Exports queue and SLA-breach metrics from the `meta` schema with the console's read credential |
| `pitcrew-seed-1` | Dev-only CronJob that seeds sample tickets |
| Disabled by default outside dev | As for every new cluster |

## Core Interfaces

Architectural contracts, not implementation types:

- **SOP source.** Returns the immutable definition of a named version (steps, outcomes, time limits, input and result schemas) and whether it is active, deprecated or retired. Backed by a Kubernetes cache that is loaded at start and kept current by a watch. Versions never change once published, so a stale cache can only miss a new version or a lifecycle change.
- **Actor.** What a step runs. Three kinds: *agent* (an AI step with a prompt, a tool allow-list and an output schema), *human* (a queue and the actions people may take) and *system* (an automated call). A fourth kind, *wait*, holds the ticket for a timer or an outside event. Each returns one outcome from the closed set its step declares.
- **Ticket store.** Writes a transition and its event in one transaction, idempotently, and serves the console's read model. The only writer of ticket state.
- **Authorizer.** Answers permission questions against the Pit Crew OpenFGA model through `go/authz` with the identity the token fixed. Fail closed: a deny and an outage are different results and neither is an allow.
- **Notifier.** Sends escalations and reminders to the Agent Success channel and owners.

## Schema Definitions

### Ticket

| Field | Meaning |
| --- | --- |
| `ticketId` | `tkt_<ULID>`. The handle callers hold. Equal to the ticket workflow's ID. |
| `tenantId` | From the verified token of the submitter, never from the request. The tenant the subject content belongs to. |
| `requester` | The submitting service or user identity from the token |
| `sop` | `{name, version, digest}`. Pinned at acceptance. The digest is a hash of the definition used. |
| `state`, `step`, `attempt` | Current lifecycle state, the step being worked and the attempt count at that step |
| `owner` | Who must act next: `agent`, `human:<queue>`, `system` or `requester` |
| `priority`, `dueAt` | From the SOP's time limit for the current step |
| `result` | Set when final: the SOP's declared result schema |
| `createdAt`, `resolvedAt` | Timestamps |

Lifecycle states: `accepted`, `in_progress`, `waiting`, `resolved`, `rejected`, `cancelled`, `expired`. The last four are final.

### Ticket event (append-only)

`seq`, `type` (accepted, step_started, ai_decision, human_action, content_opened, sla_breached, escalated, transitioned, comment, resolved), `actor` (kind and ID, with the assumed session where there was one), `step`, `payload`, `at`. Every change to a ticket is an event; the ticket row is a projection of them.

### Subject content

The thing being reviewed (the draft message, the proposed skill, the error report) is stored apart from the ticket row, in its own table keyed by tenant and ticket. Large artifacts stay where they live and are referenced by ID. The console's queue role has no access to this table.

### SOP (Kubernetes custom resource `PTSOP`)

```yaml
apiVersion: pitcrew.budy.bot/v1alpha1
kind: PTSOP
metadata:
  name: content-approval-v1        # <sop>-v<version>; one object per version
spec:
  sop: content-approval
  version: 1
  lifecycle: active                # active | deprecated | retired. The only mutable field.
  input:  { schema: { ... } }      # JSON Schema the requester's input must satisfy
  result: { schema: { ... } }      # JSON Schema of the outcome returned to the requester
  start: auto_review
  steps:
    auto_review:
      type: agent
      prompt: { model: default-reasoning, system: "...", template: "...", outputSchema: { ... } }   # inline
      maxAttempts: 2
      sla: 2m
      outcomes: { approve: resolved, reject: rejected, unsure: human_review, failed: human_review }
    human_review:
      uses: human-approval         # shared step template: approve, reject, edit and approve, send back
      queue: agent-success
      session: editor              # tenant session boundary needed to act on this step
      sla: 4h
      onSlaBreach: { escalateTo: agent-success-lead }
      outcomes: { approve: resolved, reject: rejected, send_back: auto_review }
```

Annotations: `spec` is immutable once created (the CRD carries a transition rule that it equals its old value), apart from `lifecycle`. Every outcome target must name an existing step or a final state (a CRD validation rule). Reachability and dead ends are checked by a lint in CI. `uses` names a step template shipped with the cluster, which supplies the standard actions and outcomes for that actor kind so SOPs do not repeat them. A `subflow` step type is reserved for later nesting and is not accepted in Phase 1.

### Prompts

In Phase 1 a prompt is inline in its step: the template, model hint and the JSON Schema its output must satisfy. It is immutable with the SOP version, so a prompt change is a new SOP version. A separate prompt resource is deferred until prompts need to change faster than flows. The full CRD and two sample SOPs are in the [TRD](trd.md).

## Component Breakdown

### gateway-1

Generic and already present. It authenticates the STS token, checks the capability's JSON Schema and the coarse authorize check from the manifest, and starts the component's workflow as a child. It holds no state and no Pit Crew logic.

### ticket-engine-1

**Entrypoint workflow.** One workflow type, switching on capability, as the standard requires. `submitTicket` runs a short path: check the SOP is active, check the input against the SOP's input schema, register the ticket, start the ticket workflow as an independent run (not as a child of the call), and return the ticket ID or a typed error. Other capabilities read a ticket, or deliver a human action to a running ticket.

**`TicketWorkflowV1`.** The interpreter. State carried in the workflow is only the ticket ID, the SOP reference with digest, the current step and attempt counters. Everything else is in PostgreSQL. Each turn:

1. Load the pinned SOP version through an activity, so the result is recorded in history and replay never reads live cluster state.
2. Run the step's actor: an AI activity for *agent*; for *human*, create the queue entry and wait for an Update or the time limit; an activity for *system*; a timer or event for *wait*.
3. Apply the outcome in one transaction (ticket row, event, queue entry), idempotently.
4. Go to the step the outcome names, or finish if it names a final state.

Human actions arrive as Updates. The Update's validator rejects an action when the ticket is not at a human step, the caller does not hold the ticket, the action is not allowed at that step, or the ticket has moved on. The caller gets that answer straight away.

Each step's time limit is a workflow timer. A breach runs the step's `onSlaBreach`, records an event and sends a notification. Fleet-level alerting (queue age, breach rate) comes from metrics the worker exports, which the shared Alertmanager rules consume.

**Search attributes** on every run: ticket ID, tenant, SOP name and version, step and state, so a run can be found in Temporal without the database.

### console-1

The operator console, one container. It signs staff in through the platform portal, reads the queue and ticket metadata from the read model, and sends every change through `gateway-1` using the staff member's own token. It never writes to PostgreSQL. See Identity, Roles and Sessions.

## Key Flows

### Submit and accept

```text
service ──Execute submitTicket {sop, input, callback?}──▶ gateway-1 ──▶ ticket-engine-1 entrypoint
          (idempotencyKey, STS token: tenant and user fixed from the token)
                                                           │ SOP active? input valid? (typed errors if not)
                                                           │ insert ticket + accepted event (unique on tenant, requester, key)
                                                           │ start TicketWorkflowV1 (workflow ID = ticketId)
service ◀──{ticketId}─────────────────────────────────────┘   (a repeat call returns the same ticketId)
```

### Wait for the result

```text
service ──Execute awaitTicket {ticketId}──▶ gateway-1 ──▶ ticket-engine-1 ──waits on the ticket workflow
service ◀─────────────────────────────── {state, result} once the ticket is final
(if the service is not waiting, getTicket returns the same result later)
```

### AI first, then a person

```text
TicketWorkflowV1: step auto_review (agent)
   ├─ activity: prompt v4 via LLM router, output validated against the prompt's schema
   ├─ outcome approve ─────────────────────────────▶ resolved  (event ai_decision, prompt version, reasoning)
   └─ outcome unsure, or invalid output after maxAttempts ─▶ step human_review
step human_review (human): queue entry created, owner = human:agent-success, timer = 4h
   ├─ Update {action: approve} from staff ───────────▶ resolved
   └─ timer fires ─▶ onSlaBreach: escalate, notify, event sla_breached
```

### Staff open a ticket

```text
staff ──browser──▶ console-1: queue from read model (summaries only; system-scope session)
staff clicks a ticket ──▶ console-1 asks for a tenant session for ticket.tenantId at the step's boundary
                          (a deliberate, recorded assume step; viewer to read, editor to act)
console-1 ──Execute getTicket (tenant session)──▶ gateway-1 ──▶ content returned, event content_opened
staff ──Execute resolveTicket {action} (tenant session)──▶ gateway-1 ──▶ Update on the ticket workflow
```

## Identity, Roles and Sessions

### Sign-in

Staff reach the console from the platform portal. The portal signs them in through the shared Dex with Google, reads their Google groups, and exchanges the Dex token at the STS for a session. A new Google group for Agent Success (name to agree) is added to the portal's access groups with a session-boundary cap, and as the visibility group of the Pit Crew console route. The portal hands a one-time handoff to the console, which redeems it into a host-only cookie; the browser never holds a token. This is the existing mechanism, used unchanged.

### Platform role

A new platform role, **agent success**, is added to the platform authorization model beside the existing platform roles. It is stored on the platform object, limited to internal users like every platform role, and is deliberately **not implied by** platform admin, support or viewer. Agent Success operators are granted it by name. The STS maps the role to the session boundary it makes a person eligible for on the platform; that mapping lives in the auth service, alongside the existing platform boundary mappings.

### Two layers of access

| Layer | What it holds | Who can reach it |
| --- | --- | --- |
| Envelope | Ticket ID, tenant, SOP, state, step, owner, due time, queue | A system-scope session with the agent success role: the queue and assignment actions |
| Subject content | The material under review, and acting on it | A tenant-scope session for the ticket's tenant, assumed deliberately when a ticket is opened, at the boundary the SOP step declares |

The ticket's tenant is fixed from the submitter's token. Operators do not carry a tenant of their own; they assume the ticket's tenant for the time they work on it, and the assumption is an event on the ticket. The AI step is an internal service identity that does the same: it obtains its own session for the ticket's tenant and never stores or reuses the requester's token, which expires before a ticket does.

### Permissions model

A new `pitcrew` model module in the authorization config repository defines two object types, following the artifact-store precedent of putting the tenant in the object ID: the SOP (which services may submit it, and which outputs they may read) and the ticket (`pitcrew_ticket_1:{tenantId}/{ticketId}`, with permissions that extend from the platform's session tiers rather than from stored roles alone). The Nexus service and its operations are registered in the topology file, and tenant admission is added, as for the other clusters.

## Storage

### PostgreSQL (`ob1-pitcrew-db-1`)

| Table | Purpose | Notes |
| --- | --- | --- |
| `tickets` | One row per ticket; a projection of its events | Unique on tenant, requester and idempotency key |
| `ticket_events` | Append-only history | The audit record; never updated |
| `ticket_content` | Subject content and large inputs | Separate table and database role; not readable by the console's queue role |
| `queue_entries` | Open human work: queue, claim, due time | Drives the queue view |
| `comments` | Staff notes on a ticket | Events of type comment |
| `ticket_queue_v` (view) | Envelope fields only, for the console | The only object the console's read role can select |

Credentials are issued by Vault. Schema changes run as a migration Job under a separate role, as in the other clusters. Retention periods for content and events are an open question.

### Temporal

Workflow history is kept for the namespace's retention period (7 days is the intended setting). History is not the record: the database is. Ticket workflows have a maximum run time that ends the ticket as `expired`, so an unattended ticket cannot live forever.

### Kubernetes

SOP and prompt custom resources, read through a cache with a watch. The worker needs read access to those resources in its own namespace and network egress to the Kubernetes API.

## Dependencies

| Dependency | How used |
| --- | --- |
| Temporal | Workflows, Updates, timers, Nexus endpoint, Worker Deployment Versioning (Pinned) |
| Auth cluster, STS | Token verification (JWKS) at the gateway; session exchange for the console and the AI step |
| Auth cluster, OpenFGA via `go/authz` | Permission checks on tickets and SOPs |
| Kubernetes API | SOP and prompt resources |
| PostgreSQL | The ticket store |
| LLM router (Nexus) | AI step prompts with structured output |
| Platform UI, Dex | Staff sign-in and session handoff |
| Notification channel | Escalations to the Agent Success channel (provider open) |
| Requesting clusters | Callers of the Pit Crew contract; no calls out from Pit Crew to them in Phase 1 |

## Design Principles

1. **The ticket is data; the workflow is an interpreter.** Procedures change without code changes.
2. **PostgreSQL owns the ticket; Temporal owns the waiting.** One source of truth for state, one for time.
3. **A ticket runs under one immutable SOP version for life.** Open tickets are never changed by a new version.
4. **Identity comes from the token only.** Nothing the caller says about tenant or user is read.
5. **Seeing customer content is a deliberate, recorded act.** The queue shows envelopes; content needs an assumed tenant session.
6. **Answer fast, resolve slowly.** Accept or reject in one short call; deliver the outcome through a separate waiting call.
7. **Every automated decision is explainable after the fact.** The prompt version, input and output are on the ticket's events.
8. **Changes go through the gateway as the person acting.** The console reads for speed and never writes.

## Design Decisions Log

| Question | Resolution |
| --- | --- |
| Does Pit Crew own state or only view other systems' state? | It owns tickets and their history in its own PostgreSQL database. It is the system of record for Agent Success work. |
| One workflow per ticket kind, or a generic one? | One generic interpreter workflow; a ticket's kind is an SOP. Steps are actors (AI, person, system, wait), and flow and limits are configuration. |
| Where do SOPs live? | As Kubernetes custom resources with a published CRD and no operator. Immutable per version, with a lifecycle flag. Read through a cache with a watch. |
| Can a request be accepted before it is valid? | No. Intake checks that the SOP is active and the input matches before accepting. A bad request is rejected at once and no ticket exists. |
| How does a caller learn the result? | `submitTicket` returns the ticket ID at once. `awaitTicket` is a long-running call the caller waits on. `getTicket` fetches it later. The Nexus call carries the result, so callers need no callback service and no workflow signal across namespaces. |
| What is the caller's handle? | The ticket ID, equal to the ticket workflow ID. A run ID is a trace field only. |
| Who sets the ticket's tenant? | The submitter's verified token. The payload cannot assert it. |
| How is operator access shaped? | Two layers. The queue is a platform-scope view of envelopes. Opening content is a deliberate assume into the ticket's tenant, recorded as an event. No separate Pit Crew tenant. |
| How do staff get access? | A new platform role for Agent Success, separate from and not implied by the other platform roles. Sign-in is the platform portal with a Google group for Agent Success. |
| How long do tickets live? | Designed to resolve within 24 hours. A maximum run time (initial value 72 hours) ends the ticket as expired. Temporal history is kept 7 days; the database is the record. |
| Is continue-as-new used? | Not in Phase 1. A ticket is short enough that history growth is not a concern. |
| What happens when a ticket "comes back"? | It becomes a new ticket linked to the earlier one. Grouping into a case is deferred. |
| Where does the console read the queue from? | PostgreSQL, through a SELECT-only role (`pitcrew_meta_read`) on the `meta` schema, behind a verified system-scope token that carries the agent success role. Subject content is in a separate `content` schema the role cannot read, and is fetched through the gateway. |
| How is the SOP kind named and where do prompts live? | The custom resource kind is `PTSOP` (group `pitcrew.budy.bot`). Prompts are inline in the step in Phase 1. |
| How are SLA breaches alerted? | A SQL exporter reads breach rows from `meta` with the console's credential; `ServiceMonitor` and `PrometheusRule` resources feed the existing Prometheus operator and Alertmanager (team `agent-success`). |
| How does content access work in Phase 1? | A platform-scope token plus a fail-closed Pit Crew authorization check, recorded as `content_opened`. A true tenant assume needs a platform feature and is a Phase 2 dependency. |
| One worker or several? | One standard worker, `ticket-engine-1`, with the entrypoint and ticket workflows. |
| Does the console write to PostgreSQL? | No. Every change goes through the gateway as the user, which applies the correct permissions. |
| What goes through Temporal and what does not? | Only client-specific data and changes: opening a ticket's content, acting on a ticket, claiming, releasing, assigning and commenting. The queue, its filters, the stats and a ticket's history are database reads of the `meta` schema through the read role, so listing and filtering never load Temporal. |
| How does the console read the result of a gateway call? | Temporal's Nexus HTTP endpoint answers asynchronously, so the console passes an in-cluster callback URL and waits for Temporal to post the result. The console therefore runs one replica and the platform allows Temporal to reach its callback port (see the TRD, "As built"). |
| How does the console know the caller is Agent Success staff? | It asks the OpenFGA read-only proxy before every query and gateway call (`may_view_pitcrew_queue`, `may_work_pitcrew_queue`) and fails closed. A role claim in the STS token would replace this check; the platform owners confirm which they want. |

## Open Questions

Resolved by the design decisions above: console read path, platform-scope callers for envelope capabilities, procedure and prompt publishing, cross-repository changes (the pull requests are linked from the service document), and the names `ticket-engine-1` and `console-1`. Still open:

1. **Assume mechanism.** The STS exchanges a system session for a tenant session through the portal's auth-code flow; a console cannot call it directly. Phase 1 uses a fail-closed check instead (see TRD). Decide whether the platform gets a console-callable exchange.
2. **Delegation authority.** Give the agent success role the matching delegation rungs, or write a time-bounded grant per ticket on claim. The second is tighter and needs the authorization manager to write grants for Pit Crew.
3. **Long waits through Nexus.** `awaitTicket` is bounded (default 30 minutes, maximum 60) and callers re-call. Confirm this is acceptable and the endpoint's timeout.
4. **Worker versioning for 72-hour tickets.** Confirm that the ceiling is acceptable for deploys, or set a shorter one.
5. **Guards.** Phase 1 uses closed outcome sets only. If an expression language is needed, decide before the CRD is published beyond `v1alpha1`.
6. **AI step plumbing.** Which LLM router operation supports structured output with a schema, who owns prompt evaluation, and the per-ticket budget.
7. **Notification provider.** Slack through the communications gateway or directly, and who maintains the on-call roster.
8. **Retention.** How long to keep content, events and queue history.
9. **Jira.** Whether Mark 2's Jira path is replaced at once or runs alongside, and who migrates open tickets.
10. **Phase 2.** Raising a ticket from the console (see the TRD, "As built (Phase 1)").
