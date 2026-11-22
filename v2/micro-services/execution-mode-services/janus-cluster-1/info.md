---
name: janus-cluster-1
kind: service
description: Connection manager for the platform: manages connections to external systems and their secrets in a dedicated Vault, decides which tenant workflows and activities may use them, brokers them to DT Dynamo workers, and controls and rate-limits their outbound calls.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/janus-cluster-1_repo-1
status: active
tags: [execution-mode, application-cluster, go, temporal, secrets, connections, vault, authorization, egress]
interfaces: [nexus, http]
runtime:
  language: go
  framework: temporal
  deployment: eks
links:
  design: [prd.md, hld.md, trd.md, nexus-contracts.md, docs/content/handover.md, docs/content/architecture.md, docs/content/nango-keys.md, docs/content/outbound-build.md, docs/content/outbound-revision-2.md, docs/content/outbound-egress-control.md, docs/content/infra-wiring.md, docs/content/console.md, docs/content/remaining-work.md]
  runbooks: []
  dashboards: []
  api_contracts: []
  builds: []
  release_candidates: []
---

# janus-cluster-1

janus-cluster-1 is the platform's **connection manager**. It manages connections to external systems, keeps the secrets behind them in its own Vault, decides which tenant workflows and activities may use each connection, brokers connections to the Temporal workers that run tenant work, and applies policy checks and rate limits to the outbound calls those workers make.

Its main callers are **DT Dynamo workers**: the per-tenant Temporal workers that run Digital Teammate workflows, deployed and versioned by [nainai-cluster-1](../nainai-cluster-1/info.md).

> **Status: connections and outbound control are built and tested.** The connection registry with its type, provider and connection catalog and an admin editor, the connect page (intake-1) for API key, basic and bearer connections and for Nango-backed OAuth connections, revoke (including deleting a Nango connection), the Nexus gateway, the console (tenant and platform scope, with sign out, the Outbound activity page and the live rate-limit usage button), the DT tools and skills (catalog), the Janus Vault, Janus's own OpenFGA with its bootstrap, publish and Vault-manager components are in place. **Outbound path:** DT Dynamo worker, then `outbound-gateway-1` (Envoy, TLS, ext_authz, configuration over xDS from `outbound-policy-1`), then `outbound-policy-1` decides (run token, the activity's grant in Janus's OpenFGA, rules, rate limits, credential read just in time from the Janus Vault or Nango and injected), then the vendor. `outbound-policy-1` also issues the gateway's certificates (Janus Vault PKI, one certificate per registrable domain), serves the worker API (`/v1/trust-bundle`, `/v1/run-tokens`; STS signs the run tokens) and writes the audit. Outbound decisions are made by ext_authz, **not through Nexus**; only the rate-limit usage reads are Nexus capabilities. Rate limits are per connection type in Janus's own Redis (`janus-redis-1`); the audit goes to the audit bucket in S3. **Not built:** checking the content of an outbound call (path, method and body) against rules from the publish (D25, D30, D31), which is on the roadmap; the grant is the decision until then. Also not built: Go-worker run headers (Go workers trust the Janus roots and handle rate-limit refusals but cannot yet use connections), credential `context` mode, wildcard type hosts, rotation and `needs-reauth`, a sweeper for failed Nango deletions (revoking again retries), connection rename and metadata writers. The owner decisions below; what was built and how it behaves is in the PRD, HLD, TRD and Nexus contracts linked under Detailed Docs, and in `docs/content/outbound-build.md` for the outbound path.

## Decisions (owner)

