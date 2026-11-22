---
name: gitjib-cluster-1
kind: service
description: Hosts self-managed GitLab and a private npm registry for tenant-private and platform-shared workflow repos, approved dependencies, versioned packages, forks and PR-based contributions.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/gitjib-cluster-1_repo-1
status: active
tags: [execution-mode, application-cluster, go, gitlab, npm-registry, package-proxy, hosted-software]
interfaces: []
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

# gitjib-cluster-1

gitjib-cluster-1 hosts self-managed GitLab and a private npm registry. It supports tenant-private workflow repositories and platform-visible shared repositories, approved dependencies, versioned packages, forks, and PR-based contributions.

> **Status: active.** The repository holds `gateway-1`, `admin-1`, `console-1`, `token-broker-1` and `package-gate-1`. This page describes the public package allow-list and `token-broker-1`; `admin-1` and `console-1` are described in the repository (`docs/admin-1.md`, `docs/console-1.md`). Sections marked *proposed* are drafted from the original brief and the cluster standard and are not decisions.

## Public package allow-list

Which **public** npm packages and Go modules the platform's CI package proxies serve. Internal packages (npm scope `@budybot/`, Go host `git.budy.internal` and each environment's GitLab) are always served and are never on the list. There are no tenant packages.

| | |
| --- | --- |
| **Source of truth** | The GitJib admin database (`ob1-gitjib-db-1`): one row per entry, an append-only audit trail (who requested it, when, why, the list version that carried it; `UPDATE`, `DELETE` and `TRUNCATE` are refused) and hourly pull counters per package. |
| **Changes** | System-scope capabilities of `admin-1` over Nexus (`GitjibHostingServiceV1`): `addPublicPackage`, `addPublicPackages` (up to 500 names), `removePublicPackage`, `listPublicPackages`, `listPublicPackageEvents`, `getPublicPackagePulls`. Writes need `may_administer_gitjib_1` and reads `may_view_gitjib_1` on `platform:budy-sl-platform-1`, with the token's live platform session. No pull request, no restart. |
| **Entries** | npm: exact names (`lodash`, `@types/node`). Go: module path prefixes matched by whole segments (`github.com/google/uuid` covers `/v2`); a bare host or account (`github.com/google`) is refused. |
| **Delivery** | `admin-1` renders the active entries into the ConfigMap `public-package-allowlist-1` in each proxy namespace (both replicas serialise on a database lock). The `package-gate-1` container in each proxy pod re-reads it every 2 s. An entry becomes `published` (or `removed`) only when every gate reports exactly the list version that carries it (or no longer carries it). |
| **Enforcement** | `package-gate-1` sits in front of Verdaccio (`npm-proxy-1`) and Athens (`go-proxy-1`) and answers 403 for anything public that is not listed, whether or not the proxy has it cached. It fails closed: with no readable list after `GATE_MAX_STALE` (15 min), public traffic is refused. The proxies' own rules cannot do this: Verdaccio keeps serving a cached package after its rule is removed, and Athens never reloads its filter. |
| **Starting list** | Seeded once per environment by `admin-1` migrations: `0004` (what an ARM64 build of the TypeScript worker installs, and the Go worker's `go.sum`) and `0005` (the shared libraries repository's build tooling). A seed never re-adds a package an administrator removed. |
| **Pull metrics** | Each gate counts lookups, pulls and refusals per name on its stats port (9100, admin-1 only); `admin-1` stores the deltas per hour, so `getPublicPackagePulls` shows use and refused requests per day. |

Where things live:

| What | Where |
| --- | --- |
| Capabilities, tables, sync loop, seed | `Budybot/gitjib-cluster-1_repo-1`: `components/admin-1`, `docs/admin-1.md` ("The public package allow-list") |
| The gate | `Budybot/gitjib-cluster-1_repo-1`: `components/package-gate-1` |
| Design history (spikes) | `Budybot/gitjib-cluster-1_repo-1`: `docs/spikes/` |
| Proxy deployment (gate image tag, ports, scope `@budybot`) | `Budybot/ob1_mn_gh_de-v2_gitops_repo_1`: `charts/apps/npm-proxy-1`, `charts/apps/go-proxy-1`, `docs/package-proxies.md` |
| Network policy, RBAC for the ConfigMap write | `Budybot/ob1_mn_github_k8s-security_gitops_repo_1` |

