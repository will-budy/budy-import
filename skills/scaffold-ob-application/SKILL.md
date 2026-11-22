---
name: scaffold-ob-application
description: Scaffold or diagnose a new OB/Budy self-contained application cluster across GitHub Terraform, AWS/ECR and Kubernetes infrastructure, Vault, Kubernetes security, ArgoCD AppProjects, application source/Helm/Temporal code, and the appropriate de-v2/design/execution GitOps release repository. Use for new application repos, application cluster onboarding, adding Temporal worker monorepos, adding a Nexus-fronted cluster, or fixing incomplete cross-repo application scaffolding.
---

# Scaffold an OB Application

For a Nexus-first execution-mode cluster, `../provision-nexus-cluster/SKILL.md` is the worked, ordered runbook (exact files, merge order, first release); this skill stays the general reference.

Create a coordinated, reviewable set of changes across repositories. Treat the application as one cluster with its own Kubernetes namespace and Temporal namespace, one externally reachable Nexus entrypoint, and private internal workers/sub-applications.

## Before changing files

1. Read `references/repository-map.md` completely.
2. Read the current wiki guides:
   - `../../v2/gitops/scaffolding-an-application-repo.md`
   - `../../v2/gitops/repositories/index.md`
   - `../../v2/gitops/application-cicd-standard.md`
3. Read every applicable `AGENTS.md` in the source application repository.
4. Inspect the latest local Context Cluster and LLM Router rather than relying on remembered paths.
5. Check every target repo's dirty state and preserve unrelated changes.

If an open question changes security, account routing, repository classification, or release behavior, stop and ask the owner. Do not convert a live implementation inconsistency into policy.

## Establish the application contract

Record before implementation:

- application/group classification: `thinking-mode`, `muscle-memory-mode`, or `shared-apps`; choose `shared-services` GitOps release ownership when the deployed application is used by multiple groups;
- source repo name and description;
- Kubernetes namespace and Temporal namespace;
- Nexus service, endpoint, operation/version, entrypoint worker, and entrypoint task queue;
- each internal worker, task queue, component version/image tag, scaling, and dependencies;
- Vault identities, secret engines/paths, destination Secret names, and consumers;
- PostgreSQL database name, required extensions/schema, admin/readwrite/readonly role requirements, credential consumers, and dev/stage/prod connection validation;
- each component's `budybot.io/netpol` Pod label and VSO Secret/ConfigMap dependencies that must trigger a restart;
- Kubernetes API permissions and network peers/ports;
- one ECR image repository, component tag prefixes, one Helm ECR repository, and parent chart name;
- application GitOps repo and AppProject, including `shared-services` when the application serves multiple groups;
- dev smoke test, promotion, and rollback plan.

One entrypoint is externally accessible. Keep internal workers inaccessible from outside the application cluster. Use child workflows on internal task queues unless a separately owned cross-application contract requires Nexus.

## Execute in dependency order

### 1. GitHub repository

Work in `abb-gitops-repos/github-infra/v1/stacks/repos/repos-applications/<group>/v1`.

- Add a standard declaration when defaults fit.
- Use a repo-specific `.tf` file only for real differences.
- Import legacy UI-created repositories before apply.
- Reuse modules/direct resources. Introduce a custom Terraform module only when at least three present or planned uses justify it; migrate three existing direct resources with `moved` blocks before a fourth use.
- Start new application source repositories from scratch with the GitHub `Go` `.gitignore`; there is no source template repository yet.
- Validate the touched stack with backend disabled. Do not apply external changes without user authorization.

### 2. AWS artifacts and cloud resources

Work in `abb-gitops-repos/budy-cloud-management`.

