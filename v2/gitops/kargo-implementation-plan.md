# Kargo Implementation Plan

| | |
| --- | --- |
| **Status** | Foundation merged; awaiting prod-2 reconciliation and UI-access validation — do not enable promotion yet |
| **Scope** | One prod-2-hosted Kargo control plane; visibility of one Temporal cluster and Context Cluster across dev, stage, and prod |
| **Goal** | Establish trustworthy release visibility first, then add narrowly scoped, human-approved GitOps promotion |

## Decision: topology and ownership

Kargo is a promotion control plane, not a per-application controller. Install one Kargo control plane in the `prod-2` EKS cluster in a dedicated system namespace. Its API/UI, CRDs, Projects, Warehouses, Stages, Freight, PromotionTasks, and promotion history are all Kubernetes resources in that central control plane. The sole user interface is `https://kargo.prod-2.orangebox.ai`, exposed through a direct ALB ingress using the established ArgoCD pattern; controller shards do not expose their own UI.

That does **not** mean only prod participates. To observe ArgoCD health and safely run promotions for all three independent ArgoCD installations, deploy one narrowly scoped Kargo controller shard in each of dev-1, stage-1, and prod-2. Each controller talks to the central control plane but is permitted to interact with at most its local ArgoCD control plane. The central control plane therefore has visibility without holding a multi-cluster administrator credential.

| Concern | Recommended location |
| --- | --- |
| Kargo Helm release, central namespace, control-plane security, prod bootstrap | `argocd-critical-stack`, prod-2 only |
| Kargo control-plane AppProject | `argocd-critical-stack`; owns the Helm release, CRDs, RBAC, admission webhooks, and only the Kargo system namespaces |
| Kargo configuration AppProject | `argocd-critical-stack`; source-restricted to `kargo-config`, allowed all Kargo CRDs across Project namespaces but no non-Kargo Kubernetes resources |
| Dev/stage/prod controller shards and their local network/RBAC | corresponding environment configuration, installed only after the control plane is healthy |
| Kargo Projects, Warehouses, Stages, PromotionTasks, and verified Git credentials | a dedicated `kargo-config` GitOps repository reconciled only by prod-2 ArgoCD |
| Temporal and Context desired-state changes | their existing GitOps repositories; Kargo changes only a pinned artifact/version reference |

The dedicated configuration repository is `ob1_mn_github_kargo-config_gitops_repo_1`. It has one protected `main` branch, reconciled by prod-2 ArgoCD. Do **not** create a fake `release/stage` or `release/prod` lifecycle for Kargo configuration itself: it is one global prod-hosted control plane, and a protected reviewed `main` gives the intended extra PR gate without pretending Kargo has separate environment installations. Individual Kargo Stages still model dev, stage, and prod.

Keep two AppProjects rather than one. The control-plane chart necessarily creates CRDs, cluster RBAC, admission webhooks, and system resources; allowing the day-to-day Kargo configuration repository to do the same would make a release-train change a control-plane administration path. The configuration AppProject may allow all `kargo.akuity.io` CRDs across Project namespaces so new release trains do not require a project-policy change, but it must not permit non-Kargo Kubernetes resources such as RBAC, Ingress, NetworkPolicy, or arbitrary Kubernetes resources. Visibility-only is enforced by the reviewed Kargo configuration: no Git credentials or Git-mutating PromotionTasks are present until the rollout gates are approved.

Kargo promotions are not deployments. A Stage promotion updates the exact allowed desired-state reference in the application GitOps repository; that environment's ArgoCD then deploys it. This preserves Git history, normal reconciliation, and rollback.

## Current implementation state — July 2026

The following foundation changes are merged and awaiting observation in prod-2:

