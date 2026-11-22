# Repository: argocd-critical-stack

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/argocd-critical-stack`

## Ownership

This repository bootstraps ArgoCD and owns AppProjects—the source, destination, and resource-kind access boundary for every ArgoCD application.

Application projects live at:

```text
v2/env/_base/bootstrap/projects/applications/
```

Current groups include de-v2 services/operators, design services, execution services, DT apps/success, operator services, and user-org apps.

## New application work

1. Select the existing project matching the application group.
2. Add the group GitOps source repo and central ECR Helm registry only if absent.
3. Add the dedicated application namespace to `destinations`.
4. Permit the regular application-owned namespaced resource groups/kinds required by the rendered chart, including Temporal and VSO resources where applicable.
5. Keep security resources out of the application project/chart; use the security deployment projects.
6. Add a new AppProject only when the trust/source/destination boundary is genuinely different.
7. Build the bootstrap Kustomization and verify the ArgoCD `Application` namespace is in `sourceNamespaces`.

## Guardrails

- An AppProject is a security boundary, not organizational decoration.
- Allow cluster-scoped resources only as individually named kinds; deny all other cluster-scoped resources.
- For namespaced resources, allow regular application-owned kinds and explicitly deny resources governed by `k8s-security`, including RBAC, NetworkPolicy/Cilium policy, Istio policy, and OPA/Gatekeeper policy.
- Existing broad whitelists are legacy evidence, not the template for new projects. Start from the application AppProject template when it is introduced; until then, enumerate the rendered chart's required kinds and review every expansion.
