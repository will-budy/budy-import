# GitOps values and bring-up order for a new cluster

What a new cluster needs outside its own repository, and the order that works. Learned bringing up `nainai-cluster-1_repo-1`; the authoritative rules for the values live in the de-v2 repository's `AGENTS.md`, summarised here so an agent scaffolding a cluster sees them first.

## 1. Where a value goes in de-v2

Layers apply in this order, later wins: chart default, `base`, `profiles/<tier>`, `env/<instance>` (`charts/apps/<app>/values/`).

- Put a value in the **lowest layer where it is true for everything above it**.
- **Do not set what is already supplied**: the chart, the helm library (`logLevel` info, payload size threshold 256 KiB and maximum 50 MiB, `temporalClientAuth` off) or the platform (see 3). A value equal to the default hides the real differences between environments. The one exception is a safety setting that must not change silently with a chart release (prod `replicaCount: 2`): state it and say why in a comment.
- **base**: true everywhere (Temporal address, Vault Transit, STS issuer, JWKS URL and audience, payload-store region, Vault roles, the storage target name).
- **profile** (`dev`, `stage`, `prod`): true for a tier (log level, replicas, prod anti-affinity, and `global.enabled: false` for a tier that is not live yet).
- **env**: the last resort, rarely used: only what exists because a separate AWS account is involved (a bucket name ending in the account id, account ids, role or policy ARNs, an OIDC issuer).
- Never repeat a value across layers; never edit `values/default.values.yaml` or `targetRevision` of a Kargo-managed app (Kargo is the only writer).

## 2. Shipping a cluster switched off in stage and prod

Stage and prod ship with `global.enabled: false` **in the tier profile**, so the chart renders nothing and Argo CD keeps an empty release; the Kargo bake gates pass on an empty release. Enabling a tier is a PR to `main` that removes the block. The files under `charts/apps/<app>/` reach `release/stage` and `release/prod` by separate manual PRs.

## 3. What the platform already supplies

A worker chart's `TemporalWorkerIdentity` is a Crossplane XR (`ob1_tf_gh_crossplane-providers-mono_repo_1`, `packages/infra-xrd-package-1`). Its composition builds the IAM role, attaches the storage access policy and annotates the ServiceAccount for IRSA. Account id, OIDC provider and AWS provider config come from its EnvironmentConfig; bucket ARN, permissions boundary and access policy come from the cluster-scoped `TemporalExternalStorage` target (`ob1_mn_github_argocd_eks_stack`, `crossplane-packages/env/<instance>/temporal-s3-storage-1.yaml`). So app values never carry account ids, role ARNs or an OIDC issuer.

The app sets only `global.temporalWorkerS3Buckets: [{name: temporal-s3-storage-1}]` (base). The XR does **not** give a worker its bucket name: `EXTERNAL_PAYLOAD_STORAGE_BUCKET` is rendered from `global.externalPayloadStorage.bucket`, which is per AWS account and therefore one of the few legitimate `env` values. The region has no default (set `us-west-2` in base).

## 4. Order of the cross-repo steps

A step out of order fails or confuses a sync. Run in this order:

0. **Before the repository has content:** `github-infra` declares the repository; once it is applied, `budy-cloud-management` declares the ECR and Helm chart repositories (their entries carry the new repository's GitHub id, `Budybot@<org id>/<repo>@<repo id>`, so they follow the repository) together with the Kubernetes namespace; `argocd-critical-stack` allows the namespace as a project destination; `platform-actions` adds the repository to the sweeper allowlist. These are independent of steps 1 to 6 and can be batched across several new clusters, one PR per repository.

1. **k8s-security**: network policy, strict mTLS and the `BudyNetpolIdentity` allow-list, so default-deny does not block the first rollout. The cluster's own egress policy is not enough: the destinations enumerate their callers, so add the gateway's namespace and `budybot.io/netpol` identity to the Temporal frontend allow-list (`temporal-3-ns-1/ingress/temporal-cluster-3.allow-de-v2-services.yaml`, 7233 and 7243) and to the `sts-service` allow-list (`de-v2-auth-1-ns-1/ingress/sts-service.allow-platform-and-context.yaml`, 8080), or its calls are dropped at the destination. Add the Kargo token scope in the same PR (see 5).
2. **de-v2**: the app, its values and the `.github/kargo-managed-apps` entry. The dev Application reports "chart not found" until step 3; that is expected. This must precede step 3: the GitOps update of the release flow needs `charts/apps/<app>/app.yaml` and says so when it is missing.
3. **The app repository's chart PR** (`automation/chart-release/*`), which publishes the chart to ECR and opens the GitOps CHANGELOG PR. A chart version is never republished. If the GitOps update ran before the de-v2 app was on `main`, re-run that failed job once after merging it.
4. **de-v2 release branches** (`release/stage`, `release/prod`): the manual wiring PRs.
5. **kargo-config**: the release train overlay, only after the first chart exists in the registry (the Warehouse has nothing to discover otherwise, and an older chart left in ECR could be promoted). **Together with it, k8s-security**: add the Project to the `kargo.akuity.io/github-token-scopes` annotation in `v1/objects/scrt/vso-secrets/infra-1/manifests/kargo-shared-resources-ns-1/kargo-github-app.vss.yaml` (`"<app>": ["ob1_mn_gh_de-v2_gitops_repo_1"]`). A Project missing there gets no token and its Warehouse fails with `could not read Username for 'https://github.com'` when it clones de-v2.
6. **k8s-security**: the Kargo controller RBAC (the two lines staged commented-out), only after the train has created the Project namespace; a RoleBinding into a namespace that does not exist yet fails the sync.

## 5. Automation PRs that need a person

- The **sweeper** (platform-actions `release-pr-sweeper`) merges the chart PR and the GitOps CHANGELOG PR only for repositories listed in platform-actions `config/release-pr-sweeper.json`. A repository that is not listed gets both PRs opened and merged by hand. Add the repository to that file when a cluster is created.
- CI runs on the Release PR and the chart PR are created waiting for approval (confirmed with the owner) and show as failed with no jobs once the PR merges. They block nothing and cost nothing. There is no in-workflow way to skip them (the approval gate comes before any job), and opening the PR with `GITHUB_TOKEN` does not avoid them (the chart PR already uses it). Options if they must go: loosen the org or repo Actions approval policy, or have the sweeper delete the run after merging (needs Actions write on the release-automation App). See `provision-nexus-cluster` section 5.

## 6. First release checklist

- A root `package-lock.json` sits beside the root `package.json` `workspaces`.
- Every changeset names a catalog package exactly (`validate-changesets` checks on each PR).
- The cluster's chart version is not hand-bumped; a first image release produces the chart PR.
- After the Release PR merge: image tag `<component>-<version>-<sha7>` in ECR, `<component>/v<version>` git tag, contract module tag, then the chart PR; after the chart PR merge: chart in ECR and the GitOps CHANGELOG PR.
