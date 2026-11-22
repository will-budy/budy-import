# Repository: shared-services

Local clone: `/Users/samaykohli/GitHub/abb-gitops-repos/shared-services`

## Status

**Scaffolded.** GitHub infrastructure declares the private repository as `ob1_mn_github_shared-services_gitops_repo_1` in `github-infra/v1/stacks/repos/repos-gitops/v1/standard-repos-declare.tf`. The repository now contains the application/profile Kustomize roots and the stage/prod promotion workflows. Continue creating and configuring the remote only through GitHub infrastructure.

## Ownership

This is the application GitOps release repository for shared application clusters consumed by more than one of the thinking/design and execution/muscle-memory groups. It is not the home for shared infrastructure operators; those remain in `argocd-eks-stack`.

## Current scaffold

Start with the same application GitOps shape used by the group release repositories:

```text
charts/apps/<application>/
  app.yaml
  base.values.yaml
  dev.values.yaml
  stage.values.yaml
  prod.values.yaml
charts/profiles/{dev,stage,prod}/
.github/workflows/create-{stage,prod}-pr.yml
.github/workflows/release-branch-pr-guard_v1.yml
```

Each `app.yaml` is a multi-source ArgoCD `Application`: the immutable parent Helm chart from `ecr-1` plus this repository as `$values`. Keep Vault role/mount/path/destination and environment settings as non-secret values here; the application chart consumes them through generic VSO templates. Keep secret payloads, AWS resources, and security-owned RBAC/network/Istio/OPA policy out of this repository.

## New shared application work

1. Confirm that the service is genuinely shared across groups rather than owned by one group.
2. Extend or create the matching restrictive AppProject in `argocd-critical-stack`.
3. Add the dedicated application namespace and immutable OCI parent-chart source.
4. Add base/profile values and Kustomization wiring.
5. Add the app to `charts/apps/kustomization.yaml` and keep each profile Kustomization wiring the same application root.
6. Use the current bulk human dev → stage → prod approval path. The branch guard permits only `main` → `release/stage` and `release/stage` → `release/prod`. Adopt Kargo only when its rollout is implemented and approved.