Shared platform packages are published from GitLab only: the GitHub repository `dynamo-worker-libs_repo-1` is mirrored into the GitLab group `budybot`, whose pipeline publishes `@budybot/*` npm packages to that project's registry and tags Go modules `modules/<name>/v<version>` (module path `git.budy.internal/budybot/dynamo-worker-libs_repo-1.git/modules/<name>`).

## token-broker-1

`token-broker-1` is an HTTP component of gitjib-cluster-1 (not a Temporal worker, no capabilities, not reached through `gateway-1`). Code and README: `components/token-broker-1` in `Budybot/gitjib-cluster-1_repo-1`; chart `charts/token-broker-1`. It has two jobs: an Envoy `ext_authz` endpoint that lets pods and agents use their STS token as a GitLab token, and an exchange of a GitLab CI ID token for short-lived AWS builder credentials.

| | |
| --- | --- |
| **GitLab role of a session** | Resolved from OpenFGA, not from the user id: the role whose tenant relation the session's user holds on the session's tenant. `config.authz.roleRelations` (chart default): `coder` is `active_svcrole_dtcs_coder_1`, `reviewer` is `active_svcrole_dtcs_reviewer_1`. A user with none, or with the relations of more than one role, is refused; so is any OpenFGA error. |
| **Session fact** | Each check carries the token's session as a contextual tuple (`user:<sub> session_<session_boundary> tenant:<tenant>`); a token without a viewer, editor or admin `session_boundary` is refused. |
| **`current_time`** | Every OpenFGA check carries `current_time` (UTC, RFC 3339), because the coder relation can be held through a time-bound grant (`non_expired_grant`); without it OpenFGA answers with an error. A positive result is cached for `authz.cacheTtl` (default 30s, at most 1m), never past the token's expiry. See [Component Authorization Module Standard](../../../gitops/authorization-module-standard.md#13-conditional-grants-pass-current_time). |
| **Teammate** | The token's optional `glassbox_id` is the billing entity. When it equals the `spec.name` of one of the tenant's DigitalTeammates, that teammate is the session's teammate and the request is confined to that teammate's GitLab group; a `glassbox_id` that names no teammate of the org is refused. Without it (or equal to the tenant id) the teammate is picked per request from the project path, the DynamoWorker project id or the `X-Budy-Teammate` header. |
| **Accounts** | One coder and one reviewer GitLab service account per org (`UserOrg.spec.gitlab.identities`); the caller never sees a GitLab credential. |

State at the time of writing (de-v2 main, verified in `charts/apps/gitjib-cluster-1/values`):

- The component is **disabled in every environment**: `token-broker-1.enabled: false` in the chart default values, with no override in the base, environment or profile values. Dev has its OpenFGA store id and AWS role ARNs set. Enabling it in dev is de-v2 PR 2415, open on 13 November 2026.
- The **GitLab proxy in front of it is not built**: no Envoy route or filter that sends GitLab requests to the broker's `/authz` endpoint was found in the gitjib chart or the de-v2 gitjib values (the tested Envoy configuration is only a spike file, per the component README); the fact sheet says the proxy is not yet built. Sandboxes therefore have no GitLab access (the `sandbox-coder-1` network profile has no GitLab rule either).

## Boundary (proposed)

| Owns | Does not own |
| --- | --- |
| Running GitLab and the npm registry in the cluster, their configuration and upgrades | The workers that execute workflow code (nainai-cluster-1) |
| The visibility model: tenant-private versus platform-shared repositories | Tenant lifecycle and identity (platform operator, auth cluster) |
| The approved-dependency policy and versioned package publication | Which events trigger workflows (events-cluster-1) |
| Forking and PR (GitLab merge request) contribution flow between shared and tenant repositories | |

## Proposed shape

