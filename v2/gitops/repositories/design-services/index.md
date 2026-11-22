# Repository: design-services

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/design-services`

## Ownership

This is the application GitOps repository for design/thinking-mode services. Its ArgoCD boundary is `apps-design-services-acd-proj-1` unless a more specific application project applies.

## New application work

1. Confirm the application belongs to design services rather than de-v2 or shared services.
2. Add the ArgoCD `Application` and values following the repository's existing Kustomization layout.
3. Use the central ECR OCI chart and a pinned chart revision.
4. Target the application's dedicated namespace and ensure the design-services AppProject allows it.
5. Keep RBAC/network/Istio policy in `k8s-security` and Vault policy in `vault-management-1`; supply application VSO role/mount/path/destination configuration through GitOps values.
6. Validate all profile overlays and use the stage/prod promotion PR workflows.

## Current state caution

The locally cloned repository is less populated than `de-v2`; use the current checked-in structure, not assumed paths copied from another group. If a consistent `charts/apps/<app>` convention is intended, confirm it before reorganizing existing resources.
