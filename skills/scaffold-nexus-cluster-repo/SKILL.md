---
name: scaffold-nexus-cluster-repo
description: Bootstrap or standardize the SOURCE repository of an OB/Budy execution-mode application cluster — a Go monorepo with one Nexus gateway (the only externally reachable Nexus component), a capability registry with dynamic routing and discovery, STS-over-HTTP authentication, and independently released component components, plus optional non-Nexus components. Use for new *-cluster-1 repos, adding a component/component to an existing cluster, migrating a cluster onto the standard (shared Go modules, shared Helm library, entry workflows pinned to @v1, component catalog, AGENTS.md), or deciding what plumbing belongs outside the repo. The reference instance is nainai-cluster-1. For the ordered end-to-end runbook (every shared repository, merge order, first release) use provision-nexus-cluster; for the cross-repo onboarding detail (GitHub/ECR/namespace/Vault/security/ArgoCD/GitOps/Kargo) use scaffold-ob-application; for the release state machine use manage-ob-application-cicd.
---

# Scaffold a Nexus-first cluster repository

Status: **standard v0.2** — owner decisions of October 2026 applied. Derived from `context-cluster-1` and `dt-manager-1`; **`nainai-cluster-1_repo-1` is the reference instance** that implements everything below. Copy it, do not re-derive it. Items still open are listed at the end.

This skill covers **one repository**. The end-to-end runbook that provisions a whole cluster (all shared repos, in order) is `provision-nexus-cluster`. Cross-repo onboarding (repo declaration, ECR/Helm repos, namespace, Vault, k8s-security, AppProject, GitOps `app.yaml`, Kargo train) is `scaffold-ob-application`; the PR/release state machine is `manage-ob-application-cicd` and `v2/gitops/application-cicd-standard.md`. Do not restate those here — link them.

## Vocabulary (use these words consistently)

| Term | Meaning |
| --- | --- |
| **Cluster** | One application: one source repo, one Kubernetes namespace, one Temporal namespace, one umbrella chart, one ECR image repo, one Helm ECR repo. |
| **Component** | Any independently released unit in the repo: a Go module + changeset package + image + sub-chart. The generic word used in `components.json`, CI and docs. |
| **Gateway** | The one component that terminates the cluster's Nexus endpoint. It authenticates, validates and routes; it holds no business logic and no state. |
| **Worker component** | A component that is a Temporal worker on its own task queue and implements capabilities behind the gateway. The gateway never imports one. Its capability name equals its component name (for example `billing-1`), so its task-queue variable is `<COMPONENT>_TASK_QUEUE`. |
| **Capability** | A named operation a component supports plus its JSON Schema, published as data in a manifest (see `references/nexus-and-capabilities.md`). |

**"Component" is the only term** for a deployable unit of the cluster; there is no separate word for workers. The kinds of component are the gateway, worker components, and non-Nexus components (UI/BFF, hosted software, controllers). A library or store is not a component. The word "provider" is reserved for external systems (the Crossplane provider, `providerConfigRef`). There is no compatibility layer for the old `provider:` / `ProviderCapabilities` manifests: when context-cluster migrates onto the kit it renames its manifest keys.

## One repository type

**Every execution-mode repository is the same Nexus type** (owner decision): it has **a gateway and, as the cluster grows, one or more worker components** (the reference starts with the gateway only), and may also contain non-Nexus components (a UI/BFF, hosted software, controllers) that are catalog entries like any other. The standard below applies to all eight new repos (`nainai-cluster-1`, `gitjib-cluster-1`, `pitcrew-cluster-1`, `dt-consulting-services-1`, `events-cluster-1`, `janus-cluster-1`, `studio-services-cluster-1`, `karkhana-cluster-1`). What differs between them is the contract, the components and the extra components, not the platform shape. Non-Nexus components share everything except the gateway rules; hosted third-party software still gets a thin wrapper component and the same catalog, chart, CI and README.

## The standard in thirteen rules

