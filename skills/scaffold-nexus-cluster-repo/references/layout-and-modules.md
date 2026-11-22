# Layout, modules, naming, build

Source of truth for repo shape. Derived from `context-cluster-1` and `dt-manager-1`; the reference instance is `nainai-cluster-1_repo-1`. Values quoted (Go 1.26.4, Temporal SDK 1.45, nexus sdk-go 0.6.0) are what those repos use in October 2026; the verified dependency set is `docs/design/08-research.md` in context-cluster — check it before bumping or adding a dependency.

## Standard tree

```text
README.md                    purpose, layout, how to build, links (see readme-template.md)
AGENTS.md                    agent/developer guide with the platform context (see agents-md-template.md)
go.work                      stitches every Go module for local dev
Makefile                     MODULES-driven build/test/lint/helm targets
Dockerfile                   one parameterized Dockerfile for every Go component
package.json                 private root; npm workspaces = every component; changeset scripts
package-lock.json            committed: changesets only sees the workspaces when it is next to the root package.json
.changeset/config.json       independent release cadence per component
.gitignore                   bin/, coverage, .gocache/, node_modules/, charts/*/charts/, charts/*/Chart.lock
shared/contract/             MODULE: public Nexus contract (constants, aliases of the shared envelope, capability payloads)
components/gateway-1/        MODULE: cmd/worker + internal/worker, about 100 lines of wiring over the shared kit
components/<name>-1/         MODULE per worker component: cmd/worker, internal/{workflow,activities,worker,capabilities}
charts/
  <cluster>/                 umbrella chart (the only published chart)
  gateway-1/                 sub-chart; files/capabilities/*.yaml
  <name>-1/                  sub-chart per worker component
configs/runtime/             runtime config manifests read by go/runtimeconfig (fixed paths; copy from the reference)
.github/{components.json,workflows/{ci,release}.yml}
docs/                        design, build records (optional)
```

There is **no `shared/` library module**: registry, gateway dispatch, STS auth, worker bootstrap and runtime config are modules in `budy-common-modules`. Add a repo-local shared module only for code two components of this cluster need and no other cluster would.

