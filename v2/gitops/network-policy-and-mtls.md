# Network Policy & mTLS

|                  |                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| **Document**     | Network Policy & mTLS Conventions                                                                   |
| **Version**      | 1.0                                                                                                 |
| **Status**       | Living Document                                                                                     |
| **Audience**     | Anyone writing `NetworkPolicy`/`CiliumNetworkPolicy`/`PeerAuthentication` in k8s-security           |
| **Purpose**      | The exact pattern used cluster-wide, why it's shaped this way, and the gotchas that break silently. |
| **Last Updated** | November 2026                                                                                       |

All of this lives in `k8s-security`, `v1/objects/netpol/manifests/<namespace>/`, deployed as a single ArgoCD app (`apps/foundation/netsec/netpol` in `argocd-eks-stack`) covering the whole tree. `llm-gateway-1-ns-1` is the cleanest reference namespace to copy from.

## The Shape of Every Namespace

```text
<namespace>/
  kustomization.yaml                      # resources: [ingress, egress, <optional PeerAuthentication>]
  <name>.strict-mtls.peerauthentication.yaml   # if mTLS is enforced here (see below)
  ingress/
    kustomization.yaml
    namespace-wide.default-deny.yaml      # always
    <workload>.netpol.yaml                # only if something calls in; k8s-native
    <workload>.ciliumnetpol.yaml          # same rule, Cilium form
  egress/
    kustomization.yaml
    namespace-wide.allow-required.yaml    # DNS + istiod, always
    namespace-wide.deny-missing-netpol-label.yaml   # catch-all
    <workload>.allow-required.yaml        # whatever this workload specifically needs
```

## Why Both `NetworkPolicy` *and* `CiliumNetworkPolicy`

The cluster's CNI is Cilium, so `CiliumNetworkPolicy` is what actually gets enforced with full fidelity (L3/L4 with named Cilium "entities" like `kube-apiserver`, `world`, `cluster`, `host`). Plain `networking.k8s.io/v1 NetworkPolicy` is added **in addition**, for two reasons: it's portable if the CNI ever changes, and some tooling/audits expect to see standard `NetworkPolicy` objects. Where both exist for the same rule, they should express the *same* intent — the Cilium one is just able to be more precise.

Not every namespace has both. Namespaces where the only need is `kube-apiserver`-entity-based ingress (which plain `NetworkPolicy` literally cannot express — the EKS control plane isn't a cluster pod, so there's no valid `podSelector`/`namespaceSelector`/`ipBlock` for it) go Cilium-only for that specific rule. Positive ingress *from another pod in the mesh* (e.g. the istio gateway) should still get both forms.

## Network-policy label convention

All **new** application policies use the dedicated label `budybot.io/netpol: <component>`. It is separate from application metadata and is the sole workload identity for NetworkPolicy/Cilium selectors. Render it on every actual Pod template, including `WorkerDeployment` templates and any Job with its own policy.

```yaml
metadata:
  labels:
    budybot.io/netpol: file
```

Use that exact value in both selector forms:

```yaml
# Kubernetes NetworkPolicy
podSelector:
  matchLabels:
    budybot.io/netpol: file

# CiliumNetworkPolicy
endpointSelector:
  matchLabels:
    "k8s:budybot.io/netpol": file
```

The plain `app` / `k8s:app` convention is legacy and remains only for existing policy pairs until they are migrated. Do not add new `app`-based selectors. Standard `app.kubernetes.io/*` labels remain useful metadata but never satisfy this dedicated network-policy identity.

`k8s-security` now delivers the `BudyNetpolIdentity` Gatekeeper template to dev, stage, and prod. For **every new application namespace**, add a namespace-scoped `BudyNetpolIdentity` constraint with `enforcementAction: deny` and an explicit allow-list of that namespace's component values. The template validates Deployment, StatefulSet, DaemonSet, Job, CronJob, and Temporal `WorkerDeployment` Pod templates; it intentionally does not validate generated Pods after their controller has been admitted.