- Add exactly one application-cluster container image repository in `ecr-1`.
- Use `<component>-<version>-<short-sha>` immutable tags for all subcomponents in that repository.
- Add exactly one Helm ECR repository for the application cluster.
- Publish only the parent/umbrella chart there; bundle subcharts locally and do not create Helm repositories for subcomponents.
- Confirm the image repository, tag prefixes, Helm repository, parent chart name, and OCI root agree with source workflows and GitOps `app.yaml`.
- Create the dedicated Kubernetes namespace in the actual namespace stack after locating it.
- Add AWS dependencies by instantiating an existing module or direct resources; follow the three-use module rule and use `moved` blocks for a fourth-use consolidation.
- Review cross-account pull access for active workload environments.

Never create AWS resources from the application source repo.

### 3. Vault

Work in `abb-gitops-repos/vault-management-1/v2/stacks/vault-cluster-2/<group>/v1`.

- Add one catalog identity per distinct privilege set.
- Bind the Vault Kubernetes-auth role to exact ServiceAccount and namespace values.
- Select only required KV/database/Redis/JWT/PKI policies.
- Separate migration/admin Jobs from runtime workers.
- Confirm audience, mount, path, role, and policy names against security manifests.

For PostgreSQL consumers, add the `pg.precreated_roles` entry in the service catalog and reuse the existing `modules/pg_db` fan-out. Request only the pre-created `<database>-read-role`, `<database>-user-role`, or `<database>-admin-role` needed by that workload. This creates the Vault database-engine role and its read policy, which the Kubernetes-auth role receives automatically.

### 3a. Shared PostgreSQL database control plane

Read `../../v2/gitops/postgres-database-provisioning.md` completely before adding an application database.

Work in `abb-gitops-repos/argocd-eks-stack/v2/apps/platform/dbsrv/postgres-objs`.

- Do not create a CNPG `Database` resource or an application-specific AWS database resource: dev/stage use CNPG and prod uses RDS.
- Add the idempotent database/extension SQL to the bootstrap ConfigMap and its explicit bootstrap CronJob invocation.
- Add all three `NOLOGIN` roles—`<database>-admin-role`, `<database>-user-role`, and `<database>-read-role`—to the common role/grant ConfigMap.
- Create one dedicated application database-grants ConfigMap, then wire it into the jobs Kustomization, main apply Job ConfigMap watch, volume/mount, and `psql -d <database>` command.
- Grant all three group roles to `ob1_pgo_postgres_vault_admin_user` with `WITH ADMIN OPTION` in the Vault-specific grants ConfigMap.
- Keep the bootstrap CronJob suspended. Run/unsuspend it only through the approved operational flow; the main apply Job handles normal grant reconciliation.

### 4. Kubernetes security

Work in `abb-gitops-repos/k8s-security/v1/objects`.

- Add no Kubernetes API RBAC by default. Add least-privilege namespaced RBAC first; use cluster RBAC only when required.
- Identify the ArgoCD Application that applies each security resource set (namespaced RBAC, VSO, network/mesh policy, and constraints). Each distinct owning AppProject must permit the new application namespace and the rendered kinds; adding the namespace only to the application AppProject does not authorize a separate security Application.
- Add default deny, baseline DNS/mesh/Temporal egress, exact need-based dependency paths, entrypoint ingress, Cilium rules, and `STRICT` PeerAuthentication. OTEL, database, Kubernetes API, external, and cross-namespace access are not baseline permissions.
- Set a distinct stable `budybot.io/netpol: <component>` label on every Pod template, including WorkerDeployments and independently governed Jobs. Ensure `NetworkPolicy` selectors and Cilium `k8s:budybot.io/netpol` selectors match exactly, including hooks/Jobs. Treat plain `app` selectors as legacy only. Add a deny-mode namespace-scoped `BudyNetpolIdentity` constraint in `k8s-security` with every component/Job identity in `parameters.allowedValues`; this is required before the namespace is onboarded.
- Wire all Kustomizations and build the full affected trees.

Application VaultAuth/VSO resources are chart-owned. For PostgreSQL, render a `VaultDynamicSecret` from non-secret GitOps values (`db-eng-1`, credential path, VaultAuth reference, destination, renewal). Do not use a KV-held application database password. Put `secret.reloader.stakater.com/reload` and `configmap.reloader.stakater.com/reload` annotations on each consuming Pod template, listing exact comma-separated resource names so Reloader restarts it after VSO/ConfigMap changes. Security review must still verify their ServiceAccounts, labels, destination Secrets, and network paths against the external policies.

