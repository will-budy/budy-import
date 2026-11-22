# Repos & the App Model

|                  |                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Document**     | Repos & the App Model                                                                                            |
| **Version**      | 1.1                                                                                                              |
| **Status**       | Living Document                                                                                                  |
| **Audience**     | Anyone writing or reviewing an `app.yaml`, an `AppProject`, or Terraform namespace changes                       |
| **Purpose**      | Explain what each repo owns, the `app.yaml` schema, the AppProject access-control model, and naming conventions. |
| **Last Updated** | July 2026                                                                                                        |

## 1. The two ArgoCD application models

Product application clusters and shared infrastructure applications are intentionally separated.

| Model | GitOps repository | Manifest shape |
| --- | --- | --- |
| Product applications | `de-v2`, `design-services`, or `execution-services` | A real ArgoCD `Application` with an OCI Helm source from `ecr-1` plus the GitOps repo as the values source |
| Shared infrastructure | `argocd-eks-stack` | A repository-specific `app.yaml` abstraction rendered by platform tooling |

Product source repositories publish immutable images and OCI charts to `ecr-1`; promotion updates the pinned chart `targetRevision` in the appropriate group GitOps repo. Application security resources remain in `k8s-security`.

### argocd-eks-stack — shared infrastructure workloads

Repo: `Budybot/ob1_mn_github_argocd_eks_stack`, root `v2/`.

This is where shared cluster infrastructure is defined, one `app.yaml` per application, organized by tier:

```text
v2/
  critical/sys/<app>/app.yaml          # cluster-critical addons (ArgoCD itself, ALB controller, Reloader)
  apps/foundation/<category>/<app>/    # Karpenter, KEDA, VPA, Goldilocks, netpol, RBAC, gateway/ingress...
  apps/platform/<category>/<app>/      # cert-manager, Vault, Kafka, Postgres, Redis, Temporal, service mesh...
  apps/observability/monit/<app>/      # Prometheus, Grafana, Loki...
  apps/goverance/policy/<app>/         # OPA/Gatekeeper
  env/<environment>/apps/...           # environment-specific overlays, mirrored path-for-path against apps/
```

An `app.yaml` is a **custom, repo-specific abstraction** — not a raw ArgoCD `Application` spec. Some external tooling (not in this repo) reads these files and generates the real ArgoCD `Application`/`ApplicationSet` objects. There are two `type`s:

### `type: helm`

```yaml
project: fnd-autoscaling-acd-proj-1

type: helm

destination:
  namespace: ob1-tf-eks-vpa-system-ns-1

helm:
  repoURL: 'https://kubernetes.github.io/autoscaler'
  chart: vertical-pod-autoscaler
  version: "~0.10.0"
  deployedReleaseName: vpa-1

values:
  - $values/v2/apps/foundation/auto-scale/vpa/values/base.values.yaml
  - $values/v2/apps/foundation/auto-scale/vpa/values/{{profile}}.values.yaml

syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - ServerSideApply=true
```

- `version` is pinned with a `~` (patch-range) constraint — matches the chart version at the time the app was added, not floating on `latest`.
- `values` is an **ordered list** of files that get layered (later files override earlier ones): always `base.values.yaml` first, then a profile-specific file. Each app also typically keeps an untouched `default.values.yaml` — a straight copy of the upstream chart's own `values.yaml` (via `helm pull <chart> --version <x> --untar`), kept purely for reference and **never referenced by `app.yaml`**.
- `deployedReleaseName` fixes the Helm release name (and by extension resource name prefixes) so it doesn't depend on the ArgoCD Application name.

### `type: git`

```yaml
project: pfm-cfg-sources-acd-proj-1

type: git

destination:
  namespace: ob1-tf-eks-reflector-ns-1

sources:
  - repoURL: https://github.com/Budybot/ob1_mn_github_argocd_eks_stack.git
    path: v2/apps/platform/cfg/reflector-sources/profiles/{{profile}}/manifests
```

Used for raw Kustomize/manifest-based apps (RBAC objects, ConfigMaps, ingress definitions, CRs). `sources` can list **multiple** repo/path pairs — ArgoCD merges their rendered output. This is how `env/{{environment}}/apps/...` overlays get combined with the base `apps/...` manifests without one Kustomize tree reaching across into the other (see §3).

### `{{profile}}` vs `{{environment}}`

These are two different template variables, resolved by the external tooling per deployed cluster:

- **`{{profile}}`** — one of `dev` / `stage` / `prod`. A *tier* of configuration (resource sizing, replica counts, feature toggles).
- **`{{environment}}`** — the specific cluster instance: `dev-1`, `stage-1`, `prod-2` (see `budy-cloud-management/v2/env/`). Today each environment maps 1:1 to a profile, but the split exists so a future second `dev-2` environment could reuse the `dev` profile while still getting its own environment-specific overrides (e.g. via `env/dev-2/apps/.../manifests`).

Most `type: helm` apps only layer `base` + `{{profile}}`. Apps that need genuine per-environment (not just per-profile) patching — e.g. the ingress hostnames, which differ per environment even within the same profile — use a full chain: **common → profile → environment**, each layer a real Kustomize overlay that can add/patch on top of the one below (see the `reflector-sources` app for a worked example: `manifests/` → `profiles/{dev,stage,prod}/manifests` → `env/{dev-1,stage-1,prod-2}/apps/.../manifests`). Don't reach for the full three-layer chain unless you actually need per-environment (not just per-profile) divergence — it's more scaffolding than most apps need.

### Product application GitOps repositories

The group repositories contain real ArgoCD `Application` resources, normally under `charts/apps/<application>/`. A current de-v2 application uses:

