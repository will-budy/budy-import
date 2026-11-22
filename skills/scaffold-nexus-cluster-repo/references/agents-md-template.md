# AGENTS.md template for a Nexus-first cluster repository

`AGENTS.md` is mandatory (rule 12). It is the first file an agent or new developer reads, so it must carry the **platform context** the code alone cannot: how this repo is built and released, how it is laid out, which other repositories hold its infrastructure, Vault roles, network policy, GitOps values and Kargo train, which branches and value layers exist, and the rules that exist because something broke. The reference instance is `nainai-cluster-1_repo-1/AGENTS.md`; the template below is that file with the cluster-specific names replaced by placeholders.

How to instantiate:

1. Replace `<cluster>` (e.g. `nainai-cluster-1`), `<short>` (the cluster name without its trailing `-cluster-<n>` or `-<n>`, used in the namespace and netpol labels), `<Domain>`, `<name>`, `<capability>` and the description in the first bullet list.
2. Keep sections 1 to 3 truthful about what the repo contains; delete rows of the layout and component lists that do not apply, add the non-Nexus components (UI/BFF, hosted software) with what differs about them.
3. Keep sections 6 to 8 as they are unless the platform changed; they are shared platform facts. If a fact here turns out wrong, fix the template and every instance.
4. Section 9 lists what has **not** been verified; keep it honest, shrink it as things are verified, never delete an unverified item silently.
5. Link the repository's wiki service document and keep "Current state" accurate (what is stubbed, what is deployed).

Sections: 1 model in one screen · 2 repository layout · 3 conventions · 4 recipes (add a capability, add a component, change the contract) · 5 build, test, lint · 6 CI/CD (PR flow, release flow, rules that exist because of past failures) · 7 where the rest of the platform lives (repo map table) · 8 environments, GitOps value layers and Kargo promotion (including "disabled by default outside dev") · 9 operating notes (smoke test, rollout behaviour, unverified items) · 10 current state.

````markdown
# <cluster> — agent and developer guide

How to work in this repository and how it fits the platform. Read it before changing code, charts, workflows or any of the repositories it deploys through. It is also the reference instance of the Nexus-first cluster standard (wiki skill `scaffold-nexus-cluster-repo`): when a rule here and the skill disagree, fix whichever is wrong.