Add the constraint under `k8s-security/v1/objects/opa-policy/manifests/additional-policy-by-ns/<namespace>/`, add that folder to its `kustomization.yaml`, and use this shape:

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: BudyNetpolIdentity
metadata:
  name: <namespace>-approved-netpol-identities
spec:
  enforcementAction: deny
  match:
    namespaces: [<namespace>]
    kinds:
      - apiGroups: [apps]
        kinds: [Deployment, StatefulSet, DaemonSet]
      - apiGroups: [batch]
        kinds: [Job, CronJob]
      - apiGroups: [temporal.io]
        kinds: [WorkerDeployment]
  parameters:
    allowedValues:
      - api
      - worker
      - migration
```

This is deliberately namespace-scoped: adding the reusable template does not alter admission for any existing production Pod or controller. The first constraint for a new namespace is the point at which denial begins, and its allow-list is part of the namespace security review.

This convention supports a **deny-missing-network-policy-label catch-all**: any application pod without `budybot.io/netpol` gets a blanket egress deny (`cluster`, `world`, `host`, `remote-node`, `kube-apiserver`, `unmanaged`, `health`, `init` — everything). Migrate that selector together with application policies and preserve legacy `app` handling until the namespace is fully migrated.

**Gotcha:** Helm-hook Jobs (cert-gen jobs run on install/upgrade, migration jobs) frequently do not carry the chart's pod-label override. Render the chart and inspect every `Job`/Pod-producing resource. Give each Job that needs traffic an approved `budybot.io/netpol` value and a narrow allow rule, or make a deliberate, reviewed exclusion for a bootstrap-only Job.

## Tenant Workload Network Profiles

Pods that a platform operator creates inside a tenant namespace (for example the sandbox pods of `sandbox-operator-1`, or Dynamo workers) do not get a per-namespace policy pair. Each kind of workload has a **network profile**: one `CiliumClusterwideNetworkPolicy`, in `k8s-security` under `v1/objects/rbac/cluster/manifests/<profile-dir>/`, that selects pods by both:

- the pod label `budybot.io/netpol: <profile>` (`k8s:budybot.io/netpol` in the Cilium selector), and
- the namespace label `platform.budy.ob1.ai/managed-by: user-org`, which the user-org composition puts on tenant namespaces (`ob1-uo-<org>-ns-2`). A pod with the profile label anywhere else is not matched.

A pod in a tenant namespace without a profile label falls under the namespace's egress deny. The profile is the only egress the workload has; the policy lists it and denies the rest.

### Example: `sandbox-coder-1`

File: `v1/objects/rbac/cluster/manifests/tenant-sandbox-netpol/sandbox-coder-1.allow-required.yaml` (policy `egress-tenant-sandbox-coder-1-allow-required`).

| Allowed egress | Port | Note |
| --- | --- | --- |
| kube-dns / coredns in `kube-system` | 53 UDP and TCP | The rule carries the DNS proxy rule (`matchPattern: "*"`) that `toFQDNs` needs; it only lets the pod resolve names |
| `sts-service` (`ob1-tf-eks-de-v2-auth-1-ns-1`) | 15008 (HBONE) | Token exchange. The inner port is 8080 |
| `npm-proxy-1` (`ob1-tf-eks-de-v2-npm-proxy-1-ns-1`) | 15008 (HBONE) | Inner port 4873 |
| `api.anthropic.com`, `platform.claude.com` | 443 | By name (`toFQDNs`) |

Explicitly denied (`egressDeny`, which wins over any allow added later in the namespace): the entities `kube-apiserver`, `host` and `remote-node`, and the instance metadata address `169.254.169.254/32`. Ingress is denied by the namespace default deny; the operator reaches a sandbox through `pods/exec`, which does not use the pod network. There is no GitLab rule, because no GitLab proxy exists yet.

### Example: `dynamo-worker-netpol-1`

File: `v1/objects/rbac/cluster/manifests/dynamo-worker-netpol/dynamo-worker.allow-required.yaml` (policy `egress-dynamo-worker-allow-required`). Every DT Dynamo worker pod carries this profile, stamped by `nainai-operator-1`; a template cannot change it. A worker has **no direct internet egress** (owner decision, 2026-11-17): outbound calls go through the Janus outbound gateway, which enforces who may reach what (see [janus-cluster-1](../micro-services/execution-mode-services/janus-cluster-1/info.md)).

| Allowed egress | Port | Note |
| --- | --- | --- |
| kube-dns / coredns in `kube-system` | 53 UDP and TCP | In-cluster names only (`**.cluster.local`); the worker never resolves an internet name, it hands the host to the gateway |
| Temporal frontend of cluster 3 | 7233, 7243, 15008 | gRPC, HTTP and HBONE |
| `outbound-gateway-1` (Janus namespace) | 3128, 15008 | `HTTPS_PROXY`; HTTP CONNECT |
| `outbound-policy-1` (Janus namespace) | 8090, 15008 | Worker API: `/v1/run-tokens` and `/v1/trust-bundle` |

Denied: the kube-apiserver, the node and other nodes, and the instance metadata address. In the Janus namespace the matching ingress is a Cilium rule per destination plus an Istio `ALLOW` policy that limits tenant namespaces (`ob1-uo-*`) to 3128 on the gateway and 8090 on `outbound-policy-1`.

### Janus namespace policies for outbound control

`k8s-security` `v1/objects/netpol/manifests/de-v2-janus-1-ns-1/` also carries the policies for the components added for outbound control:

- `janus-redis-1` (the Janus rate-limit Redis, port 6379): an Istio `ALLOW` policy admits only the `outbound-policy-1` and `janus-redis-1` service accounts, and Redis's own password is the second check.
- `outbound-policy-1` egress: `janus-redis-1` over HBONE (15008), the audit S3 bucket and regional STS (IRSA) through the shared object-storage and Vault allow, and connection-registry-1's usage API.
- `outbound-gateway-1` egress: `outbound-policy-1` (ext_authz and xDS) and any public host on 443; the registry's active hosts change without a policy change, and the gateway forwards only to hosts it holds a certificate and route for.

### Keeping the label reserved

The profile label grants egress, so Gatekeeper `BudyNetpolReserved` constraints (`v1/objects/opa-policy/manifests/additional-policy-by-ns/reserved-netpol-identities.yaml`) keep it out of ordinary workloads:

- `sandbox-coder-1-reserved-outside-tenant-namespaces`: denied in every namespace that is not labelled `managed-by: user-org`.
- `sandbox-coder-1-reserved-to-sandbox-operator-1`: inside tenant namespaces, only an object labelled `app.kubernetes.io/managed-by: sandbox-operator-1` may use it. The check reads the label of the object under review, not the creator, so it guards against mistakes and copying; who may create pods is limited by RBAC and the operator's admission policy. The label is not inherited by pod templates, so a Deployment or Job needs it on the controller object itself.

A new profile adds its policy, its two reservation constraints, and its value in the allow-list rules of the destinations it calls.

### Ambient and destination-side port limits

Tenant namespaces and the operator namespace (`ob1-tf-eks-de-v2-sandbox-1-ns-1`, label `istio.io/dataplane-mode: ambient` in cloud-management `v2/stacks/shared-infra/k8s/v1/namespaces.tf`) are Istio ambient. A call from a tenant pod to an in-mesh service leaves the pod as HBONE to the destination pod's port 15008, so Cilium on the source cannot see the real port, and each destination service therefore needs two things:

1. a Cilium ingress rule that admits the profile's pods on 15008, and
2. an Istio `AuthorizationPolicy` with `action: DENY` that limits tenant callers to the one service port: `rules.from.source.namespaces: ["ob1-uo-*"]` with `to.operation.notPorts: ["<port>"]` (examples: `sts-service-deny-tenant-other-ports`, `notPorts: ["8080"]`; `npm-proxy-1-deny-tenant-other-ports`, `notPorts: ["4873"]`).

Use DENY with `notPorts`, not ALLOW: an ALLOW policy turns the destination into an allow-list and cuts every caller it does not name (see `AGENTS.md`, "Istio ambient", in `k8s-security`). Istio has no egress policy for ambient pods without a waypoint, so the source-side control stays in Cilium: keep each rule to exact destination endpoints and port 15008. The operator's own egress policy (`sandbox-operator-1-egress-allow-required`) follows the same rule: it names the kube-apiserver and the database, and no in-mesh service port.

## Using the `kube-apiserver` Entity

Controllers that watch/patch cluster resources (which is most operators) need egress to `kube-apiserver`. Admission/conversion/mutating webhooks need the reverse — **ingress** from `kube-apiserver`, since the API server calls the webhook synchronously. Cilium's dedicated `kube-apiserver` entity resolves the control plane's actual (and potentially rotating) address dynamically:

```yaml
# egress: workload -> kube-apiserver
egress:
  - toEntities: [kube-apiserver]
    toPorts:
      - ports: [{port: "443", protocol: TCP}]

