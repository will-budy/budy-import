---
name: manage-ob-application-cicd
description: Design, implement, review, or debug CI/CD for a multi-component OB/Budy application cluster using Changesets, selective GitHub Actions matrices, reusable workflows, protected release approvals, one shared component-image ECR repository, one parent-chart ECR repository, Go Nexus contract module tags, component/chart tags for Kargo, and automated GitOps version PRs. Use for application release pipelines, chart-only releases, image/tag publication, release branch problems, inefficient repeated component jobs, Kargo artifact discovery, or CI/CD failures in Context Cluster-style repositories.
---

# Manage OB Application CI/CD

Build an efficient, rerun-safe release state machine for a self-contained application cluster. Expect one Nexus Go contract module, one published parent chart, and 5–7 component images.

## Read first

1. Read `references/release-model.md` completely.
2. Read `../../v2/gitops/application-cicd-standard.md` completely.
3. Read `../../v2/gitops/scaffolding-an-application-repo.md` when adding CI/CD to a new cluster.
4. Inspect the current repository's `AGENTS.md`, `.changeset/config.json`, component `package.json` files, parent `Chart.yaml`, Dockerfile, and every workflow.
5. Use Context Cluster as the functional reference and the cloned common Go modules repo as the dynamic-matrix/reusable-workflow reference.

Do not change release semantics merely to make YAML shorter. Preserve artifact names, version history, and GitOps handoff unless the user explicitly authorizes a migration.

## Confirm the component catalog

Create or verify a single machine-readable catalog such as `.github/components.json`. Each releasable unit records:

- component name and source path;
- Changesets package/package.json;
- Docker target/component selector;
- parent-chart image values path;
- whether it publishes an image;
- whether it is a Go module/Nexus contract and its module directory;
- optional test/lint/integration commands.

Keep the parent chart path/name in the same catalog. Reject duplicated component lists spread across detector, build, tag, chart-update, and summary steps.

## PR workflow

Implement one detection job and matrix fan-out:

1. Diff from the PR merge base.
2. Map changed paths and Changesets to catalog components.
3. Emit JSON matrices for changed components and Go modules.
4. Validate only selected components; workflow/catalog changes select all.
5. Use matrix jobs calling reusable workflows for repeated component validation.
6. Build images with `push: false` using the production Dockerfile/target/platform.
7. Resolve private modules using the REF PACKAGE GitHub App token as BuildKit secret `github_token`.
8. Lint/render the parent chart once after matrix jobs.
9. Expose one stable aggregate required check, for example `ci-required`.

Use `fail-fast: false` for PR matrices and a sensible `max-parallel`.

## Required global variables/secrets

Use and validate:

- variable `GLOBAL_REFPACKAGE_APP_1_ID`;
- secret `GLOBAL_REFPACKAGE_APP_1_PEM`;
- variable `GLOBAL_GITOPS_APP_1_ID`;
- secret `GLOBAL_GITOPS_APP_1_PEM`;
- variables `AWS_ECR_1`, `AWS_REGION_MAIN`;
- variable `GLOBAL_VAR_AWS_ECR_IMAGE_BUILDER_2_ROLE_1_ARN`;
- variable `GLOBAL_ECR_HELM_REPO_V1`.

Use OIDC for AWS. Never persist the GitHub App token in Docker layers, cache, build args, environment variables, or logs.

## Release classification

Classify every main merge before acting:

- ordinary app merge with Changesets → create/update version-packages PR;
- version-packages PR merge → application release path;
- ordinary chart-only merge → create/update chart-release PR;
- chart-release PR merge → chart publication path;
- generated metadata/tag commit → stop without opening another release PR.

Use explicit labels/markers and allowed-file validation. Do not rely only on commit messages.

## Application release path

1. Create/update the version-packages PR from Changesets.
2. Its merge is the human gate; publication then runs from `main`.
3. Detect packages whose versions changed/Changesets were consumed.
4. Matrix build/push only those component images to the cluster's single image repo.
5. Tag changed Nexus contract Go modules using `<module-directory>/v<version>`.
6. Create immutable component Git tags/releases after image digest verification.
7. Aggregate image outputs in one job; update chart image values once.
8. Increment parent chart `version` and `appVersion` together to the same SemVer.
9. Open/update a chart-release PR on `automation/chart-release/<chart>`.
10. After the chart-release PR merges (the human gate), publication runs.
11. Publish only the parent chart, create/verify the chart tag/release, then open/update the GitOps chart-version PR.

A component without a consumed Changeset is not rebuilt or republished.

## Chart-only release path

1. Validate and merge the human chart change.
2. Create/update one chart-release PR that increments `version` and `appVersion` together.
3. After merge (the human gate), publication runs.
4. Publish only the parent chart and its immutable tag/release.
5. Open/update the GitOps chart-version PR.

Do not run image/module publication for chart-only changes.