UI/BFF components (Node, for example context-cluster's `control-plane`) are components too: a catalog entry with `validation.kind: node`.

## Modules

- **One Go module per component** plus `shared/contract`. Build isolation and release cadence are independent; each component is **also** a changeset package (`package.json` with `private: true`, version only).
- **`go.work` and `replace` are both committed.** `go.work` serves local dev; per-module `go mod tidy` and CI cannot resolve unpublished sibling modules without a `replace` in each consumer's `go.mod` (`replace .../shared/contract => ../shared/contract`). Keep them in sync. Versions of `budy-common-modules` are ordinary pinned requirements; after bumping one run `make tidy`.
- **Tags for modules below the repo root are directory-prefixed** (`shared/contract/v1.4.0`). Only the public contract module is tagged for external consumption; components release as images.
- **Gateway never imports a component.** It routes by manifest data (`taskQueue`, `workflowType`).
- **Shared infrastructure that more than one *cluster* needs belongs in `budy-common-modules`**, never copied into a cluster (registry, STS auth, gateway dispatch, worker bootstrap and runtime config already live there; do not add another copy).
- **Private dependencies:** `GOPRIVATE=github.com/Budybot/*`, `GONOSUMDB` the same; CI generates a short-lived REF PACKAGE App token (`GLOBAL_REFPACKAGE_APP_1_ID` / `_PEM`) and passes it to BuildKit only as secret `github_token`.

## Naming (instantiate with the cluster name, e.g. `nainai-cluster-1`)

| Thing | Pattern | Example |
| --- | --- | --- |
| Source repo | `<cluster>_repo-1` | `nainai-cluster-1_repo-1` (no `ob1_mn_gh_` prefix for new repos) |
| Umbrella chart name | `<cluster>-repo-1` (the platform's `<repo>-repo-1` chart naming) | `nainai-cluster-1-repo-1` |
| Helm ECR repo | `ob1-helm-chart-repo-v1/<cluster>-repo-1` | |
| Image ECR repo | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_<cluster>_repo-1` | one repo, all components |
| Image tag | `<component>-<version>-<short-sha>` | `gateway-1-0.1.0-ab12cd3` |
| Kubernetes namespace | `ob1-tf-eks-de-v2-<short>-1-ns-1` (`<short>` = cluster name without its trailing `-cluster-<n>` or `-<n>`: `nainai-cluster-1` gives `nainai`, `dt-consulting-services-1` gives `dt-consulting-services`) | `ob1-tf-eks-de-v2-nainai-1-ns-1` |
| Nexus endpoint | `ob1-nexus-<cluster>-endpoint-1` | `ob1-nexus-nainai-cluster-1-endpoint-1` |
| Nexus service | `<Domain>ServiceV<N>` | `DeploymentServiceV1` |
| Task queue | `<cluster>-<component>-tq` | `nainai-cluster-1-gateway-1-tq` |
| Workflow type | `<Thing>WorkflowV<N>` | `DeployWorkflowV1` |
| Component name | kebab-case ending in `-1`, unique per cluster; a worker component's capability manifest uses the same name | `gateway-1` |
| GitOps app | `charts/apps/<cluster>/`, Application `<cluster>-app` | |
| Git tags | component `<component>/v<ver>`; module `<dir>/v<ver>`; chart `charts/<chart>/v<ver>` | |

The k8s namespace is created in `budy-cloud-management`; the endpoint name is a published contract and is **not value-configurable** (the Go constant and the chart helper must agree — add a CI check, see `ci-and-release.md`).

**The `-1` rule.** Every named platform entity ends in `-1` (owner decision): repo, cluster, each component and its chart, image prefix, task queue, netpol label, endpoint, namespace. It is a generation number, so a breaking redesign is `<name>-2` beside `<name>-1`. Things with their own version are exempt: the Nexus service (`<Domain>ServiceV<N>`), workflow types (`<Thing>WorkflowV<N>`) and the `shared/contract` module (its git tag). The umbrella chart keeps the platform's `<repo>-repo-1` name.

## Dockerfile (one for all Go components)

Copy the reference `Dockerfile` from `nainai-cluster-1_repo-1` (build args `COMPONENT` and `BINARY_TARGET`, default `worker`; only the modules this repo has). Required properties (each exists because of a past failure — do not simplify them away):

- `ARG COMPONENT` (required, fail fast if empty) and `ARG BINARY_TARGET=worker`; build context is the repo root.
- `GOWORK=off`, `GOFLAGS=-mod=readonly`, `CGO_ENABLED=0`, `GOTOOLCHAIN=local`; each module resolves through its own `replace` directives.
- Copy only `go.mod`/`go.sum` first (`shared`, `shared/contract`, then `${COMPONENT}`) so dependency download caches independently of source.
- Token handling: `RUN --mount=type=secret,id=github_token,required=false`; write the git `insteadOf` rule, run the command, then **delete `/root/.gitconfig` and clear `/go/pkg/mod/cache/vcs`** in the same layer — otherwise `cache-to mode=max` exports a live token into the build cache, and stale cached clones carry an expired token. Never `ARG`/`ENV` the token.
- Final stage `gcr.io/distroless/static:nonroot`, `USER 65532:65532`, `EXPOSE 3000`, `ENTRYPOINT ["/app/worker"]`, copy `configs/` in.
- Platform is always `linux/arm64`. Never push a `:buildcache` tag to ECR (immutable tags break releases); use the GHCR `cache_image` input of `build-image@v1`.

Because this file is long and security-sensitive, it is a candidate for platform hosting (see SKILL.md open decisions) rather than 12 hand-maintained copies.

## Makefile contract

Targets every cluster provides: `build test vet fmt tidy lint helm-login helm-deps helm-lint helm-template clean` (there is no `lint-capabilities`: manifest conformance is a Go test, `capabilitytest.Verify`). `MODULES` is the single list that drives loops; adding a component adds it there, to `go.work`, and to root `package.json` workspaces (then regenerate the committed `package-lock.json`). Local deployment (k3d script) is optional and lives in a git-ignored `local-dev/` in context-cluster today.

## Changesets and chart versions

- Every component (and `shared/contract`) is a changeset package; package names in `.changeset/*.md` must match `package.json` `name` exactly or Release PR automation fails.
- Code/image change: add a changeset; **never hand-bump the umbrella `Chart.yaml`** — `chart-release-pr` bumps it after images publish.
- Chart-only change (templates/values, no Go): merge it with the `no-changeset` label and **do not bump `Chart.yaml`**. The entry release workflow notices the unchanged version and its `chart-only-release-pr` job opens the chart PR that bumps the patch version and writes the chart diff as the CHANGELOG entry; merging that PR publishes the chart. (A change that does bump the version is published directly.) context-cluster today differs: its `AGENTS.md` and `release-charts.yaml` use a manual `Chart.yaml` bump plus the `no-changeset` label. New clusters should follow the wiki standard; reconcile context-cluster when it adopts the entry workflows.
- Docs/CI/test-only: label `no-changeset`.
- `updateInternalDependencies: "patch"`: bumping `shared` auto-bumps its consumers one patch.

## Conventions every component follows

- **Testable entrypoints, 90% coverage:** `cmd/<binary>/main.go` is process glue only (platform-mounted runtime config, pod identity, OS signals). Everything with logic lives in `internal/` and takes its dependencies as parameters (`worker.Run(ctx, getenv, reader, identity, runFunc)`), so tests assert the options handed to the worker runtime, the registrations and the failure paths without a Temporal server. Target at least 90% statement coverage for every non-`cmd` package, with tests that assert behaviour; remove unreachable code instead of testing it.
- **Tenant enforcement:** first line of every activity asserts `ComponentRequest.TenantID` equals the identity from the validated token; scope every operation to it; never trust anything but the validated token identity.
- **Determinism:** all I/O (DB, network, k8s, clock, randomness) in activities.
- **Idempotency:** activities tolerate retries; the gateway derives the child `WorkflowID` from `idempotencyKey` (or a request hash).
- **Schema honesty:** manifest JSON Schema must match what the activity accepts. Breaking a capability's schema = new capability name or new workflow type, never a silent change.
- **Versioned workflow type names**; executions finish on the version they started (Pinned).
- **Errors:** use `contract` canonical codes (`UNAUTHORIZED`, `INVALID_ARGUMENT`, `NOT_FOUND`, `ALREADY_EXISTS`, `PERMISSION_DENIED`, `FAILED_PRECONDITION`, `RESOURCE_EXHAUSTED`, `INTERNAL`, `UNAVAILABLE`); permanent failures are non-retryable.
- **Health:** `GET /services/health` on port 3000; liveness and readiness probes use it.
- **Verified deps only:** pin to the set in `docs/design/08-research.md`.
- **Logging:** stdlib `slog`.
