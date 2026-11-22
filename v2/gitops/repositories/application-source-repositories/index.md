# Repository Type: Application Source Repository

Primary local references:

- `/Users/samaykohli/GitHub/aa-budy-OB1-micro-services/thinking-mode-services/aaa-de-v2/context-cluster-1`
- `/Users/samaykohli/GitHub/aa-budy-OB1-micro-services/thinking-mode-services/aaa-de-v2/llm-router-1`
- `/Users/samaykohli/GitHub/aa-budy-OB1-micro-services/shared-ref-packages/ob1_tf_gh_budy-common-modules-1_repo_1`

## Ownership

An application source repository owns business code, Go modules, contracts, Docker builds, application Helm charts, CI, versioning, and publishing images/charts into the `ecr-1` account. It owns application Temporal resources in its chart. It does not own AWS resources, Vault policy, Kubernetes security policy, or the ArgoCD application release.

## Standard cluster shape

```text
go.work
shared/
components/gateway/ or entrypoint/
components/
charts/<application>/
charts/<component>/
configs/
docs/
.github/workflows/
Dockerfile
```

Only one entrypoint exposes the application Nexus contract. Internal Temporal workers/pods use private task queues and are not externally addressable. Keep I/O in activities, contracts versioned, and workflows deterministic/idempotent.

## Private Go modules

Set `GOPRIVATE`/`GONOSUMDB` for the Budybot organization. Consume the versioned common modules `go/runtimeconfig` and `go/worker`. Generate a short-lived token with `GLOBAL_REFPACKAGE_APP_1_ID` and `GLOBAL_REFPACKAGE_APP_1_PEM`. Pass it to BuildKit as `--mount=type=secret,id=github_token`; use it only during dependency download/build and ensure it is absent from committed config, final layers, cache exports, and logs.

## Release responsibilities

Follow [Application Cluster CI/CD Standard](../../application-cicd-standard.md).

1. Test/lint each Go module and render/lint the umbrella chart.
2. Version components and build immutable component image tags.
3. Push every component image to the cluster's single ECR image repository using `<component>-<version>-<short-sha>` tags. Publish only the parent/umbrella chart to the cluster's single Helm ECR repository; local subcharts are bundled dependencies.
4. Open/trigger a PR that updates the pinned chart revision in the correct group GitOps repository.
5. Keep rollback possible by retaining immutable prior chart/image versions.

Use the shared workflow library at `Budybot/ob1_mn_github_platform-actions_repo_1` pinned to `@v1` for Go validation, image builds, Go module tags, chart publication, and the GitOps chart-version PR. Keep the caller workflow responsible for event triggers, component catalog, Changesets, release classification, and protected-environment approvals. GitHub fetches reusable workflow YAML through the organization Actions access setting; use the REF PACKAGE App only for private Go dependencies and the GitOps App only for the GitOps PR.

## Security boundary

The chart owns workloads, Services, ConfigMaps, application Temporal resources, and generic VaultAuth/VSO templates. Group GitOps values supply Vault roles, mounts, paths, destinations, and environment settings. RBAC, NetworkPolicy/Cilium, Istio, and OPA belong in `k8s-security`. Rendered names, labels, ports, ServiceAccounts, and Secret references form the cross-repository contract.

Put a distinct `budybot.io/netpol: <component>` label on every Pod template; new security policies select it as `budybot.io/netpol`/`k8s:budybot.io/netpol`, not through standard `app.kubernetes.io/*` labels or the legacy plain `app` label. The application onboarding PR must add every component/Job value to its namespace-scoped deny-mode `BudyNetpolIdentity` allow-list in `k8s-security`. Put Reloader annotations on the Pod template for every VSO destination Secret and every ConfigMap that the process cannot hot-reload:

```yaml
metadata:
  labels:
    budybot.io/netpol: file
  annotations:
    secret.reloader.stakater.com/reload: file-db-credentials
    configmap.reloader.stakater.com/reload: file-config
```

Use comma-separated resource names for multiple dependencies. Do not annotate only parent workload metadata: Reloader must see the Pod-template annotation.
