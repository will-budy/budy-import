# Application Cluster CI/CD Standard

|                  |                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Document**     | Application Cluster CI/CD Standard                                                                                |
| **Version**      | 0.1                                                                                                               |
| **Status**       | Draft target standard — current applications should converge incrementally                                       |
| **Audience**     | Application engineers, platform engineers, release approvers, and Kargo operators                                |
| **Purpose**      | Define efficient validation, versioning, image/module/chart release, GitOps update, tags, approvals, and rollback. |
| **Last Updated** | July 2026                                                                                                         |

This document standardizes CI/CD for self-contained application clusters containing approximately 6–10 releasable units: one Nexus Go contract module, one parent Helm chart, and normally 5–7 component images in a single application ECR image repository.

The current Context Cluster pipeline is the functional reference. The common Go modules repository is the structural reference for dynamic change detection, JSON matrices, and reusable validation/release workflows.

## 1. Artifact and version model

| Artifact | Count per application cluster | Version/tag rule | Registry/repository |
| --- | --- | --- | --- |
| Container image repository | Exactly one | All components share it | Application image ECR repo in `ecr-1` |
| Component image | One per deployable component | `<component>-<component-version>-<short-sha>` | Shared application image repo |
| Parent Helm chart | Exactly one published chart | `Chart.yaml` `version` and `appVersion` are identical | Application Helm ECR repo |
| Local Helm subchart | One per component where useful | Bundled into parent; not published independently | Application source repo |
| Nexus Go contract module | Normally one public contract module | SemVer plus module-directory-prefixed Git tag | Application Git repository |
| Component Git release tag | One per released image component | `<component>/v<component-version>` | Application Git repository |
| Parent chart Git tag | One per published chart | `charts/<parent-chart>/v<chart-version>` | Application Git repository |

Image tags and Git tags are immutable. Never move an existing tag to another commit or digest.

