# Adding a New Operator (or any new k8s workload)

|                  |                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Document**     | Adding a New Operator — Checklist                                                                      |
| **Version**      | 1.0                                                                                                    |
| **Status**       | Living Document                                                                                        |
| **Audience**     | Anyone deploying a new Helm chart, operator, or internal tool onto the cluster                         |
| **Purpose**      | The ordered, cross-repo checklist so nothing gets silently skipped (namespace, RBAC, netpol, mTLS...). |
| **Last Updated** | July 2026                                                                                              |

Worked examples referenced throughout: **Reflector** (cross-namespace ConfigMap replication, `apps/platform/cfg/reflector`), **VPA** (`apps/foundation/auto-scale/vpa`), and **Goldilocks** (`apps/foundation/auto-scale/goldilocks`) — added together in one pass, so they cover most of the variation you'll hit (single-component vs multi-component chart, inbound-serving vs controller-only, needs kube-apiserver access, needs external ingress).

## 0. Research before writing anything

- **Check the chart's actual latest version and repo.** Don't trust a version a teammate remembers — `helm repo add <name> <url> && helm search repo <name>/<chart> --versions` and use the top result. Prefer the chart maintained by the *upstream project itself* over third-party repackagings when both exist (e.g. VPA: `kubernetes.github.io/autoscaler`, the official `kubernetes-sig-autoscaling` chart, not a third-party mirror — check for one before assuming the first Helm repo you find is canonical).
- **Read the chart's own RBAC template**, not just its values.yaml prose. Chart-bundled `ClusterRole`s are often broader than the workload actually needs (e.g. Reflector's chart grants `configmaps` *and* `secrets` with no values.yaml toggle to split them). If it's too broad and there's no values-level way to scope it down, plan on `rbac.enabled: false` + a hand-written `ClusterRole` in `k8s-security` (§3).
- **`helm template` your actual values before committing them.** This catches real bugs — chart-level validation errors, wrong key names, mutually-exclusive options set together — that pure YAML linting won't. Do this for every profile (`base` + each of `dev`/`stage`/`prod`), not just one.
- **Figure out what the workload's pods actually need to reach**, and what needs to reach them. This drives §5 (netpol) and is much easier to get right before deploying than to reverse-engineer from a mysteriously-hanging pod afterward. In particular: does it need `kube-apiserver` access (most controllers do)? Does anything outside the mesh call into it directly (e.g. an admission webhook, called by `kube-apiserver` itself, which has no sidecar)?

## 1. budy-cloud-management — create the namespace

Add an entry to `v2/stacks/shared-infra/k8s/v1/namespaces.tf` (`ob1-tf-eks-<name>-ns-1`). If the workload has an opt-in-per-namespace pattern (see §7), this is also where those labels get added to *other* namespaces, not the new one.

## 2. argocd-critical-stack — AppProject

- Prefer reusing an existing project. Check whether the tier's project already has the namespace pre-staged as a commented-out destination (a sign someone planned for this).
- If reusing: add the chart's Helm repo URL to `sourceRepos` (if not already present) and the new namespace to `destinations`.
- If a genuinely new access pattern (e.g. governance-scoped, like `pfm-cfg-sources-acd-proj-1` which only allows `ConfigMap` into one namespace): create a new project, tightly scoped — don't default to `namespaceResourceWhitelist: [{group: '*', kind: '*'}]` unless the workload genuinely needs broad object creation.

## 3. argocd-eks-stack — the app itself

