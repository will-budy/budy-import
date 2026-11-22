# Repository: de-v2

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/de-v2`

## Ownership

This is the application GitOps repository for de-v2/thinking-mode application clusters such as Context Cluster, LLM Router, Auth Cluster, Communication Cluster, Sandbox Service, and DT Manager.

## Layout and release model

```text
charts/apps/<application>/
  app.yaml
  base.values.yaml
  dev.values.yaml
  stage.values.yaml
  prod.values.yaml
charts/profiles/{dev,stage,prod}/
.github/workflows/create-{stage,prod}-pr.yml
```

An `app.yaml` is a real ArgoCD `Application`. It uses two sources: the versioned OCI Helm chart in the central ECR account and this Git repository as `$values`. The chart `targetRevision` is immutable and promoted by PR.

## New application work

1. Add the app folder and ArgoCD `Application` using `apps-de-v2-services-acd-proj-1` or another confirmed de-v2 project.
2. Point the Helm source at the central `ecr-1` OCI registry and the values source at this repo.
3. Target the app's dedicated namespace.
4. Add deploy-time configuration to base/profile values, including Vault role/mount/path/destination settings consumed by generic chart VSO templates. Secret payloads and externally governed RBAC/network/Istio policy remain elsewhere.
5. Wire the app into the base/profile Kustomizations.
6. Verify dev first, then promote through the repository's stage/prod PR flow.

## Reference

`charts/apps/context-cluster-1/app.yaml` is the strongest current example of the OCI chart + Git values multi-source model.
