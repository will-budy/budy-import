# GitOps

|                  |                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **Document**     | GitOps Overview                                                                                    |
| **Version**      | 1.0                                                                                                |
| **Status**       | Living Document                                                                                    |
| **Audience**     | Anyone deploying, modifying, or operating anything on the EKS cluster via ArgoCD                   |
| **Purpose**      | Map of which repo does what, how they fit together, and where to go for the how-to.                |
| **Last Updated** | July 2026                                                                                          |

The platform is managed through a chain of Terraform, source, security, and ArgoCD repositories. Nothing gets `kubectl apply`'d by hand. Product applications and shared infrastructure applications follow different release paths but converge on the same namespace, Vault, security, AppProject, and ArgoCD controls.

This section documents that system: which repo owns which concern, the conventions each repo follows, and — most importantly — the full checklist for adding something new (a Helm-based operator, a new namespace, a new internal tool) without missing a step.

## Start Here

- **[Repository Guide](repositories/index.md)** — the source of truth and required changes for every repository in the platform chain.
- **[Repos & the App Model](repos-and-app-model.md)** — the two ArgoCD application models, AppProjects, and profile/environment layering.
- **[Adding a New Operator](adding-a-new-operator.md)** — the practical, ordered checklist. Read this before deploying anything new.
- **[Scaffolding an Application Repository](scaffolding-an-application-repo.md)** — the proposed end-to-end recipe for application monorepos, Temporal workers, Vault/VSO, GitOps, and Kubernetes security.
- **[Application Cluster CI/CD Standard](application-cicd-standard.md)** — validation, Changesets, matrix image/module releases, approvals, chart publication, tags, Kargo discovery, and GitOps PRs.
- **[Kargo Implementation Plan](kargo-implementation-plan.md)** — prod-2 control plane, environment controller shards, and visibility-first Temporal/Context rollout.
- **[Network Policy & mTLS](network-policy-and-mtls.md)** — the netpol/CiliumNetworkPolicy/PeerAuthentication conventions and why each namespace needs its own set.
- **[Kargo Promotion Design](kargo-promotion-design.md)** — the visibility-first rollout and the eventual automated release-train model across dev, stage, and prod.
- **[Kargo Topology Decision](kargo-topology-decision.md)** — why Kargo initially runs in prod and how its controllers remain scoped to independent clusters.

## The two deployment paths

| Workload type | Release definition | Source artifact | Supporting repositories |
| --- | --- | --- | --- |
| Product application cluster | `de-v2`, `design-services`, `execution-services`, or `shared-services` | Application-owned OCI Helm chart and images in `ecr-1` | `github-infra`, `budy-cloud-management`, `vault-management-1`, `k8s-security`, `argocd-critical-stack` |
| Shared infrastructure application/operator | `argocd-eks-stack` | Upstream Helm/git source or internally built artifact | `budy-cloud-management`, optional `vault-management-1`, `k8s-security`, `argocd-critical-stack` |

If you only remember one thing: no application is onboarded in only one repo. Follow the [application scaffolding guide](scaffolding-an-application-repo.md) or [infrastructure application checklist](adding-a-new-operator.md) end to end.
