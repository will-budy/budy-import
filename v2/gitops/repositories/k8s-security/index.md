# Repository: k8s-security

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/k8s-security`

## Ownership

This repository owns Kubernetes security resources separately from application and infrastructure charts:

- cluster RBAC under `v1/objects/rbac/cluster`;
- namespaced RBAC and security-owned ServiceAccounts under `v1/objects/rbac/non-cluster`;
- NetworkPolicy, CiliumNetworkPolicy, and PeerAuthentication under `v1/objects/netpol`;
- infrastructure/shared VSO secret resources under `v1/objects/scrt/vso-secrets`;
- Gatekeeper/OPA policy under `v1/objects/opa-policy`.

Shared `VaultAuthGlobal` resources live in the Vault Secret Operator security area and are application-group scoped where appropriate.

## New application work

1. Create the namespace security folder in each required tree.
2. Confirm the application chart's VSO identities and destination Secrets agree with externally governed RBAC and network policy; infrastructure VSO resources may still live here.
3. Add no Kubernetes RBAC by default; introduce Role/RoleBinding or ClusterRole/Binding only for a documented API requirement.
4. Add namespace default-deny ingress, baseline DNS/mesh/Temporal egress, app-specific ingress/egress, Cilium entities/FQDNs where needed, and `STRICT` PeerAuthentication.
5. Ensure every selected pod has the expected `budybot.io/netpol` label and account for hook/migration Jobs. New NetworkPolicy/Cilium selectors use `budybot.io/netpol`/`k8s:budybot.io/netpol`; plain `app` is legacy only.
6. Add a deny-mode `BudyNetpolIdentity` constraint under `v1/objects/opa-policy/manifests/additional-policy-by-ns/<namespace>/`. Match only that namespace and allow-list every component label, including Job/migration identities. The reusable template is delivered to all environment profiles; a namespace constraint is what activates enforcement.
7. Wire every new folder into its parent Kustomization and build the full object tree.

## Guardrails

- RBAC, NetworkPolicy/Cilium, Istio, and OPA do not belong in application charts. Application VaultAuth/VSO templates are the approved exception and must remain values-driven.
- Match references against rendered application resources: ServiceAccounts, labels, Services, ports, and Secret names.
- Start every namespace at least privilege: standard DNS, Istio control-plane/mTLS, and approved Temporal access are the baseline. Database, OTEL, Kubernetes API, external FQDN, cross-namespace, and other paths require an explicit need-based allow.
- Require `STRICT` mTLS for every new application namespace because Istio sidecar injection is enabled by default. Use a narrowly scoped port-level exception only for a verified non-mesh caller, and test it.
- Reject application charts that hard-code Vault roles, mounts, KV/database paths, or environment-specific VSO destinations instead of accepting them through GitOps values.
