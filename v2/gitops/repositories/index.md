# GitOps Repository Guide

The platform is a chain of repositories rather than a single deployment repo. Use this section to find the source of truth for each concern before making a change.

| Repository | Owns | New application change? | New infrastructure app change? |
| --- | --- | --- | --- |
| [github-infra](github-infra/index.md) | GitHub organizations, repositories, teams, and repository controls | Yes | Yes, if a repo is needed |
| [platform-actions](platform-actions/index.md) | Shared reusable GitHub Actions workflows and composite actions | Consume for CI/CD | No |
| [budy-cloud-management](budy-cloud-management/index.md) | AWS resources, one image ECR repository per application cluster, EKS namespaces, and cloud infrastructure | Yes | Usually |
| [vault-management-1](vault-management-1/index.md) | Vault policies, auth roles, and secret-engine roles | When secrets/credentials are needed | When secrets/credentials are needed |
| [k8s-security](k8s-security/index.md) | RBAC, network policy, Cilium, Istio, OPA, and infrastructure VSO resources | Yes | Yes |
| [argocd-critical-stack](argocd-critical-stack/index.md) | ArgoCD AppProjects and bootstrap access boundaries | Yes | Yes |
| [argocd-eks-stack](argocd-eks-stack/index.md) | Shared infrastructure application definitions and configuration | No product app release | Yes |
| [de-v2](de-v2/index.md) | de-v2/thinking-mode application releases | When classified here | No |
| [design-services](design-services/index.md) | design/thinking-mode application releases | When classified here | No |
| [execution-services](execution-services/index.md) | execution/muscle-memory application releases | When classified here | No |
| [shared-services](shared-services/index.md) | shared application releases used by multiple groups | When classified here | No |
| [Application source repositories](application-source-repositories/index.md) | Go workers, charts, contracts, CI, images, and chart releases | Yes | Only for internally built infra apps |

## Terraform module rule

Use an existing module or direct resources in a purpose-named `.tf` file. Create a custom module only when the same abstraction is used at least three times. Do not add a one-use wrapper module merely for visual consistency.

## Application flow

```text
github-infra
  → budy-cloud-management (ECR + namespace/AWS dependencies)
  → vault-management-1
  → k8s-security
  → argocd-critical-stack
  → application source release to ecr-1
  → de-v2 | design-services | execution-services | shared-services
  → ArgoCD reconcile and promotion
```

## Infrastructure application flow

```text
upstream research
  → budy-cloud-management (namespace/AWS dependencies when needed)
  → vault-management-1 (when needed)
  → k8s-security
  → argocd-critical-stack
  → argocd-eks-stack
  → ArgoCD reconcile
```
