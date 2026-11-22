# Application scaffolding repository map

| Concern | Local source of truth | Primary path |
| --- | --- | --- |
| GitHub repo | `abb-gitops-repos/github-infra` | `v1/stacks/repos/repos-applications/<group>/v1` |
| ECR image | `abb-gitops-repos/budy-cloud-management` | One image repository per application cluster under `v2/stacks/shared-infra/ecr/v1` |
| Helm OCI chart | `abb-gitops-repos/budy-cloud-management` | One Helm ECR repository per application cluster; `GLOBAL_ECR_HELM_REPO_V1` root plus the parent `Chart.yaml` name |
| Kubernetes namespace/AWS resources | `abb-gitops-repos/budy-cloud-management` | Locate current `v2` stack; do not trust stale wiki path blindly |
| Vault policy/auth | `abb-gitops-repos/vault-management-1` | `v2/stacks/vault-cluster-2/<group>/v1` |
| PostgreSQL database/roles | `abb-gitops-repos/argocd-eks-stack` | `v2/apps/platform/dbsrv/postgres-objs/manifests/postgres-cluster-1/jobs`; shared bootstrap and grant jobs work for CNPG dev/stage and RDS prod |
| Kubernetes security | `abb-gitops-repos/k8s-security` | `v1/objects/{rbac,netpol,scrt,opa-policy}` |
| AppProject | `abb-gitops-repos/argocd-critical-stack` | `v2/env/_base/bootstrap/projects/applications` |
| Shared infra app | `abb-gitops-repos/argocd-eks-stack` | `v2/apps/...` |
| de-v2 app release | `abb-gitops-repos/de-v2` | `charts/apps/<app>` |
| design app release | `abb-gitops-repos/design-services` | Inspect current `charts/apps` layout |
| execution app release | `abb-gitops-repos/execution-services` | `charts/apps/<app>` |
| shared app release | `abb-gitops-repos/shared-services` | `charts/apps` and dev/stage/prod profile Kustomize roots; human-approved `main` → `release/stage` → `release/prod` promotion |
| Source reference | `aa-budy-OB1-micro-services/.../context-cluster-1` | Multi-module gateway/component cluster |
| Source reference | `aa-budy-OB1-micro-services/.../llm-router-1` | Worker/proxy cluster and release patterns |
| Shared Go modules | `aa-budy-OB1-micro-services/shared-ref-packages/ob1_tf_gh_budy-common-modules-1_repo_1` | `go/runtimeconfig`, `go/worker` |
| Shared CI/CD workflows | `aa-budy-OB1-micro-services/shared-ref-packages/platform-actions_repo_1` | Private reusable workflow library; pin callers to `@v1` |

## Confirmed boundaries

- Product applications do not release from `argocd-eks-stack`.
- Application Temporal resources belong in the self-sufficient application chart.
- Vault policy is Terraform-managed in `vault-management-1`.
- Application VaultAuth/VSO templates belong in the application chart; Vault role/mount/path/destination values belong in group GitOps values.
- Stakater Reloader is cluster-installed. Each consuming Pod template must annotate exact VSO Secret and non-hot-reloaded ConfigMap names using `secret.reloader.stakater.com/reload` and `configmap.reloader.stakater.com/reload`.
- RBAC, NetworkPolicy/Cilium, Istio, and OPA belong in `k8s-security`.
- Application artifacts live in the central `ecr-1` account and are pulled by workload accounts.
- New applications normally get dedicated Kubernetes and Temporal namespaces.
- New application namespaces start with default-deny, DNS/mesh/Temporal access, and `STRICT` mTLS; all other access is need-based.
- Every new Pod template has a distinct `budybot.io/netpol` label used verbatim by Kubernetes NetworkPolicy and Cilium `k8s:budybot.io/netpol` selectors; standard Kubernetes recommended labels and the legacy plain `app` label do not replace it. Add the namespace-scoped deny-mode `BudyNetpolIdentity` allow-list constraint in `k8s-security`; its template is available in every environment profile and no cluster-wide constraint is used.
- Application PostgreSQL databases are not CNPG or AWS resources owned by an application. Add idempotent bootstrap SQL, three pre-created database roles, a dedicated grant ConfigMap, Vault-admin `WITH ADMIN OPTION` grants, and Vault `pg.precreated_roles` wiring through the shared PostgreSQL control plane.

## CI/CD reuse

Use `ob1_mn_github_platform-actions_repo_1` for the proven reusable workflows now scaffolded in the shared workflow library. GitHub Actions retrieves private reusable workflows through the repository's organization-level Actions access policy; do not use the REF PACKAGE App for that retrieval. The REF PACKAGE App remains for private Go-module/source access. The CI/CD state machine is defined in `v2/gitops/application-cicd-standard.md`.