| # | Decision |
| --- | --- |
| D1 | Janus is the platform's connection manager: connection management, permissions on connections, brokering to DT Dynamo workers, outbound rate limiting, and policy checks and routing on outbound calls. |
| D2 | Janus manages every kind of connection: secrets it stores itself (Janus-managed) and connections held by third-party connection providers (provider-managed; Nango today). |
| D3 | The existing `connections-1` (credential intake in the auth cluster, `auth-service-1`) and the connections UI (`frontend-cluster-1`, `apps/connections`) move into Janus. |
| D4 | Janus gets a dedicated HA Vault, `janus-vault-cluster-1` (Raft, same structure as `vault-cluster-2`, nothing shared with it). Connections are stored in KV v2. The connection storage in `vault-cluster-2` (`user-connections-1`) is deprecated after migration. |
| D5 | No human access to the Janus Vault; only Janus uses and manages it. A break-glass admin path may exist. |
| D6 | Janus manages its Vault's configuration itself, operator-style, with desired state in its own Postgres (`ob1-janus-db-1`). Not Crossplane CRs, not `vault-gitops` Terraform. |
| D7 | The Vault chart and any other third-party chart Janus needs deploy through the de-v2 GitOps repository as their own Applications, like gitjib's `gitlab-1`. |
| D8 | No Vault JWT plugin (the outfoxx plugin is deprecated upstream and being removed platform-wide). JWT signing for workers is the STS's: it signs the run tokens (D17). |
| D9 | Janus owns its own OpenFGA model (now in its own OpenFGA, D40). The existing `connections` and `credentials` modules are V0 and are not the base for Janus. |
| D10 | Authorization is per published workflow and per activity within a tenant. Tuples are written at publish time (into Janus's own OpenFGA, D40). |
| D11 | Inbound rate limiting stays on `api-gateway-1`. Janus owns outbound control for DT Dynamo workers; the mechanism is Envoy (D49). |
| D12 | DT Dynamo workers hold no credentials. Authority is per workflow run: a token is issued for the Temporal run id when the run is triggered and flows down through the run's context. |
| D13 | Published workflows and their activities have globally unique ids (prefixed UUIDs). Publishing registers worker → workflow within the tenant and workflow → activity. |
| D14 | The Janus Vault is auto-unsealed by the platform's main Vault (`vault-cluster-2`) through Transit. The deployed Vault also takes its TLS certificates from `vault-cluster-2`'s PKI, so the main Vault is a dependency for both the seal and TLS. |
| D15 | A proxy injects credentials only where that is a standard pattern across many APIs; otherwise the credential is passed in the run's context at execution time. |
| D16 | Single seal: Transit auto-unseal from the parent Vault only, no multi-seal. |
| D17 | STS signs run tokens. Janus attests a run on its first outbound call (with Temporal and the publish records) and has STS mint the token; the trigger does not mint. |
| D18 | Temporal type names are the published ids: workflow types are published workflow ids (`pwf_`), activity types published activity ids (`pact_`). A publication names one of its workflows as its automation, the root of the runs its triggers start. |
| D19 | Published ids belong to one tenant and one DT and are never used by another DT, tenant or kind. The same DT keeps an id when the code changes and may reuse it in later publications; an id is in the tree of only one live publication of a DT at a time (v1). |
| D20 | DT Consulting Services runs the publish step. A publish declares per activity the concrete connection id and type it needs, and may carry request rules (hosts, paths, methods; Rego candidate). |
| D21 | Internal services are treated as external: a Nexus call to another cluster (LLM router, context cluster) is a connection; the run token is never forwarded and a target-specific STS token is issued under the same grants and limits. |
| D22 | One Janus outbound service does rate limiting, allowed hosts and paths, credential handling and inspection. DT Dynamo workers move to Istio ambient (no sidecars). |
| D23 | DT Dynamo workers run TypeScript and Go; hooks are built for both in parallel, TypeScript tested first. |
| D24 | Ambient is a prerequisite for DT Dynamo, DT Workbench and the namespaces sandboxes run in (tenant namespaces; the operator namespace `ob1-tf-eks-de-v2-sandbox-1-ns-1` is ambient too) (Karpenter spot pools get the ztunnel and istio-cni DaemonSets); sidecars are disabled there. |
| D25 | DT Consulting Services' agents write the request rules with the publish, accepted under guidelines at first. |
| D26 | Request bodies are inspectable with IAM-style conditional rules (example: a workflow may delete only Salesforce records it is entitled to). |
| D27 | One outbound gateway, shared by tenants. |
| D28 | The publication registry is not a runtime dependency; runtimes (Janus, nainai, events-cluster) keep their own slice of each publication. |
| D29 | The publication registry is its own service and database, built in DT Consulting Services and kept separable; publishing is a Temporal saga workflow (idempotent steps, compensation on failure) that fans out to each runtime. |
| D30 | Phase 1 rules are stateless (request, response, caller only); ownership checks come later for supported providers. |
| D31 | Rules are written in Rego (OPA), written and audited by LLMs, shipped with their own tests and checked at publish. |
| D32 | The first provider is Google Calendar. |
| D33 | TypeScript workers first, Go next phase; Go workers build HTTP requests from the activity's context. |
| D34 | A credential reaches a call either injected by the outbound gateway (header or query) or in the activity's context for that call; only Janus reads its Vault, through just-in-time tokens scoped to the activity's connections. |
| D35 | Connection types and connection providers are separate: each type (for example Google Calendar) can have several providers (Janus internal OAuth, Nango, other third parties), exactly one active for new connections, others available or deprecated. |
| D36 | Janus's internal providers hold refresh tokens in the Janus Vault and refresh access tokens themselves. |
| D37 | Two UIs: a system-scope admin UI (types, providers, active provider, health, audit) and a tenant UI (the tenant's connections). No UI ever reveals a secret; secrets are write-only. |
| D38 | The publication registry is the Mission registry (`mission-registry-1`, database `ob1-mission-registry-db-1`); "mission" is the umbrella term for what is published. |
| D39 | Publish grants name connection ids, not types; a different connection means a republish. |
| D40 | Janus runs its own OpenFGA for publish-time and run-scoped checks; the platform STS and shared OpenFGA stay for tenant-level questions. Replaces the shared-store and `authz-manager-1` parts of D9 and D10. |
| D41 | Connections exist before an engagement: their ids are a prerequisite of the engagement request, and anything missing goes back to the DT as a feedback request. |
| D42 | Two rights on a connection, in Janus's OpenFGA: creator (the user who connected it, or later a DT) and use, shared at most between a DT and its DT manager, who may use but never see it. No tenant-wide sharing. |
| D43 | No automatic migration between providers; new connections use the new active provider. |
| D44 | Google Calendar launches on Nango with our own, Google-verified OAuth client; Janus's internal Google provider follows. |
| D45 | Janus's OpenFGA uses its own database, `ob1-openfga-janus-db-1`, separate from `ob1-janus-db-1`. |
| D46 | Delivery in four large phases: 0 baseline (Vault and OpenFGA charts, ambient, stub components, admin console, databases), 1 connections, 2 missions and outbound, 3 migration and expansion. |
| D47 | The old connection service (`connections-1`) is deprecated now; nobody uses it. `intake-1` takes the connection routes directly, with no coexistence period. |
| D48 | Console on its own host, system scope, visible to the `platform-dev` user group. The owner writes the session key (`v1/de-v2/ob1-tf-eks-de-v2-janus-1-ns-1/janus-cluster-1-console-1/session`, key `sessionSecret`) before the console PR merges. |
| D49 | The outbound gateway is a small plain-Envoy de-v2 app (`outbound-gateway-1`). It started as a deny-all ConfigMap; its listeners and certificates now come over xDS from `outbound-policy-1` (D71). Envoy Gateway is a different product from Istio's gateway; moving to a chart later is open. |
| D50 | Four layers: credential kind (`oauth2`, `api_key`, `basic`, `bearer`), connection type (for example `google-calendar`), connection provider (`vault-static-1` internal, `nango-1` third-party), and one active type–provider binding per type. A connection is a tenant's instance of a type. |
| D51 | Every read has two scopes: tenant (taken from the gateway-fixed identity) and system (platform admin only). The console is read-only in both and never sees a secret. |
| D52 | Secrets enter by two paths: form kinds post to `intake-1`, which writes the Janus Vault; redirect kinds go through a Nango connect session and webhook. The registry never sees a secret value. |
| D53 | Janus uses the platform's existing Nango instance. Without its configuration, calls fail closed with `provider_not_configured`. |
| D54 | A connection is requested with a reason and no name; the user finishes it through a one-time link in another tab; a repeat request within 60 minutes returns the same pending connection (details: `docs/content/build-spec.md` D54 and the PRD). |

## Outbound decisions (owner)

D55 to D67 (Nexus callbacks, the catalog editor, OpenFGA bootstrap, connection names and reason, metadata, log levels, the two Nango secrets, the console's sign out and Connect) are in `docs/content/build-spec.md`; B1 to B9 below summarise how they behave. D68 to D79 are in `docs/content/outbound-build.md` (the as-built outbound path); this table keeps each in one line. D76 is the console's one read that does not go through the registry. Note the repository's contract comments also use "D76" and "D77" for the mission and worker-name changes to `registerPublication`; the numbers above are those of `outbound-build.md` and `console.md`.

| # | Decision |
| --- | --- |
| D68 | One certificate per host group, issued automatically, signed by a Janus CA that only DT Dynamo workers trust; never a catch-all or a leaf minted for any SNI. Revision 2 groups hosts by registrable domain, so hundreds of hosts become tens of certificates. |
| D69 | The root (10 years) and the issuing intermediate (90 days, rotated at 30 days left) live in the Janus Vault in their own mounts (`janus-pki-root-1`, `janus-pki-outbound-1`); the root key is never exported, and the intermediate excludes the platform's own names. |
| D70 | A host becomes reachable when its connection becomes active (a type's fixed host, or a generic connection's own host). Reaching a host is not permission to call it: every call needs the run token and the grant. |
| D71 | The gateway's TLS half is served over xDS by `outbound-policy-1` (leaf keys in memory, verified like a worker would); a new, renewed or removed host needs no restart. |
| D72 | The publication names the worker; run tokens go only to that worker. As built, `outbound-policy-1` checks the caller's pod identity against the DynamoWorker resources of its namespace and checks the run in the tenant's Temporal namespace before STS mints the token (the root run's type must be the publication's root workflow). A publication without a worker name gets no tokens. |
| D73 | `outbound-policy-1` reads the registry database directly, read only: a revoke or a new revision applies to the next call. |
| D74 | Workers trust only the Janus roots, baked into their images (as decided in revision 2). `GET /v1/trust-bundle` remains for export. The network policy, not the trust store, is the boundary: worker pods have no direct internet. |
| D75 | The grant is the decision: a call with a valid run token whose activity is granted the connection is allowed. Path, method and body rules (D25, D30, D31) are the later phase. Credential injection follows each type's outbound spec (revision 2); rate limits are D79. |
| D76 | The console's system Outbound activity page reads the outbound audit bucket directly with its own read-only role, not through the registry. |
| D77 | The outbound audit goes to the audit S3 bucket as gzipped NDJSON, not through Temporal or Nexus: refusals always (`deny/`), allows only with `audit.capture` `all` (`allow/`), flushed at most every 5 minutes. Retention is the bucket's lifecycle rule per class prefix (`deny/`, `allow/`), set where the bucket is declared, not in code. The registry keeps only each connection's last-used time, reported over HTTP at most once a minute. |
| D78 | The outbound path caches its reads for 30 seconds; a registry change notifies (Postgres `LISTEN/NOTIFY`) and drops the caches at once. A refusal is never cached. |
| D79 | Outbound rate limits are per connection type: name, scope (`connection` or shared `type`), limit and a window from 1 second to 1 day; a connection may only lower its type's connection-scoped limits. Counted in sliding windows in `janus-redis-1` (Janus's own, one standalone pod, no persistence); a refusal is 429 `rate_limited` with the limit and the retry time, and the worker hooks retry after it. If Redis is down each outbound-policy-1 pod falls back to an in-memory limiter (fail open). Live usage is read on request through two outbound-policy-1 capabilities (`getConnectionRateLimitUsage`, tenant; `systemGetConnectionRateLimitUsage`, platform) and the console's **Check current usage** button; `systemSetConnectionRateLimits` (registry) sets per-connection overrides for an editor. |

## As-built decisions

Decisions taken while building and testing. The numbered decisions above stand; these refine them.

| # | Decision |
| --- | --- |
| B1 | **Providers are code, types are data.** A connection provider (where a credential is read from and how it is refreshed) is added in code through a registry migration and is read-only in the console. Platform staff with an editor session manage connection types, their links to providers, and which provider is active; every change is audited. A type is retired while connections use it and can be deleted only when nothing uses it. |
| B2 | **A type has a common name and a description.** Digital Teammates see one name (for example `google-calendar`) and a plain-text description. The provider behind it is not shown to tenants; a type can have several providers with exactly one active for new connections (D35). Changing the active provider affects new connections only and moves none (D43); the editor says so and asks for an acknowledgement. |
| B3 | **A connection says why it exists.** A request needs a reason (one concrete sentence, kept on the connection and in the audit) and never a name. The registry names connections itself: the type name, then numbered ("Google Calendar", "Google Calendar 2"); a generic type is named after its host ("API key – welcomehome.com"). Names are unique per tenant and type and a number is never reused. |
| B4 | **Requests are repeat-safe.** The same user asking again within 60 minutes for the same type (and host) gets the same pending connection with a fresh link and a message saying so; `forceNew` starts another and leaves the pending one. A user and a Digital Teammate go through the same capability, so the console's Connect button and the DT tool behave alike (the console needs an editor session). |
| B5 | **Connections carry display metadata.** A key/value set per connection (for example an account label that a provider supplies later), visible in reads, never a secret. Writers and renaming are later work. |
| B6 | **Two Nango secrets.** Nango's API key (scoped per component) and its webhook signing key are different and are stored separately; neither stands in for the other (`docs/content/nango-keys.md`). |
| B7 | **Calls to the gateway are asynchronous.** `ConnectionServiceV1.Execute` starts a workflow: callers receive the answer on their own callback listener (console-1, intake-1 and outbound-policy-1 each have one), reachable by Temporal's history service only. |
| B8 | **Log level is a chart value.** intake-1 and the registry read `LOG_LEVEL` (default info). Routine per-request events are debug; logs hold ids, outcomes and fixed-word causes, never a secret, session or link. |
| B9 | **One OpenFGA bootstrap.** A Job at each sync and an hourly check create Janus's OpenFGA store by name and keep its model; clients find the store by name. |

## As-built refinements of the outbound path

| # | Decision |
| --- | --- |
| B10 | **A publication is one parent workflow.** Its id is the registry's `pub_` id and its automation is the root workflow (`pwf_`); a mission (`msn_`) only groups publications. The OpenFGA model chain is mission, publication, workflow, activity, connection. |
| B11 | **A type states how its credential is applied** (`outbound` spec: inject into headers or query parameters with placeholders, static headers, headers to strip). A type without one uses its placement. `context` mode is refused. When an activity is granted two connections to the same host and path, the call names one with `x-janus-connection`; otherwise it is refused `ambiguous_connection`. |
| B12 | **No Nexus, no fail-open on the decision.** ext_authz refuses a call if `outbound-policy-1` cannot decide; only rate limiting fails open (D79). `recordCredentialUse` was removed from the registry (D77), and `outbound-policy-1` has no callback listener. |
| B13 | **Revoke deletes at the provider too.** `revokeConnection` destroys the stored secret versions and, for a Nango connection, deletes it in Nango, answering `providerDeletion` (`not_needed`, `done` or `pending`; revoking again retries a pending one). |
| B14 | **Workers have no direct internet.** The cluster network policy for Dynamo workers allows DNS, Temporal, the outbound gateway (3128) and the worker API (8090) only. The DT Dynamo operator injects the proxy, the worker API URL and the projected token (`platform.janus` in the nainai GitOps values). |

## Boundary

| Owns | Does not own |
| --- | --- |
| Connection types, providers, tenant connections and their revisions | The external systems themselves |
| Secret custody in `janus-vault-cluster-1`, and that Vault's configuration | Platform secret infrastructure for other services (`vault-cluster-2`, `vault-gitops`) |
| The Janus authorization model and its own OpenFGA: which workflow and activity may use which connection | Caller authentication and tenant roles (the auth cluster's STS and shared OpenFGA) |
| Brokering connections to DT Dynamo workers | Building and deploying DT Dynamo workers (gitjib, nainai) |
| Outbound policy, credential injection, rate limiting and audit of connection use | Inbound rate limiting (`api-gateway-1`) |
| The outbound gateway and the outbound PKI, Janus's own Redis | Which workers exist and their network and pod wiring (the DT Dynamo operator in nainai and the worker network policy in k8s-security carry the proxy, token and no-internet rules Janus relies on) |
| Credential intake from people and providers (from `connections-1`) | Tenant-facing UI framework (`frontend-cluster-1`) |

## Shape (as built)

| | |
| --- | --- |
| **Repository type** | Nexus-first: gateway + components, one umbrella chart |
| **Components** | `gateway-1` (the Nexus front: validates a call, routes it to a component's task queue); `connection-registry-1` (types, providers, connections, the editor, the request flow, audit); `intake-1` (HTTP: the connect page's session routes, credential form, Nango connect session and webhook); `oauth-provider-1` (Janus's internal OAuth providers; present, no provider enabled yet); `publish-1` (writes Janus's slice of each publication, including the worker it names, and its OpenFGA tuples); `vault-manager-1` (keeps the Janus Vault's desired state, destroys revoked secret versions and keeps the outbound PKI: root and issuing intermediate); `outbound-policy-1` (the outbound decision point: Envoy ext_authz engine for run token, grant, rules, rate limits and credential injection; the gateway's xDS server and certificate issuer; the worker API on port 8090; the audit writer; the two rate-limit usage capabilities); `outbound-gateway-1` (the Envoy that DT Dynamo workers reach through `HTTPS_PROXY`, TLS-terminating, with ext_authz and no fail-open; a de-v2 app, its configuration over xDS); `janus-redis-1` (Janus's own Redis for the rate-limit counters; a de-v2 app, Bitnami chart); `openfga-bootstrap-1` (Job and drift check for Janus's OpenFGA); `console-1` (admin and tenant console, with the Outbound activity page, per-type and per-connection rate limits and the live usage button); `janus-catalog-1` (the DT tools and skills) |
| **Stores** | Postgres `ob1-janus-db-1` (metadata, grants, catalog audit, Vault desired state, each connection's last-used time); `janus-vault-cluster-1` (secret values and the outbound PKI); Janus's OpenFGA (its own database); Nango (provider-managed connections); the outbound audit bucket in S3 (gzipped NDJSON, retention by lifecycle rule); `janus-redis-1` (rate-limit counters only, no persistence) |
| **Third-party charts** | HashiCorp Vault, OpenFGA and Redis (`janus-redis-1`) as de-v2 Applications (the `gitlab-1` pattern); the Redis app is pinned by hand |
| **Not built** | Path, method and body rules (the grant is the decision), the run hook for Go workers, credential `context` mode, wildcard type hosts, rotation and needs-reauth, a sweeper for failed Nango deletions, connection rename and metadata writers, a tenant-facing view of refused calls |

## Names

| | |
| --- | --- |
| Kubernetes namespace | `ob1-tf-eks-de-v2-janus-1-ns-1` |
| Vault | `janus-vault-cluster-1`, namespace `ob1-tf-eks-de-v2-janus-vault-1-ns-1` (deployed) |
| OpenFGA | `janus-openfga-1`, namespace `ob1-tf-eks-de-v2-janus-openfga-1-ns-1` (deployed); database `ob1-openfga-janus-db-1` |
| Argo CD project (Vault and OpenFGA) | `apps-janus-supporting-1-acd-proj-1` |
| Nexus endpoint (control surface) | `ob1-nexus-janus-cluster-1-endpoint-1` |
| Nexus service | `ConnectionServiceV1` |
| Gateway component, task queue | `gateway-1`, `janus-cluster-1-gateway-1-tq` |
| Netpol label, Vault Transit role | `budybot.io/netpol: janus-gateway-1`, `ob1_crossplane_vault_transit_janus_gateway_1` |
| Database | `ob1-janus-db-1` |
| Outbound gateway | `outbound-gateway-1` in the Janus namespace; proxy port 3128, ext_authz to `outbound-policy-1` on gRPC 9001, worker API on `outbound-policy-1` port 8090 |
| Redis (rate-limit counters) | `janus-redis-1` (master Service `janus-redis-1-master`), in the Janus namespace; de-v2 app in `apps-janus-supporting-1-acd-proj-1`; Vault role `janus_redis_1`, Netpol label `budybot.io/netpol: janus-redis-1` |
| Outbound audit bucket | `ob1-tf-budy-janus-outbound-audit-bucket-<AWS account id>`; writer role for `outbound-policy-1`, read-only role for `console-1` |
| Janus Vault PKI mounts | `janus-pki-root-1`, `janus-pki-outbound-1` |
| Umbrella chart | `janus-cluster-1-repo-1` |
| Image repository | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_janus-cluster-1_repo-1` |
| Helm repository | `ob1-helm-chart-repo-v1/janus-cluster-1-repo-1` |

## Interfaces, callers and callees

- **Nexus (control surface):** endpoint `ob1-nexus-janus-cluster-1-endpoint-1`, service `ConnectionServiceV1`, operations `Execute` and `DescribeCapabilities`. The caller sends `{component, capability, payload, auth}`; the gateway checks the caller's STS token, the registry checks scope and session boundary. 32 capabilities: `connection-registry-1` 25, `publish-1` 3, `outbound-policy-1` 3 (the two rate-limit usage reads and a stub), `vault-manager-1` 1. Callers: Digital Teammates (through the catalog tools, tenant scope), the console (as the signed-in user), intake-1 (a workload identity) and the publishing service (`registerPublication`, `retirePublication`). Outbound decisions are **not** made through Nexus. See [Nexus contracts](nexus-contracts.md).
- **Outbound path (not Nexus):** ext_authz (gRPC 9001) from `outbound-gateway-1` to `outbound-policy-1` on every outbound call; the worker API on `outbound-policy-1` port 8090 (`GET /v1/trust-bundle`, `POST /v1/run-tokens` with the worker's projected service account token); the connection last-used report, `POST /v1/connection-usage` on the registry's usage port (plain HTTP, only `outbound-policy-1`); the outbound audit bucket in S3 (written by `outbound-policy-1`, read by the console). Details in [Nexus contracts](nexus-contracts.md) ("Outbound path (not Nexus)").
- **HTTP behind `api-gateway-1`:** `POST /v1/connections/session/inspect`, `/session/connect`, `/session/status`, `/credentials` (capability authentication: a signed one-time session in the body, no app bearer token) and `POST /v1/connections/webhooks/nango` (signature authentication), all to `intake-1`. The connect page itself is served by `frontend-cluster-1` at `/connections/connect`.
- **Console:** its own host, tenant and system scope, entered from the platform UI.
- **Dependencies:** Temporal cluster and the Janus namespace (Nexus, workflows; the run check reads the tenant's Temporal namespace); STS and authz-config (identities, scope `janus-platform-1`, session boundary, run tokens); `janus-vault-cluster-1` (secrets, outbound PKI) and `vault-cluster-2` (seal, TLS, the Vault Secrets Operator's keys); Postgres; `janus-openfga-1`; `janus-redis-1`; the outbound audit bucket (cloud-management); Nango (hosted); `api-gateway-1` (routes and open paths); the DT Dynamo operator in nainai (proxy, worker API URL and token injected into every worker); k8s-security and ArgoCD projects (network policy, destinations).
- **Callees on behalf of workers (enforced through the outbound gateway):** the external systems behind connections, reached only with a run token, the activity's grant and within the type's rate limits.

## Open questions (summary)

The full list, with notes, is section 7 of `docs/content/handover.md` in the repository. The main ones now:

1. **Outbound, remaining** (owner-led): rules on path, method and body from the publish (D25, D30, D31), the one piece not yet built; the Go worker hook (D33); credential `context` mode; wildcard type hosts; the explicit Temporal authorizer read grant for the run check before the authorizer enforces (it audits today); whether a new connection type needs outbound onboarding beyond activating a connection (the host set follows active connections, D70).
2. A way to **rename** a connection, and which component writes display metadata such as an account label when a provider connects.
3. Whether the registry's editor-time Nango check should keep reading integration credentials (it needs a credential-reading scope only to see an integration's OAuth scopes).
4. How to keep `publish-1` the only writer of tuples in Janus's OpenFGA (mesh identity with an `AuthorizationPolicy`, a read-only proxy, or both).
5. The typed publish capabilities in nainai and events-cluster that the publication registry's saga calls. The registry is the [Mission registry](../dt-consulting-services-1/mission-registry.md) (`mission-registry-1`); its saga calls `registerPublication` here, with the worker identity of D72.
6. How the DT and its DT manager are identified in Janus's OpenFGA, and the later flow for moving connections between providers.
7. Whether tenants should get their own view of refused calls, and whether tenant editors may lower limits on their own connections (today platform staff only; see the PRD).

## Detailed Docs

| Name | Type | Link |
| --- | --- | --- |
| Phases 0–3 | plan | section 4b of `docs/content/handover.md` in `Budybot/janus-cluster-1_repo-1` |
| Handover: decisions, workstreams, cross-repository changes, open questions | design | `docs/content/handover.md` in `Budybot/janus-cluster-1_repo-1` |
| Proposed architecture | design | `docs/content/architecture.md` in `Budybot/janus-cluster-1_repo-1` |
| Outbound enforcement and publishing, as built (D68 to D79) | design | `docs/content/outbound-build.md` in `Budybot/janus-cluster-1_repo-1` |
| Outbound revision 2 (publish model, run check, credential spec, certificates per domain, trust roots in images) | design | `docs/content/outbound-revision-2.md` in `Budybot/janus-cluster-1_repo-1` |
| Outbound egress control options (the original design) | design | `docs/content/outbound-egress-control.md` in `Budybot/janus-cluster-1_repo-1` |
| Infrastructure wiring (names, ports, audit, usage, caches, rate limits, Redis) | design | `docs/content/infra-wiring.md` in `Budybot/janus-cluster-1_repo-1` |
| Remaining work | plan | `docs/content/remaining-work.md` in `Budybot/janus-cluster-1_repo-1` (its outbound section is superseded by `outbound-build.md`) |
| PRD | design | [Product Requirements](prd.md) |
| HLD | design | [High Level Design](hld.md) |
| TRD | design | [Technical Requirements](trd.md) |
| Nexus contracts | api contract | [Nexus contracts](nexus-contracts.md) |
| Nango keys and scopes | design | `docs/content/nango-keys.md` in `Budybot/janus-cluster-1_repo-1` |
| Admin editor and console | design | `docs/content/admin-editor.md`, `docs/content/console.md` in `Budybot/janus-cluster-1_repo-1` |
| Build decisions D50 to D67 | design | `docs/content/build-spec.md` in `Budybot/janus-cluster-1_repo-1` |
| Connect page and intake | design | `docs/content/intake.md` in `Budybot/janus-cluster-1_repo-1` |
| DT tools and skills | design | `docs/content/catalog.md` in `Budybot/janus-cluster-1_repo-1` |
| Repository | source | `Budybot/janus-cluster-1_repo-1` |
| Group index | index | [Execution Mode Services](../info.md) |