- **What it is:** a Nexus-first cluster that manages DT Dynamo Worker deployments (loads updates, starts and restarts workers, coordinates transitions while older workflows still run). Today it exposes one read-only stub capability; see "Current state".
- **Wiki:** [service document](https://github.com/Budybot/ob1_mn_gh_ob-platform-wiki_repo_1/blob/main/v2/micro-services/execution-mode-services/<cluster>/info.md), [standard](https://github.com/Budybot/ob1_mn_gh_ob-platform-wiki_repo_1/blob/main/skills/scaffold-nexus-cluster-repo/SKILL.md), [Application Cluster CI/CD Standard](https://github.com/Budybot/ob1_mn_gh_ob-platform-wiki_repo_1/blob/main/v2/gitops/application-cicd-standard.md).

## 1. The model in one screen

```text
other clusters ── Nexus ──▶ gateway-1 (<cluster>-gateway-1-tq)
(Temporal workflows)           │ 1 authenticate (STS token, JWKS over HTTP)
                               │ 2 validate payload (capability JSON Schema)
                               ▼ 3 route: child workflow on the manifest's task queue
                       <name> (<cluster>-<name>-tq)
```

- **One Nexus endpoint per cluster:** `ob1-nexus-<cluster>-endpoint-1`. Never versioned. The Go constant (`shared/contract`) and the chart's derived name must agree; a test enforces it.
- **Service `<Domain>ServiceV1`, fixed operations:** `Execute` and `DescribeCapabilities`. What differs between clusters is the registered capabilities, not the vocabulary.
- **The gateway is generic.** It is the shared kit in `budy-common-modules` (`go/capability/gateway/{stsauth,dispatch}`): no business logic, no state, never imports a component. It learns components, capabilities, schemas and routes from capability manifests (YAML in a ConfigMap) and rolls when the manifest checksum changes. Adding a capability or a component is a component change plus a manifest change; the gateway needs no code.
- **Authentication is the same for every gateway:** an STS bearer token, RS256, verified against the auth cluster's JWKS endpoint over HTTP (`sts-service` in the auth namespace, port 8080). Issuer, JWKS URL, audience and claim names are deployment values; a token cannot choose them. Caller-asserted tenant or user must match the token. The identity components receive comes from the token, never from the request.
- **Tenancy is enforced twice:** the gateway authenticates and fixes the identity; every component activity re-asserts `ComponentRequest.TenantID` before touching anything.
- **Rollout:** Temporal Worker Deployment Versioning, Pinned. A component's `package.json` version is its image tag, its chart `appVersion` and its Build ID; an execution finishes on the build that started it.

## 2. Repository layout

```text
shared/contract/           MODULE  public Nexus contract: endpoint, service, operations, STS audience, capability payloads (the only module tagged for external use)
components/gateway-1/      MODULE  cmd/worker + internal/worker: thin wiring over the shared kit
components/<name>-1/       MODULE  one per component, added as the cluster grows (cmd/worker, internal/{workflow,activities,worker,capabilities})
charts/
  <cluster>/               umbrella chart "<cluster>-repo-1" (the only published chart)
  gateway-1/               sub-chart; files/capabilities/*.yaml are the manifests
  <name>-1/                sub-chart per worker component
configs/runtime/           runtime config manifests read by go/runtimeconfig (paths are fixed by the platform)
.github/components.json    the component catalog: the only thing CI and release read about this repo's shape
.github/workflows/         two thin callers of the shared entry workflows
.changeset/                one changeset per code change; each component is a changeset package
Dockerfile                 one Dockerfile for every Go component (COMPONENT, BINARY_TARGET)
package-lock.json          committed: lets changesets see the workspaces (see "Rules that exist because of past failures")
go.work + replace          go.work for local dev; each module's go.mod carries a replace for shared/contract
```

Each component (`contract`, `gateway-1`, `<name>-1`) is a Go module **and** a changeset package. Keep `MODULES` in the `Makefile`, `go.work`, root `package.json` workspaces and `.github/components.json` in step when adding one.

Shared infrastructure that more than one cluster needs (registry, STS auth, dispatch, worker bootstrap, runtime config) lives in `budy-common-modules`, not here. Do not copy it back.

## Naming: the `-1` rule

Every named platform entity ends in `-1`: the repository (`<cluster>_repo-1`), the cluster (`<cluster>`), every component and its sub-chart, image tag prefix, git tag, task queue and netpol label (`gateway-1`, `<cluster>-gateway-1-tq`, `<short>-gateway-1`), the Nexus endpoint (`...-endpoint-1`) and the Temporal namespace (`...-ns-1`). The suffix is a generation number: when a component needs a breaking redesign it becomes `<name>-2` beside `<name>-1`, with its own chart, image, queue and release history, and the old one retires on its own schedule. A name without the suffix cannot do that.

Names that already carry their own version stay as they are: the Nexus service (`<Domain>ServiceV<N>`), workflow types (`<Thing>WorkflowV<N>`) and the `shared/contract` module, whose version is its git tag. Go package and directory names inside a module are code structure, not platform names. The umbrella chart follows the platform's chart naming, `<repo>-repo-1` (`<cluster>-repo-1`, published at `ob1-helm-chart-repo-v1/<cluster>-repo-1`, as every app repository does).

When you add anything with a name, give it `-1`: a component `billing` is `billing-1` in `components/billing-1/`, `charts/billing-1/`, the catalog `name`, `global.components`, the values key and the manifest `component:`.

## 3. Conventions every component follows

- **Testable entrypoints, 90% coverage:** `cmd/<binary>/main.go` is process glue only (platform-mounted runtime config, pod identity, OS signals). Everything with logic lives in `internal/` and takes its dependencies as parameters (`worker.Run(ctx, getenv, reader, identity, runFunc)`), so tests assert the options handed to the worker runtime, the registrations and the failure paths without a Temporal server. Target at least 90% statement coverage for every non-`cmd` package, with tests that assert behaviour; remove unreachable code instead of testing it.
- **Tenant enforcement:** first line of every activity asserts the tenant; never trust anything but the validated token identity. A component that serves tenant data refuses platform-scoped (tenant-less) callers.
- **Determinism:** all I/O in activities, never in workflow code.
- **Idempotency:** activities tolerate retries; the gateway derives workflow ids from tenant, user and the idempotency key (or a request hash).
- **Schema honesty:** a capability's JSON Schema must match what its activity accepts. A breaking change is a new capability name, a new workflow type, or `<Domain>ServiceV2`. Never change a published schema silently.
- **Versioned workflow type names** (`<Name>WorkflowV1`), registered Pinned. Task queues are `<cluster>-<component>-tq` and come from the chart's shared task-queue ConfigMap; the manifest value is only the default.
- **Typed errors:** responses carry `dispatch.Code` values; permanent failures are non-retryable application errors whose type is the code.
- **Logging:** stdlib `slog`. Health: `GET /services/health` on port 3000.
- **Stubs are labelled.** `<capability>` returns `stub: true`. Do not remove the flag until the capability reads real state.

## 4. Recipes

### Add a component
A reference cluster starts with the gateway only. To add a component, named `<name>-1` (see the naming rule):

1. `components/<name>-1/`: a new Go module with `cmd/worker` (process glue only) and `internal/{workflow,activities,worker,capabilities}`. Copy the shape of `components/gateway-1`; its `internal/worker` is the pattern for dependency-injected, testable wiring.
2. `shared/contract`: the component name and capability constants and the typed request/response of each capability.
3. `charts/<name>-1/`: a sub-chart on `platform-app-cluster` (and `platform-temporal-worker` for the Vault helpers), its entry in the umbrella's `dependencies` with `condition: <name>-1.enabled`, the name in `global.components` and a `<name>-1:` block in the umbrella values.
4. `charts/gateway-1/files/capabilities/<name>-1.yaml`: the manifest. **Remove `capabilities.allowEmpty` from `charts/gateway-1/values.yaml`** once the directory is no longer empty, so a missing manifest fails the render again.
5. `.github/components.json`: a catalog entry with `docker.build_args.COMPONENT`, `chart_values_image_tag_path` (`."<name>-1".image.tag`) and `depends_on: ["contract"]`; also `go.work`, the `Makefile` `MODULES`, root `package.json` workspaces and the component's `package.json` (its `name` equals the catalog name).
6. The component's Go test calls `capabilitytest.Verify` against the manifest directory.
7. A changeset for `contract` and the new component. The gateway needs no code change.
8. The cross-repo steps in section 7: network policy and OPA identity, GitOps values. Kargo needs nothing per component.

### Add a capability to an existing component
1. `shared/contract`: constant for the capability and the typed payload/response.
2. The component's `internal/activities` (assert the tenant first), its case in `internal/workflow/workflow.go`, and its registration in `internal/worker/worker.go`.
3. `charts/gateway-1/files/capabilities/<name>-1.yaml`: the capability, description and JSON Schema.
4. The `internal/capabilities` test: add the capability to `Expect.Capabilities`. It fails if the manifest and worker disagree.
5. A changeset for `contract` and the component. The gateway needs no change.

### Change the contract
`shared/contract` is tagged `shared/contract/v<version>` by the release flow and consumed by other clusters. Additive changes only within `<Domain>ServiceV1`.

## 5. Build, test, lint

```bash
make build test vet            # every module; test includes capability conformance
make lint                      # golangci-lint
make helm-login helm-lint helm-template   # needs AWS credentials for the private library charts
npm run changeset              # required for any code change
```

Private modules resolve with `GOPRIVATE=github.com/Budybot/*`. Module versions of `budy-common-modules` are pinned in each `go.mod`; after bumping one run `make tidy`. The first time after the common modules are released, run `make tidy` once to complete `go.sum` (it was generated before those tags existed).

Local gateway check without a cluster: `go test ./components/gateway-1/...` loads the shipped manifests, applies the task-queue override from the environment and refuses to start without STS configuration.

## 6. CI/CD

Everything is the shared pipeline, pinned at `@v1`, driven by `.github/components.json`.

**Pull request (`ci.yml` → `app-cluster-ci.yml`):** changeset gate (a `.changeset/*.md` file, or label `no-changeset`), Go validation of changed components and their dependents, image builds without push, chart validation when the chart or a workflow changed, one aggregate `ci / ci-required`. Required check: `ci / ci-required`.

**Release (`release.yml` → `app-cluster-release.yml`), on push to `main`:**

```text
changeset merged ──▶ Release PR "Release: <cluster>" (branch changeset-release/<cluster>)
Release PR merged ──▶ build + push released images to ECR (tag <component>-<version>-<sha7>, GHCR layer cache)
                      ├ tag + verify released Go modules (shared/contract/v<version>)
                      ├ confirm ECR digests, create git tags <component>/v<version>
                      └ open the chart-release PR (bumps the umbrella once with every image tag)
chart PR merged  ──▶ publish the umbrella chart to OCI (ECR) ──▶ GitOps CHANGELOG PR in de-v2
                      Kargo then discovers the chart and promotes it (section 8)
```

Rules that exist because of past failures:

- **Never hand-bump `charts/<cluster>/Chart.yaml` or image tags** with a code change; `chart-release-pr` writes version, `appVersion` and tags after images exist. A chart-only change (no Go) needs the label `no-changeset`; the entry workflows do **not** yet generate a chart-only release PR (the wiki CI/CD standard describes one), so until they do, bump `Chart.yaml` `version`/`appVersion` by hand in that PR, as context-cluster does.
- **Commit the root `package-lock.json`.** Changesets (via manypkg) treats the root `package.json` `workspaces` as an npm monorepo only when the lockfile sits beside it; without it the release job sees one root package and fails with "Found changeset ... for package <name> which is not in the workspace" and no Release PR opens. Regenerate with `npm install --package-lock-only` after adding a component to `workspaces`. CI cannot catch this: the `changeset` job only checks that a changeset file exists.
- A release merge may change only `package.json`, `CHANGELOG.md` and `.changeset/**`. The release flow fails before publishing anything otherwise.
- Changeset package names must equal `package.json` names: `contract`, `gateway-1`, `<name>-1`.
- ECR tags are immutable. Layer cache lives on GHCR, never as an ECR `:buildcache` tag.
- Callers must grant the token scopes shown in the two workflow files; a reusable workflow cannot raise them.
- The GitOps step runs with `kargo_managed: true`: Kargo, not CI, writes the chart version and `values/default.values.yaml` in de-v2.

## 7. Where the rest of the platform lives

This repository is one of several that together make the cluster run. A change that crosses them is a numbered set of PRs; follow the wiki skill `scaffold-ob-application` for the `[app-onboard N/M]` handoff format.

| Concern | Repository | What is there for this cluster |
| --- | --- | --- |
| This repo's own GitHub repository, teams, protections | `github-infra` | stack `execution-mode/v1` declares `<cluster>_repo-1` (names for new repos have no `ob1_mn_gh_` prefix) |
| AWS: ECR image repo, Helm chart repo, Kubernetes namespace `ob1-tf-eks-de-v2-<short>-1-ns-1`, IAM, anything Terraform | `budy-cloud-management` (`ob1-budy-cloud-management`) | PRs to `main` plan dev and sand only; the ECR stack applies from a `release/prod` PR |
| Shared Helm library charts (`platform-app-cluster`, `platform-capability`, `platform-temporal-worker`, `platform-common`, `platform-vso`) | `ob1-mn-github-helm-charts-repo-1` | published to ECR OCI; one ECR repo per library chart, declared in cloud-management |
| Shared Go modules (`go/capability`, `go/worker`, `go/runtimeconfig`) | `budy-common-modules` | released as tags `go/<module>/v<version>` |
| CI/CD building blocks and entry workflows | `ob1_mn_github_platform-actions_repo_1` | `@v1` |
| Vault roles and secrets | `ob1_mn_github_vault-gitops_repo-1` | none today: the cluster has no KV or database secrets and payload encryption is off. Turning on `global.vaultTransit`/`payloadEncryption` needs a Vault role for the workers (the Transit keys are created by Crossplane from the chart) |
| Network policy, mTLS, OPA identity, Kargo RBAC | `ob1_mn_github_k8s-security_gitops_repo_1` | per-namespace netpol (DNS and istiod allow, default-deny ingress, Temporal frontend 7233, gateway egress to the STS service on 8080 in the auth namespace and to the kube-apiserver 443, Prometheus scrape on 15090), STRICT PeerAuthentication, the `BudyNetpolIdentity` allow-list of `budybot.io/netpol` values, the Kargo controller Secret-reader RoleBinding for this app, and this app's entry in the `kargo.akuity.io/github-token-scopes` annotation of `kargo-github-app.vss.yaml` (`v1/objects/scrt/vso-secrets/infra-1/manifests/kargo-shared-resources-ns-1/` in `ob1_mn_github_k8s-security_gitops_repo_1`) (a Kargo Project missing there cannot clone the GitOps repository) |
| Cluster add-ons and infra GitOps (the ArgoCD EKS stack) | `ob1_mn_github_argocd_eks_stack` | cluster-wide components and shared monitoring; change it only for something every app needs |
| ArgoCD projects and destinations | `ob1_mn_gh_argocd-critical-stack_repo_1` | the namespace is an allowed destination of `apps-de-v2-services-acd-proj-1` |
| Application GitOps values for the de-v2 clusters | `ob1_mn_gh_de-v2_gitops_repo_1` | `charts/apps/<cluster>/` (section 8) |
| Kargo release train | `ob1_mn_github_kargo-config_gitops_repo_1` | `v1/prod-2/release-trains/de-v2/<cluster>/`, listed in `de-v2/kustomization.yaml`; enable it together with the token-scope entry in k8s-security |
| Design docs, standards, skills | `ob1_mn_gh_ob-platform-wiki_repo_1` | the service document and the cluster skill |

Pod labels matter: every Pod template carries `budybot.io/netpol: <short>-<component>` (the chart sets it); a value missing from the OPA allow-list in k8s-security is rejected at admission.

## 8. Environments, GitOps values and promotion

| Environment | AWS account | EKS | de-v2 branch |
| --- | --- | --- | --- |
| dev-1 | 515407373958 | dev | `main` |
| stage-1 | 046228934736 | stage | `release/stage` |
| prod-2 | 753182551359 | prod | `release/prod` |

Application GitOps lives in `de-v2` at `charts/apps/<cluster>/`:

```text
app.yaml                          ArgoCD Application (project apps-de-v2-services-acd-proj-1, ECR chart source + Git values ref)
CHANGELOG.md                      written by the release flow
values/default.values.yaml        the chart's own values.yaml; written by Kargo, never by hand
values/base.values.yaml           common to every environment (Temporal connection, STS issuer and JWKS URL, pod labels)
values/profiles/{dev,stage,prod}.values.yaml   shared by every environment of that tier (replicas, log level, affinity)
values/env/{dev-1,stage-1,prod-2}.values.yaml  one environment only (STS audience overrides, account-specific names)
```

Layers apply in that order, later wins. Put a value in the lowest layer that is true for everything above it: **profiles** for what all dev (or all stage, all prod) environments share, **env** for what is specific to one environment, **base** for what never differs. Wiring lives outside the app directory: `charts/apps/kustomization.yaml` lists the app, `charts/profiles/<tier>/kustomization.yaml` and `charts/env/<env>/kustomization.yaml` append the value files. The gitops repo's branches are `main` (dev-1), `release/stage` (stage-1) and `release/prod` (prod-2); files outside `charts/apps/<app>/` reach a release branch only through a manual PR, while Kargo copies `charts/apps/<app>/` between branches.

**Kargo train** (`<cluster>` Project, six stages): dev → dev-bake (1 h) → stage → stage-bake (4 h) → prod → prod-verify (15 min). Each stage changes only this app's directory on its branch; bake stages check restarts, 5xx and ArgoCD health from that environment's Thanos before the next stage. A failure in prod-verify is the signal to roll back by promoting the previous Freight to `prod`.

**Disabled by default outside dev.** Stage and prod ship with `global.enabled: false` in `values/env/stage-1.values.yaml` and `values/env/prod-2.values.yaml`: the chart renders nothing and ArgoCD keeps an empty release. An empty release passes the bake gates: the restart query ends in `or vector(0)` and the 5xx ratio in `or vector(1)` (`budy-health-bake` in kargo-config). Kargo replaces `charts/apps/<cluster>/` on the release branches as it promotes, but `env/*.values.yaml` is part of that directory, so enabling an environment is one PR to `main` that removes the override and then travels through the train like any other change.

## 9. Operating notes

- **Smoke test:** mint an STS token for audience `urn:budy:nexus:ob1-nexus-<cluster>-endpoint-1:<Domain>ServiceV1` and call `DescribeCapabilities` through the endpoint. With no components it returns an empty list (the endpoint, authentication and gateway are wired); with components it lists their capabilities. Then `Execute` one (`{"component":"<name>-1","capability":"<capability>","payload":{...}}`) and expect `ok`.
- **Gateway rolls on manifest change** through the `checksum/capabilities` pod annotation; there is no runtime discovery of components.
- **Temporal resources** (namespace `ob1-temporal-<cluster>-ns-1`, connection, Nexus endpoint with its connection Secret) are created by the umbrella chart through Crossplane; `temporal.*.create` flags turn each off when the platform already owns it.
- **Images** run as non-root, read-only root filesystem with an `emptyDir` on `/tmp`. A new component that writes elsewhere must mount a volume.
- **Not yet verified from this repository:** that the `de-v2-istio-sidecar` PodMonitor in the ArgoCD EKS stack selects this namespace (the 5xx bake gate reads `istio_requests_total`; with no series the gate passes silently), and the Dockerfile has not been built in this repo's CI yet (no Docker daemon was available when it was written).

## 10. Current state

The gateway, the stub component, the charts and the pipeline exist; nothing is released or deployed yet. Order of arrival: the shared modules and chart library, then this repository's first release (bumps to `0.1.0`), then the GitOps and Kargo wiring. See the open pull requests in the README.

````
