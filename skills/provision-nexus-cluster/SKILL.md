---
name: provision-nexus-cluster
description: Provision a NEW Nexus-first execution-mode cluster end to end, from "create the GitHub repository" to "gateway pod Healthy in dev": every shared repository to touch (github-infra, budy-cloud-management, argocd-critical-stack, platform-actions, k8s-security, kargo-config, de-v2 on three branches, the wiki), exact files and what to copy from, the merge order that works, how to scaffold the cluster repo, the first-release traps, and what only a person can verify in the cluster. Use when asked to onboard, add or bootstrap a new *-cluster-1 repository (worked examples: nainai, gitjib, pitcrew, dt-consulting-services, events, janus, studio-services), to batch several clusters at once, or to rename a cluster's Nexus service. For the repository's internal standard use scaffold-nexus-cluster-repo; for the release state machine use manage-ob-application-cicd.
---

# Provision a Nexus-first cluster, end to end

This is the ordered runbook that took `janus-cluster-1` and `studio-services-cluster-1` from nothing to a published chart and a GitOps app in one session (after nainai and four siblings before them). The repository internals are `scaffold-nexus-cluster-repo`; the GitOps value layering and the bring-up detail are its `references/gitops-and-bring-up.md`. This file is the checklist that ties them together. Gateway-only first: components are added later, one at a time.

## 0. Decide the names first (cheap now, costly after release)

Pick the **cluster** (`<short>-cluster-1`, or `<short>-1` for `dt-consulting-services-1`) and derive everything from it:

| Thing | Value (`<cluster>` / `<short>`) |
| --- | --- |
| Repository | `<cluster>_repo-1` (no `ob1_mn_gh_` prefix for new repos) |
| github-infra stack key | `<cluster>-repo-1` |
| Kubernetes namespace | `ob1-tf-eks-de-v2-<short>-1-ns-1` (Terraform key `de_v2_<short_underscored>_1`) |
| Nexus endpoint | `ob1-nexus-<cluster>-endpoint-1` |
| Nexus service | `<Domain>ServiceV1`; **the owner confirms it before the first release** (it is the contract constant and the STS audience `urn:budy:nexus:<endpoint>:<Service>`) |
| Gateway task queue | `<cluster>-gateway-1-tq` |
| Netpol identity | `budybot.io/netpol: <short>-gateway-1` |
| Vault Transit role | `ob1_crossplane_vault_transit_<short_underscored>_gateway_1` |
| Umbrella chart | `<cluster>-repo-1` (ECR key `ob1_tf_aws_ecr_<cluster>_repo-1`) |
| Kargo Project / Argo app | `<cluster>` / `<cluster>-app` |

Changing the service name **after** a release costs a release: the contract constant and test, the gateway chart's default audience, README/AGENTS (a changeset), the de-v2 `base.values.yaml` audience on `main`, `release/stage` and `release/prod`, and the wiki doc.

## 1. Shared-repository PRs (one per repo, batch several clusters)

Branch each from the repo's `main`; open as drafts. Copy the **latest sibling's** entry and rename.