| | |
| --- | --- |
| **Repository type** | Nexus-first (gateway + provisioning component) plus hosted software behind thin wrapper charts |
| **Components** | Wrapper charts for GitLab and the registry; a provisioning component (Go/Temporal) that creates tenant groups, repositories and registry scopes |
| **Nexus surface** | A control gateway (`GitjibHostingServiceV1`) exposing the provisioning operations to platform callers, built on the shared kit like every other gateway |

The standard's gateway rules (STS authentication, capability registry, tenancy twice) apply to the control gateway and the provisioning component. The hosted software itself is configured, not rewritten; it is a non-Nexus component with a catalog entry, wrapper charts and the same CI, charts, README and changesets as everything else.

**First pass (October 2026):** the gateway only (`gateway-1`), like `nainai-cluster-1`; the components above are added one at a time afterwards, each as a catalog entry.

## Names (derived from the standard)

| | |
| --- | --- |
| Kubernetes namespace | `ob1-tf-eks-de-v2-gitjib-1-ns-1` |
| Nexus endpoint (control gateway, unconditional) | `ob1-nexus-gitjib-cluster-1-endpoint-1` |
| Nexus service (decided) | `GitjibHostingServiceV1` |
| Gateway component, task queue | `gateway-1`, `gitjib-cluster-1-gateway-1-tq` |
| Netpol label, Vault Transit role | `budybot.io/netpol: gitjib-gateway-1`, `ob1_crossplane_vault_transit_gitjib_gateway_1` |
| Umbrella chart | `gitjib-cluster-1-repo-1` |
| Image repository | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_gitjib-cluster-1_repo-1` |
| Helm repository | `ob1-helm-chart-repo-v1/gitjib-cluster-1-repo-1` |

## Callers and callees (assumed, unconfirmed)

- Consumers of packages and workflow repositories: nainai-cluster-1 (loads updates), events-cluster-1 ("published workflows"), dt-consulting-services-1 (code changes and PRs), build pipelines (assumed).
- Identity: platform SSO / auth cluster for GitLab login and token exchange (assumed).

## Open questions

1. ~~**Registry choice.**~~ *Decided:* platform packages are published to GitLab's package registry (group `budybot`, scope `@budybot`); CI resolves everything through the Verdaccio and Athens proxies (see *Public package allow-list*).
2. **Packaging unit.** What is published as an npm package in a Go-first platform: workflow definitions, SDKs, DT code? Who consumes it and how is a version pinned?
3. ~~**Approved dependencies.**~~ *Decided:* an allow-list in the GitJib admin database, changed through `admin-1` system capabilities by platform administrators and enforced by `package-gate-1` (see *Public package allow-list*).
4. **Tenancy mapping.** One GitLab group per tenant? How does the platform tenant map to GitLab identity, and how is platform-visible content shared read-only to tenants?
5. **Forks and PRs.** Fork from shared repositories into tenant space and contribute back by merge request; what is the review authority for shared repositories?
6. **Hosting model.** GitLab's Helm chart with managed PostgreSQL, Redis and object storage, or an omnibus-style install? Sizing, backup and restore, and upgrade policy. This is infrastructure work that crosses `budy-cloud-management`, Vault and `k8s-security`.
7. **GitHub versus GitLab.** The rest of the platform is on GitHub. Who uses GitLab (tenants, DTs, platform), and is there any GitHub synchronization?
8. **Control surface.** Is a Nexus provisioning gateway needed, or is the cluster operated through GitLab's own API from other services?

## Detailed Docs

| Name | Type | Link |
| --- | --- | --- |
| PRD / HLD / TRD | design | not written yet; use the wiki `service-design-docs` skill |
| admin-1 (incl. the public package allow-list) | reference | `docs/admin-1.md` in `Budybot/gitjib-cluster-1_repo-1` |
| Allow-list spikes | design history | `docs/spikes/` in `Budybot/gitjib-cluster-1_repo-1` |
| Package proxies | reference | `docs/package-proxies.md` in `Budybot/ob1_mn_gh_de-v2_gitops_repo_1` |
| Repository | source | `Budybot/gitjib-cluster-1_repo-1` |
| Group index | index | [Execution Mode Services](../info.md) |