```yaml
spec:
  project: apps-de-v2-services-acd-proj-1
  sources:
    - repoURL: <ecr-1-account>.dkr.ecr.us-west-2.amazonaws.com/ob1-helm-chart-repo-v1
      chart: context-cluster-1-repo-1
      targetRevision: 0.2.40
      helm:
        valueFiles:
          - $values/charts/apps/context-cluster-1/base.values.yaml
    - repoURL: https://github.com/Budybot/ob1_mn_gh_de-v2_gitops_repo_1.git
      targetRevision: main
      ref: values
```

Profile Kustomizations append dev/stage/prod values. Environment overlays are used only where a specific environment differs from its profile.

## 2. argocd-critical-stack — the AppProjects

Repo: `Budybot/ob1_mn_gh_argocd-critical-stack_repo_1`, projects live under `v2/env/_base/bootstrap/projects/<tier>/<name>.project.yaml`.

Every `app.yaml`'s `project:` field must name an `AppProject` defined here. A project is the **access-control boundary** — it decides, independent of what any individual app claims:

- `sourceRepos` — which git/Helm repos this project's apps are even allowed to pull from.
- `destinations` — which `namespace` an app under this project may deploy into (supports globs and negation, e.g. `!kube-*`).
- `clusterResourceWhitelist` / `namespaceResourceWhitelist` — which resource `kind`s (by API group) are allowed. Cluster-scoped kinds (`ClusterRole`, `ClusterRoleBinding`, CRDs...) are usually locked down separately from namespaced kinds.

Projects are organized by tier, matching `argocd-eks-stack`'s own tiering (`critical/`, `foundation/`, `platform/`, `observability/`, `governance/`, `applications/`), and named `{tier-prefix}-{logical-name}-acd-proj-1`:

| Prefix  | Tier                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| `fnd-`  | Foundation (cluster addons, autoscaling, networking, RBAC, gateway)            |
| `pfm-`  | Platform (databases, messaging, service mesh, secrets, workflow orchestration) |
| `obs-`  | Observability                                                                  |
| `gov-`  | Governance                                                                     |
| `apps-` | Application-tier services                                                      |

**Before writing a new `app.yaml`, check whether an existing project already fits** — reusing one is strongly preferred over minting a new project per app. When a new operator genuinely doesn't fit anywhere (e.g. it needs a namespace/resource-kind combination no existing project grants), extend an existing project's `destinations`/`sourceRepos`/`namespaceResourceWhitelist` rather than create a new one, unless the access pattern is genuinely orthogonal to every existing project's purpose.

Some projects have destinations for namespaces that don't exist yet, deliberately pre-staged (commented out) for a known future addition — check for these before assuming you need a brand-new project.

## 3. budy-cloud-management — namespaces (and everything else Terraform)

Repo: `Budybot/ob1-budy-cloud-management`. The relevant file for GitOps purposes is `v2/stacks/shared-infra/k8s/v1/namespaces.tf`, which defines every Kubernetes namespace in the cluster as a Terraform map entry:

```hcl
goldilocks = {
  name = "ob1-tf-eks-goldilocks-ns-1"
  labels = {}
  annotations = {}
}
```

**A namespace must exist here before any `app.yaml` can target it.** This is also where namespace-level *opt-in labels* live — e.g. Goldilocks only watches namespaces carrying `goldilocks.fairwinds.com/enabled: "true"`, and that label is set here, per-namespace, not in any Helm chart.

Namespace naming convention: `ob1-tf-eks-<name>-ns-1`.

## 4. k8s-security — everything that governs the namespace, not what's deployed in it

Repo: `Budybot/ob1_mn_github_k8s-security_gitops_repo_1`, root `v1/objects/`, split by concern:

| Path                                      | Contains                                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rbac/cluster/manifests/<ns>/`            | Cluster-scoped `ClusterRole`/`ClusterRoleBinding` objects — used when a workload's own Helm chart RBAC is either too broad (grants more than it should) or you disable it entirely (`rbac.enabled: false`) in favor of a hand-scoped role here. |
| `netpol/manifests/<ns>/{ingress,egress}/` | `NetworkPolicy` and `CiliumNetworkPolicy` objects, plus namespace-scoped `PeerAuthentication` (mTLS). See [Network Policy & mTLS](network-policy-and-mtls.md).                                                                                  |
| `opa-policy/`                             | Gatekeeper/OPA constraint templates and constraints.                                                                                                                                                                                            |
| `scrt/`                                   | Vault-related security objects.                                                                                                                                                                                                                 |

Both `rbac/cluster` and `netpol` are deployed via a **single `app.yaml` each** in `argocd-eks-stack` (`apps/foundation/rbac/cluster` and `apps/foundation/netsec/netpol`) that points at this whole tree — adding a new namespace here means adding a new subdirectory and wiring it into the relevant top-level `kustomization.yaml`'s `resources:` list, not creating a new ArgoCD app.

## Naming Conventions Quick Reference

| Thing                                        | Pattern                                                               | Example                                           |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Namespace                                    | `ob1-tf-eks-<name>-ns-1`                                              | `ob1-tf-eks-vpa-system-ns-1`                      |
| AppProject                                   | `{tier}-{name}-acd-proj-1`                                            | `fnd-autoscaling-acd-proj-1`                      |
| Helm release name                            | `<name>-1`                                                            | `vpa-1`, `goldilocks-1`, `reflector-1`            |
| ClusterRole / ClusterRoleBinding             | `ob1-acd-eks-<name>-cr-1` / `-crb-1`                                  | `ob1-acd-eks-reflector-1-cr-1`                    |
| Plain `app` pod label (for netpol selectors) | `<release>-1` or `<release>-1-<component>` for multi-component charts | `vpa-1-recommender`, `vpa-1-admission-controller` |
