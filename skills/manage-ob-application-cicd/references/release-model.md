# OB application CI/CD release model

## Artifact inventory

| Artifact | Rule |
| --- | --- |
| Component images | One ECR repository per cluster; `<component>-<version>-<short-sha>` |
| Helm | One ECR Helm repository per cluster; parent chart only |
| Parent chart version | `version == appVersion` |
| Nexus contract | Go module tag uses `<module-dir>/v<version>` |
| Deployment | Artifact publication opens a GitOps PR; it does not deploy directly |

## Application release

```text
source PR
→ version-packages PR
→ changed-component matrix publish
→ changed Go-module/component tags
→ chart-release PR (image tags + chart/appVersion)
→ parent chart publish/tag
→ GitOps PR
```

## Chart-only release

```text
chart source PR
→ chart-release PR (chart/appVersion)
→ parent chart publish/tag
→ GitOps PR
```

## Current references

- Functional pipeline: `aa-budy-OB1-micro-services/thinking-mode-services/aaa-de-v2/context-cluster-1/.github/workflows`
- Larger component example: `aa-budy-OB1-micro-services/thinking-mode-services/aaa-de-v2/llm-router-1/.github/workflows`
- Matrix/reusable workflow example: `aa-budy-OB1-micro-services/shared-ref-packages/ob1_tf_gh_budy-common-modules-1_repo_1/.github/workflows`
- GitOps version update: Context Cluster `gitops_update_chart_version.yml`
- Shared reusable workflow library: `aa-budy-OB1-micro-services/shared-ref-packages/platform-actions_repo_1` (`validate-go-module.yml`, `build-image.yml`, `publish-go-module.yml`, `publish-chart.yml`, `gitops-update.yml`)

Pin the shared library to its moving major tag `@v1` (use `@v1.x.y` only to freeze a caller deliberately). Its private reusable workflow download uses organization Actions access; the REF PACKAGE App remains exclusively for private Go dependency/source access. The GitOps App is passed only to the GitOps update workflow.

## Automation branches

Use `automation/...`; never use ephemeral `release/...` branches.

## Variables and secrets

- `GLOBAL_REFPACKAGE_APP_1_ID` / `GLOBAL_REFPACKAGE_APP_1_PEM`
- `GLOBAL_GITOPS_APP_1_ID` / `GLOBAL_GITOPS_APP_1_PEM`
- `AWS_ECR_1`, `AWS_REGION_MAIN`
- `GLOBAL_VAR_AWS_ECR_IMAGE_BUILDER_2_ROLE_1_ARN`
- `GLOBAL_ECR_HELM_REPO_V1`