When an application intentionally reuses a shared `VaultAuthGlobal` instead of chart-owned Vault auth, add the application's exact namespace to that global auth's `spec.allowedNamespaces` in `k8s-security` and validate the rendered global-auth aggregate. Do not assume a namespace-local `VaultAuth` alone grants this permission.

### 5. AppProject

Work in `abb-gitops-repos/argocd-critical-stack/v2/env/_base/bootstrap/projects/applications`.

- Reuse the group project.
- Add the dedicated namespace destination.
- Build a namespace-admission matrix before merging: list the application GitOps Application and every security Application that targets the namespace (RBAC, VSO, network/mesh/OPA). Add the namespace to each corresponding AppProject's `spec.destinations`, and confirm its resource allow-list covers the rendered manifests. This is separate from `VaultAuthGlobal.spec.allowedNamespaces`; both are required for shared VSO.
- Confirm the group GitOps repo and ECR Helm source are allowed.
- Allow application-owned namespaced kinds required by the rendered chart.
- Allow cluster-scoped kinds only by explicit name; deny all other cluster kinds. Keep security-owned namespaced kinds controlled through the security projects/repositories.
- Add a new project only for a genuinely new trust boundary.

### 6. Application source repository

Use a Go multi-module cluster patterned on Context Cluster/LLM Router:

- `go.work`, component Go modules, shared contract/bootstrap code, entrypoint, internal workers/components;
- umbrella chart plus independently released component subcharts/images;
- application Temporal namespace/connection/WorkerDeployment/Nexus endpoint and generic VaultAuth/VSO resources;
- versioned contracts, determinism and idempotency tests, chart rendering, and the CI/release/GitOps state machine defined by `$manage-ob-application-cicd`.

Use the cloned reference `aa-budy-OB1-micro-services/shared-ref-packages/ob1_tf_gh_budy-common-modules-1_repo_1`, especially its versioned `go/runtimeconfig` and `go/worker` modules. Set `GOPRIVATE` and `GONOSUMDB`. Generate the short-lived private-repo token with variable `GLOBAL_REFPACKAGE_APP_1_ID` and secret `GLOBAL_REFPACKAGE_APP_1_PEM`, then pass it as a BuildKit secret named `github_token`. Use the token only in the secret-mounted build step. Never use `ARG`, `ENV`, copied credential files, echoed values, or cache persistence for the token.

Build caller workflows as thin application-specific state machines and call `Budybot/ob1_mn_github_platform-actions_repo_1` reusable workflows pinned to the moving major tag `@v1`. GitHub retrieves those private workflows through organization Actions access; do not reuse the REF PACKAGE App for workflow retrieval. Use the REF PACKAGE App only for private Go source/modules and the GitOps App only for the GitOps chart-version PR.

Follow the Context Cluster CI variable contract unless platform policy changes:

- `AWS_ECR_1` and `AWS_REGION_MAIN`;
- `GLOBAL_VAR_AWS_ECR_IMAGE_BUILDER_2_ROLE_1_ARN`;
- `GLOBAL_ECR_HELM_REPO_V1`;
- `GLOBAL_REFPACKAGE_APP_1_ID` / `GLOBAL_REFPACKAGE_APP_1_PEM`;
- `GLOBAL_GITOPS_APP_1_ID` / `GLOBAL_GITOPS_APP_1_PEM`.

Publish every component image to the cluster's single image repository with the Context Cluster tag pattern `<component>-<version>-<short-sha>`. Publish only the umbrella chart to the cluster's single Helm ECR repository. The workflow appends its `Chart.yaml` name to the `GLOBAL_ECR_HELM_REPO_V1` root/prefix; subcharts remain bundled local dependencies.