- Kargo control-plane, shared-resources, and system-resources namespaces;
- scoped Vault/VSO access, including the shared VSO global-auth namespace allow-list and the ALB OIDC destination Secret;
- a namespace-local, resource-name-scoped Role and RoleBinding allowing only the AWS Load Balancer Controller ServiceAccount to `get` that OIDC Secret. The Secret stays in the Kargo namespace; it must not be copied to `kube-system`.
- separate Kargo control-plane and Kargo-configuration AppProjects;
- prod-2 ArgoCD Applications for the pinned `1.10.8` Kargo control-plane chart and `kargo-config` repository, ordered so configuration follows CRD installation;
- the `temporal-cluster-2` and `context-cluster-1` Kargo Project baseline resources; and
- Google SSO through bundled Dex, using the existing VSO-managed Google web-client Secret, with ALB OIDC retained as the outer access gate. Dex performs the confidential Google token exchange; Kargo consumes Dex's PKCE-compatible OIDC session. For AWS Load Balancer Controller, set `api.ingress.pathType: Prefix`; the chart default `ImplementationSpecific` can route `/` while returning 404 for UI assets and API paths.

These changes are **not yet live-validated**. No Warehouse, Stage, Git credential, or Git-mutating PromotionTask has been added.

## Immediate next step — reconcile and access checkpoint

Before adding any release-train resources, perform and record this prod-2 checkpoint:

1. Confirm the `kargo-control-plane-1` ArgoCD Application is Synced/Healthy and `kargo-config-1` follows it successfully.
2. Inspect the Kargo namespace for ready API, controller, management-controller, webhooks-server, and garbage-collector Pods. Confirm the expected Kargo CRDs and the Kargo Project namespaces exist.
3. Confirm the Kargo OIDC `VaultStaticSecret` is Ready and its destination Secret exists; never print Secret data in terminal output or PR evidence. Confirm that `kube-system/ob1-acd-eks-aws-alb-controller-irsa-1` can `get` only `ob1-mn-eks-kargo-google-oidc-secret-1` in the Kargo namespace. An ALB OIDC Ingress fails to reconcile when this namespace-local RBAC is absent.
4. Confirm the ALB target is healthy and open `https://kargo.prod-2.orangebox.ai`. Test Google login as `ksamay@budy.bot` or `jae@budy.bot`; separately confirm a system user has only the intended non-admin access.
5. Record the ArgoCD application status, Pod readiness, VSO condition, ingress result, and login result in the implementation PR/runbook. Stop and diagnose any failed item before adding Warehouses or Stages.

## Target release trains

Use two deliberately different first visibility cases:

| Release train | Type | Initial Freight signal | Why |
| --- | --- | --- | --- |
| `temporal-cluster-2` | Infrastructure Helm release | immutable parent Helm chart version/digest | Validates promotion of a platform chart with dev/stage/prod profiles and stricter operational gates |
| Context Cluster | Multi-component application cluster | parent Helm chart version first; component image tags/digests recorded as supporting evidence | Validates application release visibility without prematurely letting Kargo independently choose tags from a shared image repository |

For Context Cluster, do not subscribe to all component image tags in the first phase. Its one shared image ECR repository contains prefixed tags for multiple components. Start with the parent chart as the release unit; add one anchored image subscription per component only after the discovery regex, tag strategy, and chart/image consistency checks are tested.

## Staged delivery plan

### Stage 0 — design and access decisions (foundation merged)

1. Record `temporal-cluster-2` and Context Cluster's exact ArgoCD Application names and GitOps paths/branches in dev-1, stage-1, and prod-2.
2. Expose only the central UI/API at `kargo.prod-2.orangebox.ai` through the existing direct ALB ingress pattern. The shared Google client needs both callbacks: ALB uses `/oauth2/idpresponse`; Kargo native PKCE uses `/login`. Provision the ALB client secret to the Kargo namespace through Vault/VSO. The built-in admin account is not acceptable for production operation.
3. Create a dedicated Kargo GitHub App, separate from the REF PACKAGE App and GitOps App. Give it only `Contents: read/write` and `Pull requests: read/write` for the GitOps repositories it must update. Store its key through Vault/VSO; never place a personal token in Kargo configuration.
4. Define retention, backup/restore, alerting, SLO, resource sizing, PodDisruptionBudget, NetworkPolicy/Cilium, `STRICT` mTLS, and incident ownership.

