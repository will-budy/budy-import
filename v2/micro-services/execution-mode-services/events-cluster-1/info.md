---
name: events-cluster-1
kind: service
description: Routes incoming webhooks to published workflows and watches supported external events through polling; new watcher types need an approved PR, and unsupported cases fall back to scheduled workflows.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/events-cluster-1_repo-1
status: active
tags: [execution-mode, application-cluster, go, temporal, webhooks, event-watchers]
interfaces: [http, nexus]
runtime:
  language: go
  framework: temporal
  deployment: eks
links:
  design: []
  runbooks: []
  dashboards: []
  api_contracts: []
  builds: []
  release_candidates: []
---

# events-cluster-1

events-cluster-1 routes incoming webhooks to published workflows and watches supported external events through polling. New watcher types require an approved PR. Unsupported cases fall back to scheduled workflows.

> **Status: built, not deployed (November 2026).** The repository's draft pull request carries the contract, `admin-1`, `webhook-ingress-1` and `console-1`; see [Trigger model](triggers.md) for the open decisions. The design below and in the linked documents is a draft written from the owner's trigger model (see [Trigger model](triggers.md)); items marked *Decided* are owner decisions, the rest is proposal.

## Boundary (proposed)

| Owns | Does not own |
| --- | --- |
| Triggers of published workflows: registering them at publish time and starting the workflow when one fires (webhook, internal call, email, schedule) | Authoring and publishing workflows (dt-consulting-services-1 and its mission registry; gitjib-cluster-1 hosts workflow code) |
| Polling-based watchers for supported external event sources (later) | Channel message ingestion owned by the comms gateway (Slack, Gmail); SMTP and the per-tenant mail subdomain (a teammate's address is `<name>@<tenant subdomain>`) |
| The set of supported watcher types and the rule that a new type needs an approved PR | Running the target workflows (the workers that execute them) |
| The scheduled-workflow fallback for unsupported event sources | |

## Proposed shape

| | |
| --- | --- |
| **Repository type** | Nexus-first (gateway + components) plus a non-Nexus HTTP ingress component |
| **Components** | `gateway-1` (Nexus), `admin-1` (Temporal worker: registry, dispatch, schedules, email admission), `webhook-ingress-1` (public HTTP), `console-1` (tenant view); watchers later. See the [HLD](https://github.com/Budybot/events-cluster-1_repo-1/blob/main/docs/hld.md) |
| **Where the capability registry fits** | Each watcher type is a capability: a manifest declares its config schema and task queue, so adding a watcher type is a component plus a manifest, and the approved-PR rule applies to exactly those files |
| **Fallback** | Unsupported sources are expressed as scheduled workflows rather than new code paths |

The Nexus-gateway rules apply to the gateway and components; the HTTP ingress is a separate externally reachable, non-Nexus component and needs its own security review (see questions).

**First pass (October 2026):** the gateway only (`gateway-1`), like `nainai-cluster-1`; the components above are added one at a time afterwards, each as a catalog entry.

## Names (derived from the standard)

| | |
| --- | --- |
| Kubernetes namespace | `ob1-tf-eks-de-v2-events-1-ns-1` |
| Nexus endpoint (control surface) | `ob1-nexus-events-cluster-1-endpoint-1` |
| Nexus service (decided) | `EventsServiceV1` |
| Gateway component, task queue | `gateway-1`, `events-cluster-1-gateway-1-tq` |
| Netpol label, Vault Transit role | `budybot.io/netpol: events-gateway-1`, `ob1_crossplane_vault_transit_events_gateway_1` |
| Umbrella chart | `events-cluster-1-repo-1` |
| Image repository | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_events-cluster-1_repo-1` |
| Helm repository | `ob1-helm-chart-repo-v1/events-cluster-1-repo-1` |

## Callers and callees (assumed, unconfirmed)

- Inbound: external systems calling webhooks; pollers calling external APIs.
- Outbound: starts "published workflows" through the Dynamo worker's Nexus endpoint (or, for schedules, directly in the tenant Temporal namespace). It keeps its own slice of each publication, registered by the [Mission registry](../dt-consulting-services-1/mission-registry.md) of DT Consulting Services (the only registration caller); the registry is not read at trigger time.
- Kubernetes: reads `DynamoWorker` resources (`dynamoworkers.platform.budy.ob1.ai`, read only, cluster-wide) when triggers are registered, to take the worker's `status.nexusEndpoint` and `status.taskQueue`. Nothing is read from Kubernetes when a trigger fires.

## Dynamo worker Nexus contract

events-cluster-1 is the only caller of a Dynamo worker's Nexus endpoint, and both worker bases (`dynamo-worker-go_repo-1`, `dynamo-worker-ts_repo-1`) serve the same contract. Its source is `shared/contract` in `events-cluster-1_repo-1` (`dynamo.go` and `dynamo-worker-nexus.schema.json`); the bases vendor the schema with a `$comment` naming the source commit and test against it, so the two sides cannot drift.

| | |
| --- | --- |
| Endpoint | The worker's own, `DynamoWorker.status.nexusEndpoint`, read at registration and stored on the trigger |
| Service | `DynamoWorkerV1` |
| Operations | One per workflow type the worker registers; the operation name is the workflow type (its `pwf_` id). Every workflow is exposed: only a trigger registered here can reach one |
| Input | `{ "workflowId": "...", "input": <any JSON> }`. The worker starts the workflow type named by the operation, on its own task queue, with that workflow id, and passes `input` as its single argument (none when absent or `null`) |
| Workflow id | Set by events: `<workflowType>/<triggerId>/<deliveryId>`, the same on every attempt of one delivery |
| Duplicates | A running workflow with the same id is attached to; a closed one fails the start with a Nexus `Conflict` error, which events counts as already started. A delivery never runs a workflow twice |
| Output | The workflow's result, delivered by Temporal's Nexus completion callback |

### Responses to callers

Results come back through a callback, never through polling, and no workflow stays open while a long run goes on ([design](https://claude.ai/artifact/Gz2eXw2HGX9hZ6Qtj61VNf); events-cluster-1 HLD, "Responses").

1. Dispatch starts the worker's operation over Temporal's Nexus HTTP API, with the URL of admin-1's callback service (`events-admin-1-callback`, port 3001) and a signed callback header naming the trigger and delivery. The endpoint's server-assigned id is read from its `TemporalNexusEndpoint` at registration and stored with the trigger, re-read only when a start reports it unknown.
2. When the run closes, Temporal's History service posts the completion to that service. Events records it on the delivery (`completed` or `workflow_failed`) and keeps the result, encrypted, up to 256 KiB (`getDelivery`); a larger result keeps its size and hash.
3. A webhook caller's answer is chosen per trigger at publish (`webhook.response`):

| Mode | The caller gets |
| --- | --- |
| `accepted` | `202` with the delivery id as soon as the call is admitted |
| `started` (default) | `200` with the delivery id and run id once the workflow has started; `503` if it could not start in time |
| `sync` | `200` with the workflow's result when it ends within `syncTimeoutSeconds` (default 20, at most 25); otherwise `202` with the delivery id |
| `async` | Future mode, not built: `202` with a job id and a status URL to poll |

Posting a result to a caller-declared callback URL is a later round, with its own security review.

### Trigger handles

Events issues a webhook's URL and secret and an email trigger's address, and keeps them: the URL token and the shared secret encrypted with a Transit key only admin-1 uses (`ob1_tf_vault_events-cluster-1_handle_key_1`), beside the hashes the ingress matches. A person (a tenant editor) reads them with Reveal and replaces them with Rotate in the events console (`revealTriggerHandle`, `rotateTriggerSecret`), after which the old ones keep working for 24 hours; every call is audited. Neither is a teammate tool, so a secret never enters a model's context. The mission registry never holds a URL or a secret: `getPublication` lists each trigger's id, kind and state, and an email trigger's address.

## Open questions

1. ~~What is a published workflow?~~ Answered (November 2026): a workflow (`pwf_<ULID>`, its Temporal workflow type) that a publication in the [Mission registry](../dt-consulting-services-1/mission-registry.md) publishes as its automation, with its typed triggers. Its publish saga registers the triggers here through `registerTriggers` (paused), then `unpauseTriggers`; retirement calls `removeTriggers`. ~~The DT Nexus endpoint contract~~ Answered: the Dynamo worker Nexus contract below.
2. **Webhook identity and tenancy.** How is each webhook source authenticated (signatures, per-tenant secrets) and mapped to a tenant? Which paths are public and how are they exposed (ingress, gateway, mesh policy)?
3. **Boundary with the comms gateway.** The comms gateway already handles Slack and Gmail ingestion. Which sources belong here, and is there any overlap to retire?
4. **Watcher framework.** The first watcher types, polling intervals and rate limits, checkpointing (cursor storage), de-duplication, and at-least-once versus exactly-once expectations.
5. **Approved-PR rule.** How is "new watcher types need an approved PR" enforced (CODEOWNERS on the manifest and component directories, a required review)?
6. **Scheduled fallback.** Where do scheduled workflows live and who owns the schedule definitions?
7. **Delivery guarantees.** Retries, dead-letter handling, and replay for failed webhook deliveries.

## Detailed Docs

| Name | Type | Link |
| --- | --- | --- |
| [Trigger model](triggers.md) | platform context | trigger kinds, publish flow, boundaries |
| PRD / HLD / TRD / Nexus contracts | design | draft in the repository: `docs/prd.md`, `docs/hld.md`, `docs/trd.md` (stub), `docs/nexus-contracts.md` |
| Repository | source | `Budybot/events-cluster-1_repo-1` |
| Group index | index | [Execution Mode Services](../info.md) |
