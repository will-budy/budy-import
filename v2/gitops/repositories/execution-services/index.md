# Repository: execution-services

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/execution-services`

## Ownership

This is the application GitOps repository for execution-system/muscle-memory services, including shared consultant workers, routing, database services, and supervisors.

## Layout

The repository contains `charts/apps`, profile overlays, explicit environment overlays for `dev-1`, `stage-1`, and `prod-2`, and stage/prod promotion workflows.

## New application work

1. Confirm the application is part of execution/muscle-memory mode.
2. Add its ArgoCD `Application`, pinned central OCI chart source, and base/profile values.
3. Target a dedicated Kubernetes namespace unless the platform owner explicitly approves a legacy/shared exception.
4. Use `apps-execution-services-acd-proj-1` or another confirmed execution project and extend destinations/resource kinds narrowly.
5. Keep RBAC, netpol/Cilium, and Istio resources in `k8s-security`. Supply Vault/VSO role, mount, path, and destination configuration through GitOps values to generic application-chart templates.
6. Build base, profile, and environment overlays and promote through dev → stage → prod PRs.

## Legacy caution

Some existing execution services share broader namespaces or older release conventions. They are evidence of current state, not permission for a new application to share a namespace.