1. **Monorepo, many Go modules, one `go.work`.** One module per component plus `shared/contract`. Both `go.work` and `replace` for in-repo modules are committed. (`references/layout-and-modules.md`)
2. **One public contract module** — `shared/contract` — holds the Nexus endpoint/service/operation constants, STS audience, and typed capability payloads. Released with module-prefixed Git tags (`shared/contract/vX.Y.Z`); the only module other repos import.
3. **One Nexus endpoint per cluster, never versioned**: `ob1-nexus-<cluster>-endpoint-1`. The public API version lives in the **service name** (`<Domain>ServiceV<N>`). Every service exposes the same two operations, `Execute` and `DescribeCapabilities`; what varies is the capabilities.
4. **Capability registry with dynamic routing and discovery is universal** (owner decision). Capabilities are YAML manifests (`apiVersion: capabilities.budy.bot/v1`, `kind: ComponentCapabilities`) in a ConfigMap; the gateway validates and routes from them, serves them back through `DescribeCapabilities`, and rolls on checksum change. Adding a capability or component needs no gateway code. The registry and the gateway kit are shared Go modules (`go/capability` in `budy-common-modules`), not repo code. A conformance test (`capabilitytest.Verify`) replaces lint scripts.
5. **Every gateway authenticates the same way** (owner decision): an STS bearer token verified over HTTP against the auth cluster's JWKS endpoint (`go/capability/gateway/stsauth`). Issuer, JWKS URL, audience (`urn:budy:nexus:<endpoint>:<Service>`) and claim names are deployment values; the token fixes tenant and user. The gateway needs egress to `sts-service` on 8080.
6. **Tenancy is enforced twice**: the gateway fixes the identity from the token; every component activity asserts the tenant first.
7. **Workflows are deterministic and versioned**; all I/O is in activities; workflow type names carry `V<N>`; rollout is Temporal Worker Deployment Versioning, Pinned, Build ID = component version.
8. **Component catalog is the single source of release metadata**: `.github/components.json` (including `release` and `chart` settings). Adding a component = one catalog entry + module + sub-chart, never workflow edits.
9. **Workflows in the repo are two thin callers of the platform-actions entry workflows, pinned to `@v1`**: `ci.yml` → `app-cluster-ci.yml`, `release.yml` → `app-cluster-release.yml`. No local copies of any CI/CD logic. (`references/ci-and-release.md`)
10. **One parameterized Dockerfile** for all Go components (`COMPONENT`, `BINARY_TARGET`), distroless nonroot, BuildKit secret `github_token` handled as the reference Dockerfile does. One ECR repo, tags `<component>-<version>-<short-sha>`.
11. **Charts: umbrella + one sub-chart per component, built on the `platform-app-cluster` Helm library** (plus `platform-capability` in the gateway chart) (published from `ob1-mn-github-helm-charts-repo-1`). Names, labels, the WorkerDeployment, identity/Vault wiring, capability ConfigMap and checksum, shared ConfigMaps and the Temporal resources come from the library; the repo holds values and a few `include` lines. `global.enabled: false` renders an empty release. (`references/helm-standard.md`)
12. **`AGENTS.md` is mandatory and carries the platform context** (CI/CD, layout, cluster and GitOps map). Start from `references/agents-md-template.md`.
13. **Every named platform entity ends in `-1`** (owner decision): repository, cluster, every component and its chart, image prefix, queue, endpoint, namespace. The suffix is a generation number so `<name>-2` can run beside `<name>-1`. Services, workflow types and the contract module carry their own versions; the umbrella chart keeps the platform's `<repo>-repo-1` name. (`references/layout-and-modules.md`)

## Bootstrap procedure

Prerequisites (owned by other skills/repos; confirm they exist, never create them from the source repo): repository declared in `github-infra`; ECR image + Helm repos and namespace in `budy-cloud-management`; AppProject destination in `argocd-critical-stack`. The shared pieces must be released: `go/capability` and `go/worker` (with `standard`) tags, `platform-app-cluster` and `platform-capability` in ECR, platform-actions `@v1` including the entry workflows.

Work in this order; each step leaves the repo green. Fastest path: copy `nainai-cluster-1_repo-1`, rename, then adapt.

1. **README and `AGENTS.md`** from `references/readme-template.md` and `references/agents-md-template.md`; link the service doc in the wiki.
2. **Root tooling**: `go.work`, `Makefile` (`build test vet fmt tidy lint helm-login helm-deps helm-lint helm-template`; `MODULES` drives loops), root `package.json`, `.changeset/config.json`, `.gitignore`, and the **committed root `package-lock.json`** (`npm install --package-lock-only`): without it Changesets cannot see the workspaces and the first Release PR job fails.
3. **`shared/contract`**: endpoint, service, operations (aliases of the shared envelope), STS audience, typed capability payloads, and the test that ties the endpoint constant to the chart.
4. **`gateway/`**: about 100 lines of wiring over the kit (`capability.LoadDir`, `stsauth.New`, `dispatch.NewService`, `dispatch.Register`, `standard.TemporalConfig`). No routing, validation or auth code.
5. **First component** (skipped in a gateway-only first pass, decision 7; the registry is then empty): one entrypoint workflow `<Name>WorkflowV1` switching on capability, activities with the tenant assertion first, Pinned registration, and a `capabilitytest.Verify` test against the gateway chart's manifest. Mark stubs as stubs.
6. **Dockerfile** and `configs/runtime/` manifests (copy from the reference).
7. **Charts** on `platform-app-cluster` (and `platform-capability` for the gateway): umbrella `charts/<cluster>/`, sub-charts per component, manifests in `charts/gateway-1/files/capabilities/`.
8. **CI**: `.github/components.json` (with `release` and `chart` blocks), `ci.yml` and `release.yml` from `templates/`.
9. **First release and smoke test**: changeset, merge, Release PR, images, chart PR, chart publish, then the cross-repo PRs in the order of `references/gitops-and-bring-up.md` (`scaffold-ob-application` numbered handoff), Kargo promotes to dev; call `DescribeCapabilities` and, once a component exists, one capability through the endpoint (a gateway-only first pass stops at `DescribeCapabilities` and a denied-tenant call); record results in `docs/build/`.

