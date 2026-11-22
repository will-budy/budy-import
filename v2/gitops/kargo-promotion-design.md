# Kargo Promotion Design

|                  |                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Document**     | Kargo Promotion Design                                                                                                         |
| **Version**      | 1.0                                                                                                                            |
| **Status**       | Foundation merged; awaiting Kargo control-plane health and UI-access validation                                               |
| **Audience**     | Platform engineers, application teams, and production change approvers                                                        |
| **Purpose**      | Define a visibility-first Kargo rollout, then automated GitOps promotion of selected applications through dev, stage, prod. |
| **Last Updated** | July 2026                                                                                                                     |

## Goal

First make the release position of each onboarded application visible: which immutable artifact is known, and which of dev, stage, and prod has accepted it. Then progressively automate promotion for a small, explicitly approved set of applications. Kargo is the promotion orchestrator; ArgoCD remains the only reconciler/deployer.

## Current rollout checkpoint

The prod-2 Kargo control plane, configuration repository, initial Project resources, Vault/VSO integration, and OIDC configuration are merged. The immediate work is operational validation: ArgoCD sync/health, Kargo Pod readiness, VSO destination-Secret readiness, ALB target health, and Google login. Until that checkpoint is recorded as successful, this design remains visibility-only and contains no Warehouse, Stage, Git credential, or promotion behavior.

## Kargo Model

| Kargo object | Platform use |
| ------------ | ------------ |
| **Project** | An application-domain/team boundary, such as `de-v2`. Kubernetes namespace RBAC applies per Project. |
| **Warehouse** | Discovers releasable immutable artifacts, normally ECR image digests and/or OCI Helm chart versions. |
| **Freight** | The immutable artifact collection discovered by a Warehouse. This is the promoted release identity. |
| **Stage** | One lifecycle position: `dev`, `stage`, or `prod`. |
| **PromotionTemplate** | The reviewed sequence that changes desired state, waits for ArgoCD, and runs validation. |

Use immutable image digests for production. A mutable tag may help discovery but is not a sufficient production release identity.

## Phase 1 — Visibility Only

Start with two deliberately different candidates: a Temporal Cluster infrastructure Helm release and `de-v2`'s Context Cluster application release. Model the parent Helm chart as the initial Freight signal for each. Context Cluster's shared component-image ECR repository is supporting release evidence in the first phase, not an independently selected Freight source. Create separate Kargo Projects, Warehouses, and dev/stage/prod Stages, then seed each Stage from the revision currently deployed in its Git branch so Kargo starts from a truthful baseline. See the [Kargo Implementation Plan](kargo-implementation-plan.md) for the staged rollout and prerequisites.

Do **not** give Kargo Git write credentials or enable a PromotionTemplate that changes Git during this phase. Verify:

1. Warehouse discovery sees the expected immutable artifact.
2. The known Freight and its dev/stage/prod position agree with the Git/ArgoCD deployed state.
3. Platform users can see the release train in the Kargo UI/CLI and access is limited by Project RBAC.
4. Controller health, backup/restore, and Kargo observability work in the prod-hosted topology.

Kargo is not an automatic inventory of every historical ArgoCD deployment. Its view is authoritative for applications that are modeled as Warehouses/Stages and seeded with the current revision. Expand application coverage deliberately; fleet-wide visibility follows full onboarding.

## Phase 2 — Automated Promotion for an Allow-list

For an approved application, Kargo changes only the application's version reference in the target branch. It must not merge an entire source branch into the next environment.

| Promotion | Target branch | Default completion check |
| --------- | ------------- | ------------------------ |
| Warehouse → dev | `main` | Dev ArgoCD Application is healthy |
| dev → stage | `release/stage` | Stage ArgoCD health plus progressively added smoke/CI checks |
| stage → prod | `release/prod` | Prod ArgoCD health plus required production gates |

The existing `de-v2` workflows create broad PRs for `main → release/stage` and `release/stage → release/prod`. They must be disabled or scoped for an application once Kargo owns its promotion path; otherwise broad branch promotion and Kargo's narrow version promotion will race.

For the initial standard, Kargo creates narrow PRs to protected release branches and never auto-merges them. A Platform/SRE CODEOWNER approves after the configured validation and human-review evidence is attached. Kargo's Git and ArgoCD promotion steps support this GitOps handoff; see [Kargo's ArgoCD integration](https://docs.kargo.io/user-guide/how-to-guides/argo-cd-integration) and [promotion-step reference](https://docs.kargo.io/user-guide/reference-docs/promotion-steps).

## Rollout Gates

Grow checks slowly, but make each enabled gate explicit in the PromotionTemplate:

| Rollout stage | Required gates |
| ------------- | -------------- |
| Visibility | Artifact discovery, seeded baseline match, controller health |
| First dev automation | Git change allow-list and dev ArgoCD health |
| First stage automation | Dev evidence, stage ArgoCD health, smoke test and GitHub Actions where available |
| First prod automation | Stage evidence, prod ArgoCD health, smoke test, GitHub Actions, and required approval/change-control policy |

## Rollback

Rollback is an audited promotion of the last known-good immutable Freight into the affected environment's Git branch, followed by normal ArgoCD reconciliation. Do not force-push or rewrite release-branch history.

## Application-image discovery implementation follow-up

When the first shared-image-repository application is onboarded, update this document and [Application Cluster CI/CD Standard](application-cicd-standard.md) with the implemented Kargo configuration:

1. One image subscription per component in the application's shared ECR image repository.
2. An anchored tag allow-regex that can select only that component's `<component>-<version>-<short-sha>` tags.
3. The selected strategy and discovery limit, justified against registry load and release ordering.
4. The relationship between component-image Freight and the parent Helm chart's SemVer release signal.

Do not turn these implementation details into an application-scaffolding open question: they are part of the Kargo rollout work and must be recorded with the first production configuration.

## Initial Decisions Still Needed

1. Record the exact ArgoCD Application names and GitOps paths for `temporal-cluster-2` and Context Cluster in dev-1, stage-1, and prod-2.
2. Decide whether dedicated Karpenter capacity is needed at initial installation or after measuring Kargo resource use.
3. Confirm the Platform/SRE CODEOWNER team for manual stage/prod Kargo PR approval. Initial policy is no Kargo auto-merge.
4. Convert the approved Temporal and Context smoke-gate descriptions into runnable commands/workflows before enabling Git mutation.
