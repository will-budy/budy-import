# Kargo Topology Decision

|                  |                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Document**     | Kargo Topology Decision                                                                                              |
| **Version**      | 1.0                                                                                                                  |
| **Status**       | Accepted; foundation merged, awaiting prod-2 live validation                                                       |
| **Audience**     | Platform engineers and application teams using GitOps promotion                                                     |
| **Purpose**      | Record where Kargo runs and how it promotes across the independent dev, stage, and prod EKS clusters.              |
| **Last Updated** | July 2026                                                                                                           |

## Decision

Run one logical Kargo control plane in the existing prod EKS cluster for the initial rollout. It hosts Kargo's API/UI and persistent promotion data. Run a controller agent in each cluster that has an independent ArgoCD control plane: dev, stage, and prod. Each agent is restricted to its own cluster and ArgoCD instance.

This is deliberately not three independent full Kargo installations. Separate control planes would fragment the Freight lineage, promotion history, RBAC, credentials, and release-train view that we need to manage one dev → stage → prod lifecycle.

The long-term preferred topology is a dedicated management EKS cluster if the platform gains that capability. The prod-hosted control plane is the accepted initial design because no management-cluster plan exists today and it avoids making a non-production cluster the authority for production promotion.

The control-plane and configuration AppProjects are intentionally separate. The control-plane project owns the Helm chart and its cluster-level installation resources. The protected configuration repository can manage Kargo CRs across future Project namespaces, but cannot create arbitrary Kubernetes resources or modify the Helm control plane.

## Why This Fits the Existing GitOps Model

Every standard GitOps repo has three protected desired-state branches:

| Branch | Cluster it represents |
| ------ | --------------------- |
| `main` | dev |
| `release/stage` | stage |
| `release/prod` | prod |

The prod bootstrap already reads GitOps configuration from `release/prod`. Kargo does not deploy to clusters directly. It promotes an immutable application version by committing a small, application-specific desired-state change to the appropriate branch; ArgoCD then reconciles that branch into its own cluster.

```text
GitHub GitOps branches                    Cluster-local reconciliation
main ──────────────► dev ArgoCD ─────────► dev EKS
release/stage ─────► stage ArgoCD ───────► stage EKS
release/prod ──────► prod ArgoCD ────────► prod EKS

                 ▲            ▲            ▲
                 │            │            │
          dev controller  stage controller  prod controller
                 └────────── Kargo control plane (prod) ──────────┘
```

Kargo's distributed controller model is designed for this pattern: one control plane with controllers sharded per ArgoCD control plane. See the [Kargo architecture documentation](https://docs.kargo.io/operator-guide/architecture).

## Consequences and Required Controls

Hosting Kargo in prod makes it a platform-critical service. The initial installation must include:

- A dedicated namespace, resource requests/limits, a PodDisruptionBudget, monitoring, backups, and a tested restore/runbook.
- NetworkPolicy and mTLS rules following the platform's standard GitOps security model.
- Node affinity/tolerations prepared for future isolation. Add a dedicated Karpenter-provisioned node pool when capacity or blast-radius measurements justify it.
- SSO/OIDC, TLS, and non-public access to the Kargo UI/API.
- Separate least-privilege credentials for each controller's local ArgoCD/Kubernetes access. The central control plane must not have a multi-cluster administrator identity.

Kargo's availability affects release visibility and future promotion, but ArgoCD continues reconciling the already-committed desired state if Kargo is unavailable.

## Alternatives Considered

| Alternative | Decision |
| ----------- | -------- |
| Full Kargo installation in every environment | Rejected. It creates three isolated release histories and promotion systems. |
| Shared Kargo control plane in dev | Not selected for the initial rollout. It puts a platform service that will control production promotion in a non-production cluster. |
| One controller with administrator access to every EKS cluster | Rejected. It creates an unnecessary multi-cluster blast radius. |
| Dedicated management EKS cluster | Preferred future topology, deferred because no such cluster is currently planned. |