# ingress: kube-apiserver -> workload (e.g. an admission webhook)
ingress:
  - fromEntities: [kube-apiserver]
    toPorts:
      - ports: [{port: "<webhook port>", protocol: TCP}]
```

Never substitute a static CIDR block for this — the control plane's addressing isn't a stable target to hardcode, and the entity-based rule is both simpler and correct by construction.

## PeerAuthentication (mTLS)

Istio sidecar injection is on cluster-wide, but that alone doesn't enforce mTLS — it just makes it *possible*. Whether traffic is required to be mTLS is controlled per-namespace by a `security.istio.io/v1 PeerAuthentication` object:

```yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: <name>-1-strict-mtls
  namespace: ob1-tf-eks-<name>-ns-1
spec:
  mtls:
    mode: STRICT
```

Every new application namespace must receive this `STRICT` policy. Istio sidecar injection is enabled by default, but injection alone does not enforce mTLS. Existing namespaces without an explicit policy are legacy state and must not be copied as a new-application baseline.

### The Webhook Exception

If anything **outside the mesh** calls the workload directly — the canonical case is `kube-apiserver` calling an admission/mutating/validating/conversion webhook — that caller has no Istio sidecar and no mTLS certificate. Under STRICT mode, that connection gets flatly rejected. Fix with a **port-level** exception, leaving the rest of the namespace STRICT:

```yaml
spec:
  mtls:
    mode: STRICT
  portLevelMtls:
    "8000":              # the webhook's container port - MUST be a quoted string key
      mode: PERMISSIVE
```

**The quoted-string key is not optional.** Istio's API represents `portLevelMtls` as `map<uint32, MutualTLS>`; when this gets converted through YAML → JSON (which `kustomize build`/`kubectl apply` do), an unquoted integer key produces `map[interface{}]interface{}` internally, which fails JSON marshaling with an opaque `json: unsupported type` error. A quoted string key (`"8000":`) round-trips correctly. This is easy to get wrong from memory since some documentation examples show it unquoted — always verify with an actual `kubectl kustomize`/`helm template` build, not just YAML-lint.

### Project Whitelisting

`PeerAuthentication` is a namespaced resource, so it needs the owning `AppProject`'s `namespaceResourceWhitelist` to include `{group: security.istio.io, kind: PeerAuthentication}`. It rides on the same `fnd-network-policy-acd-proj-1` project as `NetworkPolicy`/`CiliumNetworkPolicy` (see [Repos & the App Model](repos-and-app-model.md#2-argocd-critical-stack--the-appprojects)) — check it's actually listed there before assuming any namespace can just add one.