| Order | Repository | Change |
| --- | --- | --- |
| 1 | `ob1_mn_gh_github-infra_repo-1` | `v1/stacks/repos/repos-applications/execution-mode/v1/standard-repos-declare.tf`: one entry per repo (name, description). Merge, then wait for `Terraform Prod` to apply: the repos exist afterwards. Read the plan: it may also show in-place updates to existing repos (module-default drift). |
| 2 | `ob1-budy-cloud-management` | `v2/stacks/shared-infra/k8s/v1/namespaces.tf` (namespace, labels `insert-trust-bundle` and `platform.budy.bot/stack: de-v2-services`) can go now. `v2/stacks/shared-infra/ecr/v1/locals.tf` (image repo + `helm_chart_repo_name`) needs `github_repo = "Budybot@168699076/<repo>@<repo id>"`: the id exists only after step 1 applied (read it from the GitHub API). So the ECR entry is a second PR. Both must be applied before the first release publishes. |
| 3 | `ob1_mn_gh_argocd-critical-stack_repo_1` | `v2/env/_base/bootstrap/projects/applications/de-v2-services.project.yaml`: add the namespace as a destination. |
| 3 | `ob1_mn_github_platform-actions_repo_1` | `config/release-pr-sweeper.json`: add `Budybot/<repo>`. **No changeset** (the sweeper runs from `main`; see that repo's `AGENTS.md`). Merge before the first release or the chart PR is merged by hand. |
| 4 | `ob1_mn_github_k8s-security_gitops_repo_1` | Copy the latest sibling's `netpol/manifests/de-v2-<short>-1-ns-1/` and `opa-policy/.../additional-policy-by-ns/de-v2-<short>-1-ns-1/`, add both to their `kustomization.yaml`; add the gateway to the **Temporal frontend** and **sts-service** ingress allow-lists (the destinations enumerate callers); add the Project to `kargo-github-app.vss.yaml` token scopes; add the RBAC files for `kargo-projects-1` **commented out** in its `kustomization.yaml`. Check with `kustomize build` of `netpol/manifests`, the OPA dir and `kargo-projects-1`. |
| 5 | `ob1_mn_gh_de-v2_gitops_repo_1` | `charts/apps/<cluster>/` (app.yaml, `values/base`, `profiles/{dev,stage,prod}`, `env/{dev-1,stage-1,prod-2}`, `default.values.yaml` with an empty image tag, a header-only `CHANGELOG.md`) plus the wiring: `charts/apps/kustomization.yaml`, the three `charts/profiles/*/kustomization.yaml`, the three `charts/env/*/kustomization.yaml`, `.github/kargo-managed-apps`. **Three PRs**: `main`, `release/stage`, `release/prod` (the app dir and tier wiring copied to each). `app.yaml` `targetRevision` is the first chart version (`0.1.1`). Stage and prod ship `global.enabled: false` in the tier profile. Must merge **before** the first chart PR (see 3). |
| 6 | `ob1_mn_github_kargo-config_gitops_repo_1` | `v1/prod-2/release-trains/de-v2/<cluster>/kustomization.yaml` (copy a sibling, change the five params) and the line in `de-v2/kustomization.yaml`. Check with `tests/render.sh` (needs `kustomize`). Merge after the first chart exists in ECR if you can; harmless earlier. |
| 7 | k8s-security (follow-up) | Uncomment the RBAC entries only once the Kargo Project namespace exists (the trains have synced). A RoleBinding into a missing namespace fails the sync. |
| any | `ob1_mn_gh_ob-platform-wiki_repo_1` | `v2/micro-services/execution-mode-services/<cluster>/info.md` (proposals are labelled as proposals), the group `info.md` (tables), `mkdocs.yml`, and the service-name line in `scaffold-nexus-cluster-repo/SKILL.md` (decided vs pending). |

## 2. The cluster repository (after step 1 applied)

1. Attach the new repo to the session, clone it **one at a time, shallow**, then register it. The repo holds only a README.
2. Start from the **pre-release** tree of the newest sibling's bootstrap commit (not its current `main`, which carries release versions and CHANGELOGs), copy it in, rename (`sed` the sibling's short and cluster names, the service name, the Vault role underscores), rename `charts/<sibling>` and the changeset file, then rewrite the README "What it does / Planned architecture / Current state" and the AGENTS.md "What it is" for the new cluster (brief only; label anything beyond the brief as proposed).
3. Keep: umbrella chart at `0.1.0` (the first release produces `0.1.1`), versions `0.0.0`/`0.1.0` as in the sibling bootstrap, the changeset (`contract`, `gateway-1`: minor), the committed root `package-lock.json`, library pins as the sibling (`go/capability`, `go/worker`, `go/runtimeconfig`, `platform-*` charts).
4. `make build test vet` locally. `helm lint/template` need ECR credentials for the chart dependencies; without them rely on the chart publish job's own lint.
5. Open the PR as the first change; merging it opens the Release PR automatically.

## 3. First release, in order

1. Merge the scaffold PR → CI opens `Release: <cluster>` (`changeset-release/<cluster>`).
2. Merge the Release PR → images pushed, module and git tags, chart PR `automation/chart-release/<cluster>` opened; the sweeper merges it (if listed).
3. Chart PR merge → chart `<cluster>-repo-1` `0.1.1` published to ECR, then `chart-release / gitops / update` opens the de-v2 CHANGELOG PR (sweeper merges it). **If the de-v2 app was not on `main` yet, this job fails** (the update needs `charts/apps/<cluster>/app.yaml`): merge the de-v2 app, then **re-run the failed job once**.
4. Kargo discovers the chart, promotes to dev; Argo CD syncs the app into the namespace.

Merging the Release PR before ECR (step 2 of section 1) is applied, or before the sweeper allowlist is merged, makes the publish fail or leaves the chart PR to merge by hand.

## 4. What only a person can verify

An agent session cannot see Argo CD, Kargo or the cluster. Hand these to the owner: the Terraform applies (github-infra, cloud-management); the Kargo Project, Warehouse and the promotion to dev; the RBAC Argo app; the Argo app `<cluster>-app`; the `gateway-1` pod Healthy; then the smoke test (STS token for the audience, `DescribeCapabilities` through the endpoint, one denied-tenant call). The service-name rename, if any, goes through the same release again.

## 5. Known behaviors (not bugs to fix per cluster)

- **Red zero-job CI runs on the bot-opened Release PR and chart PR.** The `pull_request` run is created waiting for approval and is marked failed when the PR merges. It blocks nothing. No in-workflow skip exists (the gate precedes every job). Options: loosen the org/repo Actions approval policy (security decision for the org owner), or have the sweeper delete the run (needs Actions write on the release-automation App). Opening PRs with `GITHUB_TOKEN` does **not** help: the chart PR already does.
- **Review-bot findings seen on these PRs, to get right the first time:** gateway not in the Temporal and sts-service ingress allow-lists; Kargo RBAC enabled before the Project namespace exists; undecided names written under "Decisions taken"; bootstrap steps that demand a worker component when the first pass is gateway-only.
- `kustomize` is the available tool for local checks; `helm dependency update` fails without ECR credentials.

## 6. Agent-session notes

- A new repo is added with `add_repo` (access `push`), cloned shallow **one at a time**, then `register_repo_root`; the git proxy rejects concurrent clones.
- `git fetch origin <branch>` does not create `refs/remotes/origin/<branch>` in these clones; use `git fetch origin +refs/heads/<b>:refs/remotes/origin/<b>`. A "branch has unpushed commits and no remote branch" warning from a stop hook is usually this: check `git ls-remote origin <branch>` against `git rev-parse HEAD` before re-pushing.
- Subscribe to each PR; Codex reviews on "ready for review", so open as drafts and mark ready together when asked. Reply on a finding's thread, fix on the branch, never resolve a security thread yourself.
- Merging is the owner's call, including approved PRs.