- `app.yaml` + `values/base.values.yaml` + one values file per profile (`dev`/`stage`/`prod`), following the exact structure in [Repos & the App Model](repos-and-app-model.md#1-argocd-eks-stack--the-workloads).
- Pin the chart version with `~x.y.z`.
- Set `deployedReleaseName` to `<name>-1`.
- Always keep the real defaults beside the values files that override them: `values/default.values.yaml`, unmodified and never referenced by `app.yaml`. Fetch the exact pinned chart version with `helm pull <repo-or-oci-chart> --version <x> --untar` and copy the extracted chart's `values.yaml`; alternatively, filter OCI transport lines from `helm show values <repo-or-oci-chart> --version <x>` before writing the file. Refresh this reference in the same PR whenever the chart version changes. Never hand-type it from memory or include Helm transport output such as `Pulled:`/`Digest:` lines.
- If the chart's default RBAC is broader than needed: `rbac.enabled: false` here, then write the narrower `ClusterRole`/`ClusterRoleBinding` in `k8s-security` (§4).
- **Add `budybot.io/netpol` to every Pod template** the chart creates (`podLabels: {"budybot.io/netpol": <name>-1}`, or the chart's equivalent — some charts call it `additionalLabels` under a `deployment:` block; check the rendered output, do not assume the field name). This is required for the `k8s-security` netpol convention (§5) to select the workload. For multi-component charts, give each component a distinct value (`<name>-1-<component>`) when they have different network requirements. Add every value to the namespace-scoped, deny-mode `BudyNetpolIdentity` allow-list in `k8s-security`. Plain `app` labels are legacy and must not be used for new selectors.
- `helm template` the final base+profile-layered values against the real chart one more time after adding labels, to confirm nothing broke.

## 4. k8s-security — RBAC (only if you disabled the chart's own)

`v1/objects/rbac/cluster/manifests/<name>-ns-1/`: a `ClusterRole` scoped to exactly the verbs/resources needed, a `ClusterRoleBinding` to the workload's ServiceAccount (name must match `serviceAccount.name` set in the app's values), and wire the new directory into `rbac/cluster/manifests/kustomization.yaml`'s `resources:` list. No new ArgoCD app needed — this rides on the existing `apps/foundation/rbac/cluster` app.

## 5. k8s-security — NetworkPolicy / CiliumNetworkPolicy

Every new namespace needs its own netpol directory, even if it feels like overkill for a single controller pod. See [Network Policy & mTLS](network-policy-and-mtls.md) for the full pattern; summary:

- `<name>-ns-1/ingress/namespace-wide.default-deny.yaml` — always. Deny-by-default, matched on `k8s:budybot.io/netpol Exists`.
- `<name>-ns-1/ingress/<workload>.{netpol,ciliumnetpol}.yaml` — only for components that actually receive inbound traffic (a dashboard behind the gateway, an admission webhook). Most controller-only workloads need **zero** positive ingress rules.
- `<name>-ns-1/egress/namespace-wide.allow-required.yaml` — DNS (CoreDNS) + istiod (15012). Copy verbatim from any existing namespace.
- `<name>-ns-1/egress/namespace-wide.deny-missing-netpol-label.yaml` — catch-all deny for anything that lacks `budybot.io/netpol`. **Check Helm-hook Jobs** (cert-gen jobs, migration jobs): give them an approved network-policy label and narrow allow when they need traffic, or a deliberate reviewed exclusion when bootstrap-only.
- `<name>-ns-1/egress/<workload>.allow-required.yaml` — whatever the workload actually needs: DB access, `kube-apiserver` (controllers almost always need this — use Cilium's `kube-apiserver` entity, not a static CIDR, since the EKS control plane isn't a cluster pod), other internal services.
- Wire the new namespace directory into `netpol/manifests/kustomization.yaml`'s top-level `resources:` list.

## 6. k8s-security — mTLS (PeerAuthentication)

The mesh has sidecar injection on cluster-wide, but **not every namespace has explicit `PeerAuthentication` set** — check current state before assuming STRICT is already enforced elsewhere. When adding one:

- `<name>-1-strict-mtls.peerauthentication.yaml`, `spec.mtls.mode: STRICT`, alongside the ingress/egress dirs (not inside either — it's neither).
- **If anything outside the mesh calls the workload directly** (most commonly: `kube-apiserver` calling an admission/conversion webhook), add a `portLevelMtls` `PERMISSIVE` exception for just that port. Forgetting this silently breaks the webhook the moment STRICT mTLS is applied — the caller has no sidecar and no cert, so the plaintext connection gets rejected. Everything else in the namespace stays STRICT.
- `portLevelMtls` port keys **must be quoted strings** in YAML (`"8000":`, not `8000:`) — Istio's API represents them as `map<uint32, ...>`, which the JSON/YAML conversion `kustomize build` performs requires as string keys. An unquoted integer key fails the build with a cryptic `unsupported type` error.
- Confirm the project (`fnd-network-policy-acd-proj-1` today) whitelists `security.istio.io/PeerAuthentication` in `namespaceResourceWhitelist` — it may not, if this is the first namespace to use it.

## 7. If the workload dashboards/UIs need external access

Follow the existing OIDC-protected ingress pattern rather than inventing a new one: `apps/foundation/gtw/ingress/manifests/oidc-protected/<name>.ingress.yaml` — a `networking.k8s.io/v1 Ingress` (ALB, routes to `istio-gateway-1:443`) plus an Istio `VirtualService` (routes from the gateway to the workload's actual `Service`), host `<name>.ENV.orangebox.ai`. The `ENV` placeholder is substituted per-environment automatically by the existing Kustomize `replacements` transform in `env/<environment>/apps/foundation/gtw/ingress/manifests/kustomization.yaml` — **don't hardcode an environment name into the shared manifest**, and don't create a new per-environment ingress file; the substitution mechanism already handles it. Add the new file to `oidc-protected/kustomization.yaml`'s `resources:` list.

## 8. If the workload has an opt-in-per-namespace pattern

Some tools (Goldilocks, Reflector) don't act on every namespace by default — they require a namespace-level label or annotation to opt in. If you're adding such a tool: document what the label/annotation is in the app's `base.values.yaml` as a comment, and **don't** flip any global "watch everything" flag as a shortcut — label the specific namespaces you actually want covered, in `budy-cloud-management`'s `namespaces.tf` (§1).

## 9. Verify before opening PRs

- `helm template` (or `kubectl kustomize` for `type: git` apps) every layer combination you touched. This is cheap and catches real errors — mutually exclusive chart options, bad label selectors, broken relative Kustomize paths — before they hit a live cluster.
- For netpol changes specifically: `kubectl kustomize v1/objects/netpol/manifests` should build the **entire** tree cleanly, not just your new namespace's subtree — a bad relative path or duplicate resource name elsewhere can break the whole app.
- Cross-check that every resource name your new `ClusterRoleBinding`/`CiliumNetworkPolicy`/`Ingress` references (ServiceAccount name, Service name, `app` label value) actually matches what the Helm chart renders — don't guess these, render the chart and read them off the output.

## Common Mistakes (from real PRs)

- Writing an `app.yaml` values file that assumes a chart field exists without rendering the chart to confirm — chart schemas change between major versions and third-party repackagings diverge from upstream.
- Applying STRICT mTLS without checking whether anything outside the mesh (control plane webhooks, external health checkers) talks to the workload in plaintext.
- Forgetting that Helm-hook Jobs (cert-gen, DB migrations) often don't inherit the same pod labels as the main Deployment/StatefulSet — they need their own netpol carve-out.
- Using a static CIDR block for `kube-apiserver` egress/ingress instead of Cilium's `kube-apiserver` entity — CIDRs drift, the entity doesn't.
- Skipping the namespace's `NetworkPolicy`/`CiliumNetworkPolicy` entirely because "it's just a controller pod with no inbound traffic" — it still needs an explicit ingress default-deny and an egress allow-list; leaving it unmanaged means it's implicitly allow-all, not deny-all.
