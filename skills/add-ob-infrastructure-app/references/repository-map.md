# Infrastructure application repository map

| Concern | Repository | Typical path |
| --- | --- | --- |
| GitHub repo, if needed | `abb-gitops-repos/github-infra` | `v1/stacks/repos/{repos-gitops,infra-repos,...}` |
| Namespace/AWS/ECR | `abb-gitops-repos/budy-cloud-management` | `v2/stacks/...`; ECR at `shared-infra/ecr/v1` |
| Vault policy/auth | `abb-gitops-repos/vault-management-1` | `v2/stacks/vault-cluster-2/infra-services/v1` or matching domain |
| Security | `abb-gitops-repos/k8s-security` | `v1/objects/{rbac,netpol,scrt,opa-policy}` |
| AppProject | `abb-gitops-repos/argocd-critical-stack` | `v2/env/_base/bootstrap/projects` |
| Infrastructure app | `abb-gitops-repos/argocd-eks-stack` | `v2/apps/<tier>/<category>/<app>` |

## Tier hints

- foundation: autoscaling, networking, gateway, RBAC, cluster mechanics;
- platform: data stores, messaging, Temporal, Vault, service mesh, shared runtime;
- observability: metrics, dashboards, logs, traces;
- governance: OPA/Gatekeeper and policy control.

Determine placement from current repo structure and ownership, not only the upstream product category.

## Terraform rule

Instantiate an existing module or use direct resources in a named `.tf` file. Introduce a custom module only when the same abstraction has at least three present or planned uses. When three direct implementations are about to gain a fourth, consolidate with Terraform `moved` blocks so resources are not recreated.