## Branches

Never use `release/` for ephemeral automation branches. Those names can match protected long-lived release rules and resist automatic deletion.

Use:

- `automation/version-packages`;
- `automation/chart-release/<chart>`;
- `automation/gitops-chart-bump/<application>`.

Update an existing automation PR instead of opening duplicates.

## Artifact and tag invariants

- One container image ECR repository per cluster.
- Component image tag: `<component>-<version>-<short-sha>`.
- One Helm ECR repository per cluster, containing only the parent chart.
- Parent chart `version == appVersion`.
- Nexus Go module tag: `<relative-module-directory>/v<version>`.
- Component Git tag: use the repository's confirmed stable prefix and version.
- Parent chart tag: `charts/<parent>/v<version>` or the confirmed repository convention.
- Never overwrite or move an existing image/Git/chart tag.

For Kargo, create one image subscription per component with an anchored component-tag filter. Prefixed image tags are not pure SemVer; use a compatible immutable-build strategy (normally `NewestBuild`) and small discovery limits. Use the parent chart SemVer as the aggregate release signal.

## Matrix and reusable workflow design

Prefer thin event workflows plus the shared workflow library:

- `Budybot/ob1_mn_github_platform-actions_repo_1/.github/workflows/validate-go-module.yml` for per-module validation;
- `Budybot/ob1_mn_github_platform-actions_repo_1/.github/workflows/build-image.yml` for per-component image builds;
- `Budybot/ob1_mn_github_platform-actions_repo_1/.github/workflows/publish-go-module.yml` for Go module tags;
- `Budybot/ob1_mn_github_platform-actions_repo_1/.github/workflows/publish-chart.yml` for parent-chart publication;
- `Budybot/ob1_mn_github_platform-actions_repo_1/.github/workflows/gitops-update.yml` for the GitOps chart-version PR.

Call each shared workflow pinned to `@v1` (the library's moving major tag; `@v1.x.y` only to freeze a caller deliberately). GitHub obtains the private reusable workflow through the organization Actions access setting; do not use the REF PACKAGE App to retrieve workflow YAML. Pass the REF PACKAGE App only to Go validation/build steps that need private modules, and pass the GitOps App only to the GitOps update call. Have one detector emit the matrix. Have one aggregation job update chart values after the image matrix; never let parallel component jobs edit/push the same branch.

Use least-privilege job permissions. Be careful with concurrency: caller and reusable workflow must not use the same canceling group. Cancel stale PR runs, but do not cancel an in-progress artifact publication.

## Rerun safety

Before creating anything:

- verify existing image tag digest;
- verify existing Git tag commit;
- verify existing chart version metadata;
- find/update an existing automation PR;
- fail on mismatch rather than force/move/overwrite.

Publication does not deploy. The GitOps PR is the deployment handoff.

## Reviewer PR handoff

Make the release queue obvious to a human reviewer. Title every generated or human release PR `[release N/M] <application>: <state>` and include `Prerequisites`, `Next approval`, `Reviewer action`, and `Rollback/hold point` in its body. `Next approval` must name the next PR (repository and link). If the workflow will create that PR later, name the workflow and triggering condition, then update the prior PR with the link immediately after creation.

For chart-only releases the queue is the chart-release PR, then the GitOps PR. For application releases it is the version-packages PR, the chart-release PR, then the GitOps PR. Keep the same release number across repositories and state explicitly that only changed matrix components are being published.

## Diagnose in state-machine order

When debugging, identify the failed transition:

1. PR detection/validation;
2. Changeset/version-packages PR;
3. application approval;
4. component matrix image/module publication;
5. chart-release PR/image-tag aggregation/version equality;
6. chart approval/publication/tag;
7. GitOps PR;
8. Kargo discovery/promotion.

Check event payload, PR identity/labels, detected matrix, environment approval, permissions, artifact existence, tags/digests, concurrency cancellation, and downstream outputs. Diagnose only when asked to diagnose; implement fixes only when authorized.

## Validate changes

- Parse every workflow YAML.
- Exercise detector fixtures: no change, one image, multiple images, contract only, chart only, workflow/catalog change, release PR merge, rerun.
- Confirm PR builds use `push: false` and release builds use only selected matrix entries.
- Confirm private dependencies resolve without credential residue.
- Confirm chart `version == appVersion` and all catalog values paths exist.
- Confirm Go module tag prefixes match module directories.
- Confirm no ephemeral branch begins `release/`.
- Confirm environment approvals guard only publication jobs.
- Confirm GitOps PR targets the correct app/chart/version.
- Confirm Kargo filters cannot select another component's image tags.

## Deliver

Report the release state diagram, component catalog, workflow/reusable-workflow changes, permissions/approvals, branch names, artifact/tag invariants, test results, migration risks, and open decisions. Clearly separate the target standard from current behavior if implementation is phased.