**Exit:** a reviewed design PR records all identities, application names, repository paths, artifact signals, and rollback owner.

### Stage 1 — install the secure central control plane

1. Create the prod-2 Kargo system namespace, dedicated AppProject, and `argocd-critical-stack` Helm application with an immutable Kargo chart version. Keep that exact chart's unmodified `default.values.yaml` beside Kargo's environment values and refresh it whenever the pinned version changes.
2. Configure direct ALB TLS termination, bundled Dex with a Google connector, a disabled built-in admin account, and direct ALB ingress at `kargo.prod-2.orangebox.ai`. The Google web client must allow both ALB's `/oauth2/idpresponse` callback and Dex's `/dex/callback`; its VSO-provisioned `clientSecret` is mounted only into Dex. Initial system administrators are `ksamay@budy.bot` and `jae@budy.bot`; initial system users are `prateik@budy.bot` and `lan@budy.bot`. The external-webhook endpoint stays disabled until GitHub webhooks are explicitly approved.
3. Add least-privilege security policies in `k8s-security`, including the dedicated `budybot.io/netpol: kargo` Pod label, VSO authentication, a namespace-scoped `BudyNetpolIdentity` constraint, and (where ALB OIDC reads a VSO Secret) a namespace-local Role/RoleBinding granting the AWS Load Balancer Controller only `get` on that exact Secret.
4. Bootstrap the `kargo-config` repository through `github-infra`, then create its prod-2 ArgoCD Application. Its AppProject must allow only Kargo CRDs and secrets delivered through VSO in the Kargo project namespaces.

**Exit:** Kargo UI is reachable only through approved authentication, control-plane health is green, backup restore is rehearsed, and no promotion-capable Project exists yet.

### Stage 2 — connect environment-local controller shards

1. Deploy one controller shard in dev-1, stage-1, and prod-2 as part of the initial installation, with separate service accounts and a separate central-control-plane token for each shard.
2. Limit each shard to one local ArgoCD instance and its approved applications; do not give it direct credentials to another EKS cluster.
3. Verify central UI/CLI can see all controller shards and can report local ArgoCD health without any Git write credential.

**Exit:** loss of any one shard cannot grant cross-cluster access, and central Kargo remains the single record of Freight history.

### Stage 3 — visibility-only: Temporal Cluster

1. Create one Kargo Project namespace for the Temporal release train in `kargo-config`.
2. Add a Warehouse that discovers only the approved immutable Temporal chart signal.
3. Add `dev`, `stage`, and `prod` Stages: dev accepts Warehouse Freight; stage accepts only verified dev Freight; prod accepts only verified stage Freight.
4. Seed each Stage with the chart revision already deployed in its corresponding Git branch so the first dashboard view is truthful.
5. Configure health observation only. Do not add a PromotionTask that edits Git and do not add Git write credentials.

**Exit:** Kargo correctly shows the currently deployed Temporal Freight and health across all three environments for at least one ordinary release cycle.

### Stage 4 — visibility-only: Context Cluster

1. Create a separate Kargo Project namespace for Context Cluster; do not share Project RBAC or credentials with Temporal.
2. Subscribe to the parent Helm chart release only; correlate its chart values with the published component image digests/tags.
3. Create and seed dev/stage/prod Stages as above, then verify the visual Freight lineage matches Context Cluster's actual GitOps revisions.
4. Document the future component-image subscriptions: one subscription per component, anchored to `<component>-<version>-<short-sha>`, with a bounded discovery limit and chart-version consistency test.

**Exit:** both pilot release trains are visible, but Kargo still has no ability to mutate Git.

### Stage 5 — manual, GitOps PR promotion