Definition of done for bootstrap: README and AGENTS.md present; `make build test vet helm-template` green; PR CI green with `ci / ci-required`; one image per component in the cluster ECR repo; umbrella chart published; dev app Healthy; smoke test recorded.

## Adding a component

Purely additive — **no gateway code change**:

1. `components/<name>/` Go module (`go.mod` with `replace` for `shared/contract`), `cmd/worker/main.go`, entrypoint workflow, activities.
2. Manifest `charts/gateway-1/files/capabilities/<name>-1.yaml`; the component's `capabilitytest.Verify` test fails if `taskQueue`/`workflowType` differ from what the worker registers.
3. Sub-chart `charts/<name>/` on the library; add the component to `global.components` and as an umbrella dependency with `condition: <name>.enabled`.
4. `package.json` (private, version only) so it is a changeset package; one catalog entry (`depends_on: ["contract"]`, `chart_values_image_tag_path`, `docker.build_args`); `go.work`, root `package.json` workspaces (then regenerate `package-lock.json`), Makefile `MODULES`.
5. Cross-repo: a new `budybot.io/netpol: <prefix>-<component>` identity in k8s-security (network policy and the `BudyNetpolIdentity` allow-list). See `scaffold-ob-application`.

## What stays outside the repo

| Concern | Lives in | In-repo footprint |
| --- | --- | --- |
| Registry, gateway dispatch, STS auth, worker bootstrap (`standard`), runtime config reader, health, Vault-transit codec | `budy-common-modules` (`go/capability`, `go/worker`, `go/runtimeconfig`) | imports and about 100 lines of wiring per process |
| WorkerDeployment, identity/Vault wiring, capability ConfigMap + checksum, shared ConfigMaps, Temporal CRs, naming, `global.enabled` | `platform-app-cluster` library chart, plus `platform-capability` for the gateway's capability ConfigMap and checksum (`ob1-mn-github-helm-charts-repo-1`) | `dependencies:` entries and `include` lines |
| PR CI, Release PR, image build/push, module tags, git tags, chart PR, chart publish, GitOps PR | `platform-actions@v1` entry workflows | two callers of about 10 lines each + `components.json` |
| Repo, ECR, namespace, Vault, security, ArgoCD, GitOps values, Kargo | other repos (see `scaffold-ob-application` and the AGENTS.md template) | none |
| Contract, workflows, activities, manifests, schemas, chart *values* and component-specific templates | the cluster repo | all |

## Decisions taken (October 2026)

1. Capability registry with dynamic routing and discovery in **every** repo; extracted to `go/capability`.
2. Manifest identity renamed to `capabilities.budy.bot/v1` / `ComponentCapabilities`; one vocabulary, no compatibility with the older `provider` manifests.
3. Helm helpers live in the helm charts repo as two libraries: the generic `platform-app-cluster` and the gateway-only `platform-capability`.
4. ECR is the only chart registry. GHCR was spiked (October 2026) and not adopted: cross-repo reads need per-package grants that have no API (`references/helm-standard.md` §5).
5. platform-actions gets entry workflows; the library's earlier "jobs, not event flows" stance now has this one exception, for cluster repos.
6. All repos are the same Nexus type; every gateway uses STS-over-HTTP authentication.
7. Nexus service names, one per cluster: `DeploymentServiceV1` (nainai), `GitjibHostingServiceV1`, `PitcrewServiceV1`, `DTConsultingServiceV1`, `KarkhanaServiceV1` (karkhana-cluster-1), `EventsServiceV1`, `ConnectionServiceV1` (janus). The sibling clusters start with the gateway only (`gateway-1`) and add components one at a time, as nainai did. Pending defaults, not decisions until the owner confirms them (a rename is cheap before the first release): `ArtifactServiceV1` (studio-services-cluster-1).
8. GitOps values (de-v2) go in the lowest layer where they are true: base, then tier profile; `env` only for what exists because a separate AWS account is involved. Defaults are never repeated, and the stage/prod off switch is a profile value (`references/gitops-and-bring-up.md`).

## Defaults

- **Vault Transit and the external payload store (`temporal-s3-storage-1`) are on by default for new Nexus clusters**, set in the GitOps base values with a per-component `vaultTransit.vaultRole` named `ob1_crossplane_vault_transit_<cluster>_<component>_1` (Crossplane creates the role and keys; no vault-gitops change). Codec `payloadEncryption` stays off until validated. The cluster namespace also needs the `temporal-workers.allow-external-payload-store-and-vault` egress policy in k8s-security.

## Open items

- **Scope: new repositories only.** The standard is a clean start; context-cluster and dt-manager are not planned to move to it and nothing here is kept compatible with them. If one ever does, it is a migration project of its own.
- **Dockerfile hosting**: still copied per repo; a candidate for platform hosting.