For Go modules below the repository root, Go requires the relative module directory to prefix the semantic version tag. A module at `shared/contract` version `v1.4.0` therefore uses `shared/contract/v1.4.0`. This is required for consumers to resolve the Nexus contract correctly, not merely a naming preference. See the [Go multi-module repository guidance](https://go.dev/doc/modules/managing-source#multiple-module-source).

## 2. Required GitHub variables and secrets

Use the Context Cluster names as the current organization contract.

| Name | Type | Used for |
| --- | --- | --- |
| `GLOBAL_REFPACKAGE_APP_1_ID` | Organization/repository variable | GitHub App client ID for private Go modules/contracts |
| `GLOBAL_REFPACKAGE_APP_1_PEM` | Organization/repository secret | GitHub App private key for private Go modules/contracts |
| `GLOBAL_GITOPS_APP_1_ID` | Organization/repository variable | GitHub App client ID for GitOps PRs |
| `GLOBAL_GITOPS_APP_1_PEM` | Organization/repository secret | GitHub App private key for GitOps PRs |
| `AWS_ECR_1` | Variable | Central ECR account ID |
| `AWS_REGION_MAIN` | Variable | ECR region |
| `GLOBAL_VAR_AWS_ECR_IMAGE_BUILDER_2_ROLE_1_ARN` | Variable | AWS OIDC role for image/chart publication |
| `GLOBAL_ECR_HELM_REPO_V1` | Variable | Helm OCI root/prefix; append the parent chart name |

Generate a short-lived token with `actions/create-github-app-token` from the REF PACKAGE App. Pass it into Docker only as BuildKit secret `github_token`. Consume it in `RUN --mount=type=secret,id=github_token`; never persist it through `ARG`, `ENV`, copied credential files, final image layers, logs, or exported cache.

## 3. Component manifest: one source of release metadata

Do not repeat component names and paths across every workflow. Keep a machine-readable component catalog in the application repository, for example `.github/components.json`:

```json
{
  "components": [
    {
      "name": "gateway",
      "path": "components/gateway",
      "packageFile": "components/gateway/package.json",
      "dockerTarget": "components/gateway",
      "imageValuesPath": ".gateway.image.tag",
      "goModule": false
    },
    {
      "name": "file",
      "path": "components/file",
      "packageFile": "components/file/package.json",
      "dockerTarget": "components/file",
      "imageValuesPath": ".\"file\".image.tag",
      "goModule": false
    },
    {
      "name": "nexus-contract",
      "path": "shared/contract",
      "packageFile": "shared/contract/package.json",
      "goModule": true,
      "publishImage": false
    }
  ],
  "parentChart": {
    "path": "charts/context-cluster",
    "name": "context-cluster-1-repo-1"
  }
}
```

A detector reads this catalog plus the PR/main diff and Changesets, then emits JSON matrices for validation, image publication, Go module tags, and chart-value updates. Adding component 8 should normally require one catalog entry—not edits to six workflow files.

## 4. Pull request validation

Every PR targeting `main` proves the eventual release is buildable before approval.

### Detect once

Create one `detect-changes` job that outputs:

- `changed_components`: component matrix selected by changed paths;
- `release_components`: components named by Changesets;
- `changed_go_modules` and `changed_contract_modules`;
- `chart_changed`: parent or local subchart/chart-library changes;
- `workflow_changed`: forces validation of all components;
- `requires_changeset`: application/module changes that need a version bump.

Use the PR merge base, not only the previous commit. Workflow/catalog changes validate all components because they can break the entire release mechanism.

### Validate selected components

Use a matrix job or a matrix calling a reusable workflow. Each selected component performs the checks relevant to it:

- private dependency resolution using the REF PACKAGE GitHub App;
- `go mod download`, build, vet/lint, unit tests, workflow replay/contract tests;
- Docker build with `push: false` and the real Dockerfile/target/platform;
- generated-code/schema consistency checks;
- changeset-to-component validation.

Validate the parent chart once after component jobs:

- Helm dependencies resolve;
- `helm lint` and `helm template` succeed with CI-safe values;
- all image values paths in the component catalog exist;
- `Chart.yaml` `version == appVersion`;
- no subchart is configured for independent publication;
- rendered Temporal/VSO/RBAC labels and references are internally consistent.

The required branch-protection check should be a stable aggregate job such as `ci-required`, which depends on detection, matrix validation, chart validation, and consistency checks. Individual matrix job names can evolve without constantly rewriting branch protection.

## 5. Release state machine

Release workflows run only from `main` or from temporary automation branches created by the workflow. Do not use `release/` in ephemeral branch names because those branches match protected long-lived release rules and may not be deleted after merge.

Use names such as:

- `automation/version-packages`;
- `automation/chart-release/<chart-name>`;
- `automation/gitops-chart-bump/<application>`.

### Application-code release

```text
Feature PR approved and merged
  → version-packages PR created/updated from Changesets
  → version-packages PR approved and merged
  → detect released components
  → matrix builds/pushes only released component images
  → publish only changed Nexus Go module tags/releases
  → create component Git tags/releases
  → chart-release PR updates released image tags
     and bumps parent chart version + appVersion together
  → chart-release PR approved and merged
  → publish parent chart + chart Git tag/release
  → create GitOps chart-version PR
  → GitOps PR approved and merged
```

Publication runs from `main` after the version-packages / chart-release PR merges; that merge is the human gate. A component that has no consumed Changeset is not rebuilt or republished.

### Chart-only release

```text
Chart PR approved and merged
  → chart-release PR generates a Git-style chart-file changelog
     and bumps parent chart version + appVersion together
  → chart-release PR approved and merged
  → publish parent chart + chart Git tag/release
  → create GitOps chart-version PR
  → GitOps PR approved and merged
```

No component image or Go module is published. This path has one application-repository chart-release PR plus the GitOps PR.

### Avoid release loops

Classify the merge before acting:

- ordinary merge with Changesets → create/update version-packages PR;
- version-packages PR merge → application publication;
- ordinary chart-only merge → create/update chart-release PR;
- chart-release PR merge → chart publication and GitOps PR;
- workflow-generated metadata/tag commits → no new version PR.

Use explicit PR labels or a machine-readable release marker, plus changed-file validation, instead of guessing solely from commit-message text.

## 6. Efficient matrix architecture

Use three layers:

1. Thin event workflows: `pr-ci.yml`, `main-version.yml`, `publish-application.yml`, `publish-chart.yml`.
2. The organization shared library `Budybot/ob1_mn_github_platform-actions_repo_1`: `validate-go-module.yml`, `build-image.yml`, `publish-go-module.yml`, `publish-chart.yml`, and `gitops-update.yml`; retain a same-repository wrapper only when it expresses application-specific release state.
3. Component catalog and detector script/action that emit matrices.

GitHub supports a matrix job calling a reusable workflow. This is the right fit for 5–7 similar images: the top-level workflow remains readable, components run in parallel, and each receives explicit catalog inputs. Pin third-party actions to immutable SHAs or reviewed release tags, and pin the organization's platform-actions library to its moving major tag `@v1` (`@v1.x.y` only to freeze a caller deliberately). The organization setting lets GitHub fetch private reusable workflow YAML with its scoped ephemeral token; the REF PACKAGE App is only for private Go source/module access. Pass the GitOps App key only to the GitOps update call. [GitHub recommends reusable workflows to avoid duplication](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations).

For Go multi-module repositories, enable `actions/setup-go` cache with a `cache-dependency-path` covering every `**/go.sum` and `**/go.work.sum` file. Do not rely on the default root-only lookup, which produces warnings or stale cache keys when `go.mod` files are below the repository root. A module-specific override is allowed only when that module has no workspace or cross-module dependency input.

Recommended matrix controls:

- `fail-fast: false` on PR validation so all failing components are visible;
- `max-parallel` tuned to runner/ECR capacity;
- image publish matrix includes only consumed Changeset packages;
- separate contract-module and image matrices because tag semantics differ;
- one chart-update aggregation job after all image builds, because concurrent matrix jobs must not each edit the same values file/branch.

## 7. Approvals, concurrency, and permissions

There are no per-release approval environments. The human gate is merging the version-packages PR and the chart-release PR; promotion between environments is gated by Kargo bake checks; and the platform-actions release-PR sweeper auto-merges the automation PRs. The only protected GitHub Environment in the flow is `release-automation` (limited to `main`), which holds the sweeper's GitHub App key. GitOps write credentials remain isolated to the GitOps PR job/App.

GitHub environment jobs cannot access environment secrets until protection rules pass. Use least-privilege job-level permissions and OIDC for AWS rather than stored AWS keys. See [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

Concurrency:

- cancel stale PR CI for the same PR;
- serialize version-PR mutation per repository;
- serialize application publication per application cluster without canceling an in-progress publish;
- serialize chart publication per parent chart;
- serialize GitOps PR updates per application path.

Do not reuse the exact same concurrency group in caller and called reusable workflows; GitHub warns this can cancel the caller. [GitHub concurrency groups](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) allow `matrix` and `needs` contexts.

## 8. Tags and Kargo discovery

Create tags only after the artifact exists and its digest/version has been verified.

| Signal | Format | Consumer |
| --- | --- | --- |
| Component image | `<component>-<version>-<short-sha>` | Helm values and Kargo image subscription |
| Component Git tag | `<component>/v<version>` | Audit/release history |
| Nexus module Git tag | `<module-dir>/v<version>` | Other Go applications importing the contract |
| Parent chart version/tag | SemVer and `charts/<parent>/v<version>` | ArgoCD/Kargo chart subscription |

Because prefixed component image tags are not pure SemVer, Kargo configuration must use one image subscription per component with an anchored allow-regex and a strategy compatible with immutable build tags. Do not let one subscription select another component's tags from the shared image repository. The concrete Kargo strategy, regex, and discovery limit will be added during Kargo implementation in [Kargo Promotion Design](kargo-promotion-design.md).

The parent chart remains SemVer and is the preferred aggregate release signal after all selected component image tags are written into chart values.

## 9. Idempotency and rollback

Every publication job must be rerun-safe:

- if an image tag exists, verify it points to the expected digest or fail;
- if a Go/chart/component Git tag exists, verify its commit or fail;
- if a chart version exists, compare expected metadata and skip or fail safely;
- update an existing automation PR rather than opening duplicates;
- use immutable prior chart versions for rollback;
- never overwrite ECR tags or Git tags.

The GitOps PR is the deployment handoff. Publishing an artifact does not deploy it.

### Reviewer PR handoff

For every generated or human release PR, put the release sequence directly in the PR description. Use `[release N/M]` in the title and include `Prerequisites`, `Next approval`, `Reviewer action`, and `Rollback/hold point`. Name the precise next state: for example, `version-packages PR #12 in <application repo>`, `chart-release PR #123 in <application repo>`, or `GitOps PR #456 in <group GitOps repo>`. A reviewer should never need to infer whether to approve now, wait for a workflow, or move to another repository.

When the next PR does not yet exist, say which workflow creates it and the condition that triggers it; replace that text with its link as soon as it is opened. For a chart-only release this produces one application-repository chart-release PR followed by one GitOps PR. For an application release it produces the version-packages PR, the chart-release PR, then the GitOps PR, with only changed components in the matrix.

## 10. Target workflow inventory

| Workflow | Trigger | Responsibility |
| --- | --- | --- |
| `pr-ci.yml` | PR to `main` | Detect, matrix validate/build without push, chart render, aggregate required check |
| `main-version.yml` | Ordinary merge to `main` | Create/update version-packages PR or chart-release PR |
| `publish-application.yml` | Version-packages PR merge | Approval, matrix image/module publication, tags, then chart-release PR |
| `publish-chart.yml` | Chart-release PR merge | Approval, parent chart publication/tag/release, then GitOps PR |
| `reusable-validate-component.yml` | `workflow_call` | Validate one catalog component |
| `reusable-build-image.yml` | `workflow_call` | Build/push/verify one selected image |
| `reusable-publish-go-module.yml` | `workflow_call` | Test and tag/release one selected Go module |
| `gitops-update.yml` | `workflow_call` | Update pinned chart version and open/update GitOps PR |

The exact filenames may vary, but the state boundaries and responsibilities should remain recognizable.

## 11. Current reference gaps and adoption

Context Cluster currently proves the release mechanics but hand-wires gateway/file/k8scr/execution-system inputs and build jobs. Converging to this standard should first introduce the component catalog and detection matrix without changing artifact names or approval behavior, then replace repeated build jobs with reusable matrix calls.

Chart-only source changes do not require a Changeset. The chart-release workflow creates the patch version, derives a Git-style changelog from changed chart files, and opens the chart-release PR with that generated changelog. Component Git tags use `<component>/v<version>`.

The shared-workflow home is `ob1_mn_github_platform-actions_repo_1`, managed by `github-infra` and configured for organization-level reusable-workflow access. Kargo selection details belong in [Kargo Promotion Design](kargo-promotion-design.md), where they will be decided with the implementation.

### Recommendation: centralize only proven reusable workflows

Use the dedicated private Actions repository `ob1_mn_github_platform-actions_repo_1`, managed by `github-infra`. Keep caller-specific event workflows and the component catalog in each application repository; centralize only tested `workflow_call` workflows and composite actions. Release that library with semver tags plus a moving major tag, pin callers to `@v1`, grant organization access explicitly, and keep permissions/credentials scoped to the caller job. GitHub requires a private reusable-workflow repository to be explicitly accessible to its callers; sharing also makes its workflow logs indirectly visible to callers, so it must contain no secrets. See [GitHub's private workflow sharing guidance](https://docs.github.com/en/actions/how-tos/reuse-automations/share-across-private-repositories).

Do not use the REF PACKAGE GitHub App to retrieve reusable workflow YAML. GitHub Actions provides the caller runner a scoped, short-lived installation token when the called repository's Actions access level allows it. Retain the REF PACKAGE App only for private Go-module/source access. A separate GitHub App is needed only for explicit API automation outside `workflow_call`, such as a centrally owned cross-repository PR or release operation; grant it only the specific API permissions it needs.

## Primary references

- [GitHub reusable workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
- [GitHub workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [GitHub deployment environments and approvals](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Go multi-module source and tags](https://go.dev/doc/modules/managing-source#multiple-module-source)
- [Kargo Warehouses and image selection](https://docs.kargo.io/user-guide/how-to-guides/working-with-warehouses)