1. Add a PromotionTask that modifies only the approved chart-version/value path for the target application and creates a PR—never a broad branch merge or direct protected-branch push.
2. Make dev promotion manually initiated and require ArgoCD health. Keep stage/prod promotion manually initiated: Kargo opens a narrow PR but never auto-merges it; one Platform/SRE CODEOWNER approves after the required evidence is attached.
3. Require these first gates: Temporal needs ArgoCD Healthy/Synced, Temporal frontend/namespace reachability, and a non-destructive test workflow start/completion; Context needs ArgoCD Healthy/Synced, all entrypoint/worker readiness, one authorized Nexus contract call, and an agreed error-rate/availability check. Record the exact runnable checks before enabling each pilot.
4. Preserve the numbered cross-repository PR handoff standard: Kargo-created PRs state prerequisites, next approval, reviewer action, and rollback point.
5. Disable or scope existing broad `main → release/stage` / `release/stage → release/prod` automation for a pilot once Kargo owns that application's narrow version path, preventing races.

**Exit:** a successful and a rollback promotion are rehearsed for Temporal before Context Cluster is permitted to automate beyond visibility.

### Stage 6 — progressive verification and wider onboarding

1. Add Kargo verification steps: ArgoCD health first, then smoke tests, GitHub Actions evidence, SLO/metrics checks, and approved production change-control gates.
2. Add Context Cluster component-image Freight only after each tag-selection regex and image-to-chart consistency check is proven.
3. Onboard additional release trains one at a time using the same Project, Stage, credential, security, observability, and rollback checklist.

## PR sequence

Follow the numbered PR handoff standard. The initial installation sequence is:

1. `github-infra`: create `kargo-config` and, if approved, the dedicated Kargo GitHub App integration declaration.
2. `budy-cloud-management`: create the Kargo control-plane, shared-resources, and system-resources namespaces.
3. `vault-management-1`: grant the Kargo namespace's VSO service account read-only access to its scoped Kargo Vault KV path.
4. `k8s-security`: Kargo namespace VSO authentication and ALB-OIDC secret materialization. When using `shared-vso-1`, add `ob1-tf-eks-kargo-ns-1` to `shared-vso-1-global-vault-auth-1.spec.allowedNamespaces`; without it, the namespace-local `VaultAuth` is rejected even when the Vault-side role and policy are correct. Also add the Kargo namespace to `pfm-security-infra-acd-proj-1.spec.destinations` in `argocd-critical-stack`; otherwise ArgoCD rejects the `VaultStaticSecret` before VSO can create the OIDC destination Secret. Network policy and mTLS enforcement must be merged before applying the Kargo ArgoCD Application.
5. `argocd-critical-stack`: Kargo AppProject, pinned Kargo Helm Application, and prod-2 bootstrap wiring.
6. `kargo-config`: control-plane Project configuration and visibility-only Temporal/Context resources.
7. Existing Temporal/Context GitOps repositories: only after visibility is proven, add Kargo authorization annotations and narrowly scoped promotion paths.

Each PR links its prerequisites, the next PR, required checks, and the last safe hold point. Do not approve a Git-mutating PromotionTask until every visibility-only exit criterion is evidenced.

## Information required before visibility onboarding

The foundation is merged. These decisions are still required before adding Warehouses, Stages, or Git-mutating promotion:

1. Confirm the exact ArgoCD Application names and GitOps paths for `temporal-cluster-2` and Context Cluster in each environment.
2. Confirm the Platform/SRE GitHub team that is the required CODEOWNER for Kargo-created stage/prod promotion PRs.
3. Convert the approved Temporal and Context smoke-gate descriptions into runnable commands/workflows before Git mutation is enabled.

## References

- [Kargo Promotion Design](kargo-promotion-design.md)
- [Kargo Topology Decision](kargo-topology-decision.md)
- [Kargo architecture](https://docs.kargo.io/operator-guide/architecture)
- [Kargo core concepts](https://docs.kargo.io/user-guide/core-concepts)
- [Kargo secure-installation guidance](https://docs.kargo.io/operator-guide/security)
