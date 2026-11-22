# Repository: argocd-eks-stack

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/argocd-eks-stack`

## Ownership

This is the deployment/configuration repository for shared cluster infrastructure applications: foundation, platform, observability, governance, and related operators/tools. It is not the canonical release repository for product application clusters; those use the group application GitOps repositories.

The repo uses its custom `app.yaml` abstraction for Helm and Git sources, with base/profile/environment layering described in [Repos & the App Model](../../repos-and-app-model.md).

## New infrastructure app work

1. Research the upstream chart/repository, supported versions, CRDs, RBAC, hooks, ports, dependencies, and chart defaults.
2. Add the infrastructure app under the correct `v2/apps/<tier>/<category>/<app>` path.
3. Pin the chart version; keep unmodified upstream defaults for reference where that convention applies.
4. Add base/profile values and environment overlays only when a true environment-specific difference exists.
5. Coordinate namespace/AWS, Vault, security, and AppProject work in their owning repositories.
6. Render all profiles and build every touched Kustomization before PR.

## Guardrails

- Do not use this repo to bypass `budy-cloud-management`, `vault-management-1`, `k8s-security`, or AppProject ownership.
- Do not embed security policy in an operator chart when it belongs in the security repo.
- Do not apply manifests manually to compensate for a missing GitOps dependency.
- The shared PostgreSQL bootstrap/role/grant jobs live here because they must work for CNPG in dev/stage and RDS in prod. Product applications add database SQL to that control plane; they do not create their own CNPG or AWS database resource. See [PostgreSQL Database Provisioning](../../postgres-database-provisioning.md).
