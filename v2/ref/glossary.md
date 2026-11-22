# Glossary

|                  |                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------- |
| **Document**     | Glossary                                                                                 |
| **Version**      | 1.0                                                                                      |
| **Status**       | Living Document                                                                          |
| **Audience**     | Internal Team                                                                            |
| **Purpose**      | Short definitions of key technical terms used across platform documentation.             |
| **Last Updated** | November 2026                                                                            |

---

## Temporal Nexus Service

A **Temporal Nexus Service** is a service contract built on top of [Temporal](https://temporal.io/) that exposes durable, distributed operations as callable endpoints — conceptually similar to a REST API, but built for work that is async, long-running, or needs to survive failures.

Where a REST API call is transient (the caller either gets a response or handles a timeout on its own), a Nexus call is durable: if the caller or the service crashes mid-operation, Temporal ensures the work resumes from where it left off. The caller does not need to know whether the underlying implementation is a short-lived function or a multi-day workflow — it just calls the endpoint and Temporal handles the rest.

**Why we use it:** Almost all services in the de-v2 platform are Temporal workers. Nexus lets those services expose clean, typed contracts to each other without giving up the durability and observability guarantees that Temporal provides. It is our preferred internal service contract wherever REST is not strictly required (e.g., REST remains necessary for inbound webhooks and external-facing APIs).

**Example:** The Context Service needs to request an LLM review of a proposed memory update before approving it. Rather than making a REST call to the LLM Service — which would be lost if anything crashed mid-review — the Context Service calls the LLM Service's Nexus endpoint. Temporal tracks the in-progress call. If the LLM Service worker restarts during the request, Temporal retries from the last checkpoint. The Context Service does not need to implement its own retry logic or dead-letter queue. Temporal handles it, and the full operation is visible in the Temporal UI from start to finish.

**Further reading:** [Temporal Nexus documentation](https://docs.temporal.io/nexus)

---

## Dynamo worker

A **Dynamo worker** is a Temporal worker, one per digital teammate (DT) workbench, that runs the DT's deterministic workflows. Those workflows may contain prompts and call external and internal systems. Each DT's worker has its own repository in GitLab (gitjib-cluster-1), created from a template; once an image built to the required spec is pushed, nainai-cluster-1 deploys it. dt-consulting-services-1 is how a DT gets a workflow added or changed. A Dynamo worker has no direct internet access: its outbound HTTPS goes through the [outbound gateway](#outbound-gateway).

---

## Engagement

An **engagement** is a digital teammate's request to dt-consulting-services-1 to add or change a workflow of its Dynamo worker. It is written like a PRD (outcome, context, audience, do's and don'ts, success criteria, references to existing resources) and carries no implementation detail. A DT has at most one live engagement. It is done when the workflow is published and the new worker version is healthy.

---

## Sandbox

A **sandbox** is an isolated workspace that Karkhana (karkhana-cluster-1) runs for a caller in the caller's tenant namespace: one pod with a persistent workspace volume and its own ServiceAccount, created from a SandboxType. Pausing deletes the pod and keeps the volume; resuming starts a new pod. Desired state is a row in Postgres written by `sandbox-manager-1`; `sandbox-operator-1` makes Kubernetes match it. Design: [Karkhana sandboxes](../micro-services/execution-mode-services/karkhana-cluster-1/sandboxes.md).

---

## SandboxType

A **SandboxType** is the cluster-scoped custom resource (`karkhana.budy/v1alpha1`) that is the catalog of what a sandbox can be: image, workspace volume, resources, lifetime limits, placement, [network profile](#network-profile), secrets, the identity it gets, the roles allowed to request it (`allowedRoles`) and per-tenant and per-requester limits. Example: `claude-coder-1`.

---

## Workload session

A **workload session** is a short-lived platform identity that a platform service creates in `authz-manager-1` for one workload it runs on a tenant's behalf, such as a sandbox. It is a user homed on the tenant, with the workload's ServiceAccount as its only identity and the roles a reviewed configuration allows, until an expiry. It is released when the work stops and ends by itself otherwise. Standard: [Component Authorization Module Standard](../gitops/authorization-module-standard.md#14-workload-sessions-and-the-glassbox_id-claim).

---

## glassbox_id

**`glassbox_id`** (formerly `glassboxId`) is the claim in a tenant STS session that names the **billing entity**: the entity that pays for what the session does, either the tenant or a digital teammate of it. STS decides it and a caller cannot set it; a workload session has its entity fixed when it is created. Services record it with their usage and never derive it. See the [Usage Metering Standard](usage-metering-standard.md) and the [authorization standard](../gitops/authorization-module-standard.md#142-the-glassbox_id-sts-claim).

---

## Network profile

A **network profile** is a named set of allowed network destinations for pods that a platform operator creates in tenant namespaces. It is one cluster-wide Cilium policy, selected by the pod label `budybot.io/netpol: <profile>` in namespaces managed by a UserOrg, and the label is reserved by admission policy. Example: `sandbox-coder-1`. A SandboxType names its profile in `networkProfile`. See [Network Policy & mTLS](../gitops/network-policy-and-mtls.md#tenant-workload-network-profiles).

---

## Platform

A grouping of tenants for management. Only platform staff use one: they hold a platform role (`platform_admin`, `tenant-provisioner`, ...)
and assume into the platform, which gives them a **platform session** (`scope_type=platform`, with the `platform` claim). Customers and
digital teammates only ever hold tenant sessions. The business platforms are `budy-sl-platform-1` (senior living) and
`budy-general-platform-1` (general); `budy`, `system-platform-1` and `janus-platform-1` serve Auth Manager, the Context operator and
Janus workloads. See [Platforms and platform sessions](platforms.md).

---

## System audience

An OpenFGA `audience` (`global`, `seniorliving`, ...) that groups system-scope Context content, managed by exactly one platform. A platform
session carries one (`system_audience_key`) only when the app needs it, which today is Context alone. Not to be confused with a token's OAuth
audience (`aud`), the service the token is for, which every token carries.

---

## Outbound gateway

The **outbound gateway** (`outbound-gateway-1`) is the Envoy proxy through which every DT Dynamo worker's outbound HTTPS call must pass; workers have no other route to the internet. It terminates TLS with a certificate that the Janus Vault issued for the target's registrable domain (the worker images trust only the Janus root), and asks `outbound-policy-1`, Janus's decision point, to allow or deny each call before it is forwarded. It is part of [janus-cluster-1](../micro-services/execution-mode-services/janus-cluster-1/info.md). The network side is in [Network Policy & mTLS](../gitops/network-policy-and-mtls.md#example-dynamo-worker-netpol-1).

---

## Run token

A **run token** is a short-lived token that identifies one activity of one workflow run of a Dynamo worker to the [outbound gateway](#outbound-gateway). The worker's Janus hook asks `outbound-policy-1` (`POST /v1/run-tokens`, authenticated with the worker's projected service account token) and sends the token with each outbound call; STS signs it. Janus uses it to check which connections that activity is granted. The gateway strips the token before the call leaves.

---

## Outbound rate limit

An **outbound rate limit** caps how many calls to a connection type's service Janus lets through in a time window, per connection or for the whole type. `outbound-policy-1` counts calls in Janus's own Redis (`janus-redis-1`) and, when a call is over the limit, the gateway answers `429` with `rate_limited` and the wait. The worker hooks (`dynamo-worker-ts`, `dynamo-worker-go`) turn that answer into a retryable Temporal failure, so the activity retries when the limit allows. If Redis is unreachable, `outbound-policy-1` falls back to an in-memory limiter and keeps serving.
