---
name: events-cluster-1 — Trigger model (platform context)
code: events-cluster-1-triggers
version: 0.7
status: draft
last_updated: 2026-11-19
---

# events-cluster-1: trigger model (platform context)

Cross-cluster context for how a published workflow gets started. Service-internal design (components, schemas, contracts) is in the repository under `docs/` (`Budybot/events-cluster-1_repo-1`: `prd.md`, `hld.md`, `trd.md`, `nexus-contracts.md`). Keep the two in step: service design there, cross-cluster facts here.

> **Status (November 2026): built.** The contract, `admin-1`, `webhook-ingress-1` and `console-1` are in `events-cluster-1_repo-1`. The [Mission registry](../dt-consulting-services-1/mission-registry.md)'s publish saga calls `registerTriggers` (paused), `unpauseTriggers` and `removeTriggers`; it registers schedule triggers only so far, and the other kinds follow.

## Where it fits

A digital teammate (DT) asks [dt-consulting-services-1](../dt-consulting-services-1/engagement-flow.md) for a workflow. That cluster writes the code, adds it to the DT's Dynamo worker, and **publishes** it. Publishing means the workflow is live and can be started from outside its own worker. Triggers are how it gets started:

```text
DT ─engagement─▶ dt-consulting-services-1 ─publish─▶ mission-registry-1 (saga, one publication = one workflow published with its triggers)
                                                      ├─ janus: register publication
                                                      ├─ events-cluster-1: register triggers (paused)
                                                      ├─ nainai: observe the worker version (push-driven; not built)
                                                      └─ events-cluster-1: unpause triggers
trigger fires ─▶ events-cluster-1 ─Nexus─▶ DT's Nexus endpoint ─▶ workflow in the DT's Temporal namespace
```

A digital teammate can have several Dynamo workers; each is reached through its own Nexus endpoint, which the `DynamoWorker` XRD creates and publishes in `status.nexusEndpoint` (with the worker's task queue in `status.taskQueue`). The Temporal namespace is per user org and shared by that org's workers. Starting a workflow needs three things: the endpoint, the workflow type (its published id, `pwf_<ULID>`, used as the Nexus operation name) and the input. When triggers are registered, events reads the worker's `DynamoWorker` (by user org, digital teammate and worker name; read-only cluster RBAC on `dynamoworkers.platform.budy.ob1.ai`) and stores its endpoint and task queue on each trigger; when a trigger fires it uses only the stored values. A worker whose `DynamoWorker` publishes no endpoint cannot be registered.

The worker side is the **Dynamo worker Nexus contract** (service `DynamoWorkerV1`, one operation per workflow type, input `{workflowId, input}`, workflow id `<workflowType>/<triggerId>/<deliveryId>` set by events), owned by events-cluster-1 `shared/contract` and vendored by both worker bases; see the [service page](info.md#dynamo-worker-nexus-contract). The result comes back through Temporal's Nexus completion callback to admin-1's callback service and is kept on the delivery. A webhook's caller gets `accepted` (202 at once), `started` (the default: once the workflow has started) or `sync` (the result within 25 seconds at most), chosen per trigger at publish; an `async` mode with polling is a future mode. The webhook's URL and secret stay with events, and a person reads them with Reveal in the events console (see the [service page](info.md#trigger-handles)).

## Trigger kinds

| Family | Kind | Exposure and protection |
| --- | --- | --- |
| On demand | `webhook` | Public URL with an unguessable token; protection none, shared secret or signature |
| On demand | `internal` | Another platform workflow calls events-cluster-1 over Nexus; same-tenant only |
| On demand | `email` | A unique address per trigger (two safe words and four digits, on the tenant's mail subdomain), with a required allowed-senders list. The comms router forwards mail it cannot resolve to a teammate to events, which decides silently |
| Scheduled | `schedule` | A Temporal Schedule owned by events-cluster-1 and reconciled against the registered trigger to repair drift. Recommended home is the tenant's Temporal namespace, so it fires without Nexus and without events being up (pending a spike on Temporal rights) |
| Later | `watcher` | Polling of supported external sources, each type an approved PR |

Every webhook, internal and email delivery is checked against the workflow's declared input schema; rejections happen at the edge from a Redis copy of each trigger's admission data, so turned-away traffic never creates a workflow. Public webhooks are served at `/v1/triggers/<token>` on `events.<env>.orangebox.ai` (dev, stage) and `events.budybot.ai` (prod), through the Istio api-gateway. **Schedules are different on purpose.** A schedule that lives in the tenant namespace starts the workflow directly, so no per-delivery admission runs when it fires: its fixed input is validated against the schema at registration, and whether it may fire is enforced by pausing or deleting the schedule itself, which the registry does on pause, remove and publication retirement and which a reconcile loop (every minute) repairs, so a stale state can persist for up to about a minute. If per-fire checks and delivery history are needed, schedules can instead live in the events namespace and start the dispatch workflow (`SCHEDULE_HOME`). Every trigger belongs to one publication, tenant and DT, is registered **paused** and unpaused only once the worker version is healthy, and is removed when its publication is retired. Before starting a workflow, the cluster checks that the trigger is active and the publication live.

## Boundaries

| Boundary | Rule |
| --- | --- |
| communication cluster | Owns Mailgun, the per-tenant subdomain and conversation email. The router forwards unresolved recipients to events (`deliverEmail`); events owns trigger addresses and allowed senders. Attachments are not kept by the inbound gateway today. |
| dt-consulting-services-1 | The only caller of registration. Owns publication state. |
| `DynamoWorker` XRD (crossplane) | Creates the per-worker Nexus endpoint (composed by the `UserOrg`) and publishes its name and the worker's task queue in status; events reads both at registration. nainai deploys the worker but does not create the endpoint. |
| Dynamo worker bases | Serve the Dynamo worker Nexus contract (`DynamoWorkerV1`) that events-cluster-1 `shared/contract` owns. |
| Temporal (platform) | Allows events' callback endpoint as a Nexus completion callback address, so History can post a workflow's result to events (as it already does for events' console). |
| janus-cluster-1 | Not involved at trigger time. |

## Open cross-cluster questions

1. ~~The Nexus endpoint name format agreed with the XRD owner.~~ Built: the XRD creates `ob1-nexus-dw-<userOrgId>-<digitalTeammateId>-<n>-endpoint-1` and publishes it in `DynamoWorker.status.nexusEndpoint`, which events reads at registration. Remaining: the existing events database.
2. ~~The trigger schema inside the publish manifest (mission-registry M2).~~ Decided: typed triggers in the Publication manifest (`ref`, `kind`, `schedule {cron, timezone, overlap, input, catchupWindow}`), with the automation's `inputSchema`.
3. The `deliverEmail` forwarding scope with the communication cluster owner.
4. Live check: Nexus failure alone, or registry publication state as well.
5. ALB OIDC exemption for `/v1/*` on the shared dev and stage host; WAF and mesh policy (separate security review).
6. Posting a result to a caller-declared callback URL: its authentication and the security review of events' outbound POST (not in this round). The `async` response mode (job id and polling) is a future mode.
