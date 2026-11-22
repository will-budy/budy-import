---
name: add-ob-infrastructure-app
description: Add, upgrade, or debug a shared infrastructure application or Kubernetes operator in the OB/Budy GitOps platform across AWS/namespace infrastructure, Vault, Kubernetes security, ArgoCD AppProjects, and argocd-eks-stack. Use for Helm operators, controllers, platform services, observability tools, Goldilocks/Kargo/OTEL-like additions, CRD upgrades, or incomplete infrastructure-app onboarding.
---

# Add an OB Infrastructure Application

Onboard a shared cluster capability through GitOps. Keep upstream application configuration, cloud infrastructure, Vault, Kubernetes security, and ArgoCD access boundaries in their owning repositories.

## Before changing files

1. Read `references/repository-map.md` completely.
2. Read:
   - `../../v2/gitops/adding-a-new-operator.md`
   - `../../v2/gitops/repos-and-app-model.md`
   - `../../v2/gitops/network-policy-and-mtls.md`
   - `../../v2/gitops/repositories/index.md`
3. Inspect the latest matching app in every target repo.
4. Check dirty state and preserve unrelated changes.

## Research the upstream release

Verify from official upstream sources and the actual chart/package:

- canonical repository/chart and supported Kubernetes versions;
- exact chart/CRD version and upgrade constraints;
- rendered Deployments/StatefulSets/DaemonSets/Jobs/webhooks/Services;
- every ServiceAccount, Role, ClusterRole, binding, and CRD;
- pod labels, hooks, ports, probes, volumes, storage classes, and image repositories;
- API-server, DNS, internet/FQDN, telemetry, database, and internal network paths;
- secret requirements and rotation behavior;
- high availability, scaling, disruption, backup, rollback, and uninstall behavior.

For every Helm chart, keep its exact pinned upstream defaults as an unmodified `values/default.values.yaml` beside the base/profile/environment override files. Retrieve it with `helm pull <repo-or-oci-chart> --version <pinned-version> --untar` then copy the extracted chart's `values.yaml`; when using `helm show values`, strip OCI transport lines such as `Pulled:`/`Digest:` before writing the file. Refresh this file in the same PR as every chart-version change. Never reference it from `app.yaml`; it is a local developer reference. Do not infer chart keys from documentation alone; render them.

## Execute in dependency order

### 1. GitHub and cloud resources when needed

- If an internal source/config repo is needed, declare it in `github-infra`; import legacy UI resources.
- Create namespaces and AWS dependencies in `budy-cloud-management`.
- Use an existing Terraform module/direct resources. Introduce a custom module only when at least three present or planned uses justify it; when three direct implementations are about to gain a fourth, migrate them with `moved` blocks rather than recreate resources.
- If an internally built image/chart is published, add its ECR resources in the central `ecr-1` stack.

### 2. Vault when needed

- Add exact Vault policies/auth roles in `vault-management-1`.
- Bind roles to exact security-owned ServiceAccounts and namespaces.
- Prefer dynamic credentials where supported; separate migration/admin from runtime.
- For PostgreSQL static credentials, create the target PostgreSQL login role before the Vault static role is applied. Grant Vault's database connection principal membership in that role with `ADMIN OPTION` (and ensure it has the required role-administration capability), because Vault rotates the password immediately when it creates the static-role resource.

### 3. Kubernetes security

Work in `k8s-security`:

- disable broad chart RBAC when it can be replaced safely with hand-scoped RBAC;
- add cluster/non-cluster RBAC, VSO/VaultAuth/ServiceAccounts, default-deny and positive NetworkPolicy/Cilium rules, PeerAuthentication, and OPA exceptions only when justified;
- when a namespace uses the shared VSO pattern, add its exact namespace to the matching `VaultAuthGlobal.spec.allowedNamespaces` allow-list (for shared infrastructure, `shared-vso-1-global-vault-auth-1` in `objects/rbac/cluster/manifests/vault-secret-operator-ns-1/shared-vso-1.vaultAuthGlobal.yaml`). A namespace-local `VaultAuth`, Vault Terraform role, and `VaultStaticSecret` are insufficient without this allow-list entry;
- when an ALB Ingress uses an OIDC client secret, materialize that Secret through VSO in the Ingress namespace. Create a namespace-local Role limited to `get` on that exact Secret and a RoleBinding for the AWS Load Balancer Controller ServiceAccount in `kube-system`; never move or duplicate the Secret into the controller namespace. Validate the controller's `can-i get secret/<name> -n <ingress-namespace>` result;
- when using AWS Load Balancer Controller, set the rendered Ingress `pathType` to `Prefix` for a root (`/`) application. Do not inherit a chart's `ImplementationSpecific` default without testing nested asset/API paths; verify `/`, the health path, static assets, and API routes all reach the backend rather than returning ALB 404s;
- account for webhooks called by the API server, Helm hook Jobs, controllers reaching the API server, DNS, istiod, OTEL, and external repositories/APIs;
- wire parent Kustomizations and build complete aggregates.

