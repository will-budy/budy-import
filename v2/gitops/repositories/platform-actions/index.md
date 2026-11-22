# Repository: platform-actions

Local clone: `/Users/samaykohli/GitHub/aa-budy-OB1-micro-services/shared-ref-packages/platform-actions_repo_1`

## Status and ownership

**Scaffolded.** `github-infra` declares the private repository as `ob1_mn_github_platform-actions_repo_1` in `v1/stacks/repos/infra-repos/v1/standard-repos-declare.tf`. Its companion Terraform resource sets the repository's GitHub Actions reusable-workflow access level to `organization`.

The remote was created through GitHub infrastructure and has a first reusable-workflow library. Continue managing repository settings through GitHub infrastructure rather than the GitHub UI.

## What belongs here

- Proven reusable workflows under `.github/workflows/` with `on: workflow_call`.
- Tested composite actions with `action.yml` when a reusable unit is step-level rather than job-level.
- Versioned workflow release notes, contract tests, and minimal examples.

Keep application-specific event triggers, component catalogs, release metadata, deployment values, and application secrets in each caller repository. Keep the workflow library free of secrets: callers supply narrowly scoped permissions and secrets through `workflow_call` inputs/secrets.

## Access and authentication

Call a reusable workflow by immutable reference, for example:

```yaml
jobs:
  validate:
    uses: Budybot/ob1_mn_github_platform-actions_repo_1/.github/workflows/validate-go-module.yml@v1
    permissions:
      contents: read
```

GitHub Actions supplies a scoped, short-lived token for the private reusable-workflow download when the repository is accessible to the organization. Do not use `GLOBAL_REFPACKAGE_APP_1_ID` or `GLOBAL_REFPACKAGE_APP_1_PEM` for this purpose; those remain for private Go dependency/source access. Add a separate GitHub App only when a workflow needs an explicit GitHub API capability beyond the caller's `GITHUB_TOKEN`, and scope its installation and permissions to that operation.

## Current workflow library

```text
.github/workflows/
  validate-go-module.yml
  build-image.yml
  publish-go-module.yml
  publish-chart.yml
  gitops-update.yml
actions/
  detect-components/action.yml
  generate-chart-changelog/action.yml
  setup-private-go/action.yml
  validate-chart/action.yml
  verify-immutable-artifact/action.yml
docs/
  workflow-contracts.md
```

`validate-go-module.yml` accepts the REF PACKAGE App credentials only for private Go dependency resolution. `build-image.yml` uses caller-supplied AWS OIDC configuration and pushes only when `push: true`. `publish-go-module.yml` creates/verifies Go module tags, `publish-chart.yml` checks `version == appVersion` before OCI publication, and `gitops-update.yml` uses the separate GitOps App to create or update the chart-version PR.

The supporting composite actions are intentionally limited to stable step-level work: private Go setup, component detection, chart validation, immutable Git/ECR artifact verification, and chart-only diff changelog generation. The reusable Go validation workflow enables monorepo-safe caching by hashing all `**/go.sum` and `**/go.work.sum` files by default. Dependabot proposes weekly action dependency updates; review those PRs before merging.

Start by moving only behavior proven in two or three application repositories. Release the library with semver tags plus a moving major tag (`v1`). Callers pin to `@v1` and receive compatible fixes automatically; a breaking contract change ships as a new major (`v2`) that callers adopt deliberately, and `@v1.x.y` is available when a caller must freeze. See [Application Cluster CI/CD Standard](../../application-cicd-standard.md) for caller state-machine boundaries and [workflow contracts](https://github.com/Budybot/ob1_mn_github_platform-actions_repo_1/blob/main/docs/workflow-contracts.md) for the library API.
