# CI and release: catalog + thin callers of platform-actions `@v1`

The state machine (version-packages PR → chart-release PR → GitOps PR; each PR merge is the human gate) and artifact/tag rules are defined in `v2/gitops/application-cicd-standard.md` and the `manage-ob-application-cicd` skill. This file defines **what lives in the cluster repo** and how it calls the shared library.

## 1. Principle

- Every `uses:` of the platform library is pinned to **`@v1`** — the moving major tag (`@v1.x.y` only to freeze a caller on purpose; never copy library logic locally; never reference a branch). Third-party actions are pinned to a major or reviewed tag as in the existing repos (`actions/checkout@v7`, `actions/setup-go@v7`, …).
- For a Nexus-first cluster the repo owns **the component catalog and Changesets**; the library's **entry workflows** (`app-cluster-ci.yml`, `app-cluster-release.yml`) own every event flow: detect, validate, build, publish, release classification, chart-release PR, chart publish, GitOps PR, changelog and sweeper mechanics. (Other repo types still compose the building blocks themselves.)
- Adding a component must be a **catalog entry**, not workflow edits.

## 2. Component catalog (`.github/components.json`)

Single source of release metadata. Fields as consumed today by `detect-components@v1`, `chart-release-pr@v1` and `build-chart-release-entry`:

```jsonc
{
  "chart": {
    "name": "<cluster>-repo-1",          // umbrella chart name (= published chart)
    "path": "charts/<cluster>",
    "app_path": "<cluster>"              // GitOps app directory
  },
  "release": {
    "name": "<cluster>",                 // Release PR "Release: <name>", branch changeset-release/<name>
    "ecr_repository": "ob1-ecr-repo-v2/ob1_tf_aws_ecr_<cluster>_repo-1",
    "cache_image": "ghcr.io/budybot/<repo>-buildcache"   // GHCR layer cache; never an ECR :buildcache tag
  },
  "defaults": { "private_repositories": "<repo>\nob1_tf_gh_budy-common-modules-1_repo_1" },
  "components": [
    {
      "name": "gateway-1",               // unique; kebab-case, ends in -1; matches package.json "name"
      "path": "components/gateway-1",
      "package_json": "components/gateway-1/package.json",
      "publishes_image": true,
      "docker": {
        "context": ".",
        "dockerfile": "Dockerfile",
        "build_args": { "COMPONENT": "components/gateway-1", "BINARY_TARGET": "worker" }
      },
      "chart_values_image_tag_path": ".\"gateway-1\".image.tag",   // quote names with a hyphen
      "validation": { "kind": "go" },     // optional validation.private_repositories overrides defaults
      "depends_on": ["contract"]
    },
    {
      "name": "contract",                // public Nexus contract module (not an image)
      "path": "shared/contract",
      "package_json": "shared/contract/package.json",
      "publishes_image": false,
      "go_module": { "module_dir": "shared/contract", "module_import_path": "github.com/Budybot/<repo>/shared/contract" },
      "validation": { "kind": "go" }
    }
  ]
}
```

Rules the detector enforces: unique names; every `depends_on` names a declared component; Changeset package names must equal `package.json` `name`. A component is selected when its path changed, a Changeset changed in the range names it, or it is a transitive dependent of a selected component (e.g. changing `contract` revalidates `shared`, the gateway and every component).

Conventions:

- `depends_on: ["contract"]` for every Go component that imports the contract; add `shared` only if the repo has one (clusters usually do not: shared plumbing lives in `budy-common-modules`).
- Library/store modules: `publishes_image: false`.
- UI components: `validation.kind: "node"`, optional `validation.working_directory` (default: the component path) and `validation.node_version` (default `24.x`). `app-cluster-ci` runs `npm ci`, then `lint`, `typecheck`, `test` and `build` where the package declares them (`check-node`, part of `ci / ci-required`). The component needs a committed `package-lock.json`; private npm registries are not configured.
- `go_module` only for modules consumed by other repositories (the contract); `module_import_path` is required there, because the release flow tags the module and then builds it as an external consumer.
- An image component needs `chart_values_image_tag_path` (where `chart-release-pr` writes its tag) and `docker.build_args`; both flow into the matrices unchanged.
- `defaults.private_repositories` is inherited by every component unless overridden.

The catalog contract is implemented and tested in platform-actions (`build-cluster-matrices`, `resolve-cluster-release`); the matrix shaping that used to be ~120 lines of `jq` per repo is no longer in the repo.

## 3. Variables and secrets

Use the organization contract from `application-cicd-standard.md` §2 unchanged: `GLOBAL_REFPACKAGE_APP_1_ID/_PEM` (private Go modules only), `GLOBAL_GITOPS_APP_1_ID/_PEM` (GitOps PR only), `AWS_ECR_1`, `AWS_REGION_MAIN`, `GLOBAL_VAR_AWS_ECR_IMAGE_BUILDER_2_ROLE_1_ARN`, `GLOBAL_ECR_HELM_REPO_V1`; also `GLOBAL_VAR_AWS_ECR_IMAGE_READER_2_ROLE_1_ARN` (read-only chart dependency resolution in PR CI) and `GLOBAL_RELEASE_TRIGGER_APP_1_PEM` (release PR sweeper). Never reuse the REF PACKAGE App to fetch workflow YAML; organization Actions access does that.