Use pinned worker deployment behavior and consume controller-injected runtime Build ID/deployment metadata.

### 7. Application GitOps release

Select exactly one:

- `abb-gitops-repos/de-v2` for de-v2 applications;
- `abb-gitops-repos/design-services` for design/thinking-mode applications;
- `abb-gitops-repos/execution-services` for execution/muscle-memory applications.
- `abb-gitops-repos/shared-services` for shared applications used by multiple groups.

Add the real ArgoCD `Application`, application-cluster Helm ECR source with immutable `targetRevision`, Git values source, dedicated destination namespace, base/profile values, and Kustomization wiring. Put Vault role, auth mount, secret-engine mount/path, destination Secret, refresh, and environment settings here as non-secret values consumed by generic chart VSO templates. Keep secret payloads and externally governed RBAC/network/Istio policy out. Current dev → stage → prod promotion is bulk human approval; promotion is by per-app Kargo release trains with bake checks (see `docs/kargo-release-trains.md` in the GitOps repo) for apps listed in `.github/kargo-managed-apps`; other apps still use bulk human approval. Enabling a release train also needs the Project in the `kargo.akuity.io/github-token-scopes` annotation of `kargo-github-app.vss.yaml` (`v1/objects/scrt/vso-secrets/infra-1/manifests/kargo-shared-resources-ns-1/` in `ob1_mn_github_k8s-security_gitops_repo_1`), otherwise its Warehouse fails with `could not read Username for 'https://github.com'`; the order of the cross-repo steps is in `scaffold-nexus-cluster-repo/references/gitops-and-bring-up.md`.

### 7a. Numbered multi-repository PR handoff

Treat onboarding as one numbered change set, not independent PRs. Assign merge order from the dependency map: GitHub repo, ECR, namespace, PostgreSQL when applicable, Vault, k8s-security, application source, AppProject when needed, then application GitOps. Prefix every PR title `[app-onboard N/M] <application>: <scope>`.

Before requesting review, include all of the following in every PR body:

- `Change set: N/M` and target environment(s);
- linked prerequisites and their required Terraform/render/release checks;
- `Next approval: N+1/M — <repository> — <PR link>` or an explicit condition for opening it;
- `Reviewer action: approve now` or the exact check/PR/artifact to wait for;
- the last safe rollback/hold point.

Update the prior PR with the actual next PR link once created. Do not request approval for the GitOps deployment PR until the referenced chart has been published and all namespace/Vault/security prerequisites are merged.

## Validate

Run the narrowest safe checks plus full aggregate builds where one bad resource can break a shared app:

- Terraform formatting/validation for every touched stack; inspect plans when credentials/workflows permit.
- `go test`/lint for every module and contract compatibility tests.
- Docker build with BuildKit secret handling; inspect history/config for token absence.
- Helm dependency update, lint, and render for base plus each profile.
- Kustomize build for every security and GitOps aggregate touched.
- Confirm each ArgoCD Application that owns application, RBAC, VSO, or network/mesh resources has an AppProject destination for the application namespace and an allow-list for its rendered kinds; do this before live reconcile.
- For PostgreSQL changes, build the shared `postgres-objs` aggregate and prod profile overlays; validate the relevant Vault stack and test dynamic credential readiness, each role level, rotation, and the dev/stage CNPG plus prod RDS/TLS paths.
- Cross-reference namespace, ServiceAccount, Vault role, Secret, labels, Service ports, task queues, endpoint, chart name/version, and ECR path.
- Render every workload and verify its `budybot.io/netpol` label plus Reloader annotations name every consumed VSO destination Secret and non-hot-reloaded ConfigMap.
- Dev reconcile and smoke tests: VSO readiness, Temporal registration, one external Nexus call, each internal worker/dependency, denied unauthorized traffic, and rollback.

## Deliver

Report changes grouped by repository, commands/results, unresolved questions, deployment ordering, and any actions that require credentials or owner approval. Never claim the application is fully scaffolded while a required repository remains unmodified or unverified.