Security policy does not belong in `argocd-eks-stack` application values/manifests.

### 4. AppProject

Work in `argocd-critical-stack`:

- reuse/extend the correct foundation/platform/observability/governance project;
- allow the exact source repository, destination namespace, and resource kinds;
- build a namespace-admission matrix for every ArgoCD Application that will apply resources to the new namespace. Add the namespace to every owning AppProject's `spec.destinations`—the application/control-plane project, the security VSO project, and the security namespaced-RBAC project when applicable—and add every rendered kind to that project's allow-list. Do not assume the application's own AppProject authorizes VSO, Roles, RoleBindings, NetworkPolicies, or other resources applied by separate security Applications;
- when a security-owned VSO application manages a new namespace, add that namespace to its security AppProject destinations as well as the VSO `VaultAuthGlobal.spec.allowedNamespaces`; both gates apply before a `VaultStaticSecret` can sync;
- add cluster-scoped kinds only when rendered output proves they are required;
- create a new AppProject only for a distinct trust boundary.
- if a controller has a separately maintained declarative configuration repository, create a second, lower-privilege AppProject for it. Keep the Helm/control-plane AppProject responsible for CRDs, RBAC, admission webhooks, and system namespaces. The configuration project may allow all CRDs in that controller's API group across future configuration namespaces when its source repository is protected, but never grant it non-controller Kubernetes resource kinds merely because the Helm chart needs them.

### 5. Infrastructure application

Work in `argocd-eks-stack/v2`:

- choose the correct tier/category;
- add the repo-specific `app.yaml` (`type: helm` or `type: git`);
- pin the chart/version and release name;
- layer base then profile values; use environment overlays only for genuine per-environment differences;
- add distinct `budybot.io/netpol` labels required by new security selectors, and add each to the namespace-scoped deny-mode `BudyNetpolIdentity` allow-list in `k8s-security`; use plain `app` only for legacy policy compatibility;
- disable chart security resources that are intentionally owned by `k8s-security` without disabling required non-security application behavior;
- never place secret values in Git.

## Validate

- Render Helm with the exact base+profile combinations for dev, stage, and prod.
- Inspect all rendered resource kinds, names, labels, ServiceAccounts, hooks, selectors, Services, and ports.
- Build all touched Kustomize aggregates in `argocd-eks-stack`, `k8s-security`, and `argocd-critical-stack`.
- For every shared-VSO consumer, render the `VaultAuthGlobal` aggregate and verify the consuming namespace appears in `spec.allowedNamespaces`, as well as verifying the namespace-local `VaultAuth` role and VSO destination Secret.
- Validate Terraform stacks and inspect plans where possible.
- For PostgreSQL static credentials, validate the database-job ordering and that the Vault database connection can run `ALTER ROLE` on the target role; the target role merely existing is insufficient.
- Cross-check the namespace-admission matrix: render every application/security aggregate and verify each owning Application's AppProject permits its destination namespace and every rendered kind (including RBAC and VSO resources).
- Test dev reconcile, controller/API access, webhooks, VSO readiness, dashboards/ingress, metrics/logs/traces, denied traffic, and rollback.

## Upgrade and bug diagnosis

For an existing infrastructure app, trace ownership before editing:

1. Is the failure a chart/value issue (`argocd-eks-stack`)?
2. Is ArgoCD rejecting a source/destination/kind (`argocd-critical-stack`)?
3. Is a namespace/AWS resource absent (`budy-cloud-management`)?
4. Is Vault auth/permission wrong (`vault-management-1`)?
5. Is RBAC, netpol, Cilium, Istio, VSO, or OPA blocking it (`k8s-security`)?

Diagnose first when asked to diagnose; do not implement a fix without authorization.

## Deliver

Report per-repository changes, upstream version/source, render/build/test evidence, security decisions, deployment order, rollback, and unresolved risks. State clearly if a live-cluster or credentialed verification remains.