Caller `permissions:` must cover what the called workflows need (they cannot elevate): `contents: read`, `pull-requests: write`, `actions: write` and `packages: read` for PR image validation; `id-token: write` for `validate-chart` and any AWS OIDC step; release-time image push additionally needs `packages: write` (GHCR cache). A permission miss shows as `startup_failure` with zero jobs — see platform-actions `docs/caller-standards.md`.

## 4. Workflow inventory (two thin callers)

| File | Trigger | Calls (`@v1`) |
| --- | --- | --- |
| `ci.yml` | PR to `main` (no `paths:` filter) | `app-cluster-ci.yml`: changeset gate and `validate-changesets` (package names against the catalog, bump levels, a lockfile beside the root workspaces, a `changeset:version` dry run), `validate-cluster-catalog` (chart name and version, package names, Go modules, Dockerfile and build context, the image-tag path in the chart values), `detect-components`, `build-cluster-matrices`, `validate-go-module.yml` (matrix), `build-image.yml` with `push: false` (matrix), `validate-chart`, aggregate `ci-required` |
| `release.yml` | push to `main`, `workflow_dispatch` | `app-cluster-release.yml`: Release PR; for the merge of that PR only: `resolve-release`, `resolve-cluster-release`, `build-image.yml` with `push: true`, `publish-go-module.yml`, standalone consumer build, digests and git tags, `chart-release-pr.yml`; `chart-release.yml` (publish + GitOps notes PR) **only** when CI's own chart PR (`automation/chart-release/*`) merged with a higher chart version (`resolve-chart-release`); a person's change to an existing chart gets that PR opened by `chart-only-release-pr` |

Both callers are about 10 lines plus the `permissions:` block. Templates: `templates/ci.yml`, `templates/release.yml`. The required status check on `main` is **`ci / ci-required`** (caller job `ci`, aggregate `ci-required`, `if: always()`, passes on `success|skipped`). Individual matrix job names may change without touching branch protection.

Shared properties:

- Runners via `runner_profile` only (`image` / `compute` / `light`); never legacy runner labels.
- Image CI: PR validate `push: false` (GHA cache); release `push: true` with GHCR `cache_image`; never `:buildcache` in ECR.
- **A chart is published only by CI.** Chart versions are immutable, so `chart-release` runs only for the merge of the automated chart PR with a higher `Chart.yaml` version (or a manual dispatch). A person's change to a chart, a hand-bumped version included, publishes nothing and gets the chart PR that bumps it; a chart that is new in a push publishes nothing until the first image release.
- The release flow publishes only for the merge of the Release PR, enforces the strict file set (`package.json`, `CHANGELOG.md`, `.changeset/**`) on it, never moves an existing tag, and opens the chart PR only after every image, module and tag step succeeded.
- `kargo_managed: true` (default): Kargo owns the chart version and `values/default.values.yaml` in the GitOps repo, so the GitOps PR carries only the CHANGELOG entry.
- Ephemeral branches use `automation/…` and `changeset-release/<name>`, never `release/…`.
- The chart PR and the GitOps CHANGELOG PR are merged by the sweeper only for repositories listed in platform-actions `config/release-pr-sweeper.json`; add a new cluster there, otherwise merge both by hand. CI runs on the Release PR and chart PR wait at `action_required` for an approval (observed, cause unconfirmed). See `references/gitops-and-bring-up.md` §5.

Escape hatches: a repo needing an extra job (a UI build, a consistency check) adds it to its own caller workflow beside the `uses:` job; a component kind the catalog cannot express yet is a platform-actions change, not a local fork of the entry workflow.

## 5. Templates

- `templates/components.json` — catalog skeleton: chart, release, defaults, contract, gateway, one component.
- `templates/ci.yml`, `templates/release.yml` — the two callers.

## 6. Reference and tests

The reference instance is `nainai-cluster-1_repo-1`; its catalog and callers are the canonical examples, and platform-actions tests (`tests/test-build-cluster-matrices.sh`, `tests/test-resolve-cluster-release.sh`) cover the logic. See `docs/workflows/app-cluster-ci.md` and `app-cluster-release.md` in platform-actions for inputs, outputs and required caller permissions (`contents`, `pull-requests`, `id-token`, `packages` for release; plus `actions: write` for CI).

## 7. Checklist for a new cluster's CI

- [ ] `.github/components.json` valid; every `chart_values_image_tag_path` exists in umbrella `values.yaml`.
- [ ] Every `uses:` of platform-actions ends in `@v1`.
- [ ] No local copy of any CI/CD logic; the two callers are the only workflow files; no `ci_helper`; no `runner_label`.
- [ ] Caller `permissions:` cover each called workflow.
- [ ] `ci / ci-required` is the required check.
- [ ] Changeset package names equal `package.json` names (CI's `validate-changesets` enforces it) and a lockfile sits beside the root `workspaces`.
- [x] Release approvals: no per-release environments; the human gate is the PR merge, Kargo gates promotion, the sweeper merges automation PRs (`application-cicd-standard.md` §7).
- [ ] PR descriptions use `[release N/M]` titles with Prerequisites / Next approval / Reviewer action / Rollback (generated by the library workflows).
