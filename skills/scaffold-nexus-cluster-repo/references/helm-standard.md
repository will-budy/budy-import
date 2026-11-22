# Helm standard: umbrella + sub-charts + shared library charts

Source: context-cluster `charts/*`, dt-manager `charts/*`, and the library charts in `ob1-mn-github-helm-charts-repo-1` (`platform-helm-libs/charts/`). Measurements are from October 2026 checkouts.

## 1. Shape (already standard, keep)

- **One umbrella chart** `charts/<cluster>/`, `name: <cluster>-repo-1`, `version == appVersion`, `type: application`. It is the **only chart published** (to the cluster's single Helm ECR repo).
- **One sub-chart per component** under `charts/<component>/`, bundled into the umbrella as `file://../<component>` dependencies, each with `condition: <component>.enabled`. Sub-charts are never published independently.
- **Umbrella owns cluster-wide resources:** shared ConfigMaps, the Temporal namespace/connection/Nexus endpoint resources, global values.
- **Sub-chart owns the component's workload:** `WorkerDeployment`, ServiceAccount identity, component config, optional hooks.
- **Image values path per component** is declared in `components.json` (`chart_values_image_tag_path`, e.g. `."gateway-1".image.tag`) so the release workflow can write tags without per-repo scripts. Every path must exist in the umbrella `values.yaml` (CI validates).
- **Components consume Temporal via `WorkerDeployment` CRs** (`temporal.io/v1alpha1`) with a `global.workerDeployment` default rollout (Progressive ramp 10%/25%/50%) and deep-merged sunset settings; a component may override locally.
- **Version mapping:** `package.json` version = component version; image tag = `<component>-<version>-<sha7>` (immutable, written to `values.yaml` by `chart-release-pr`); umbrella chart `version` = `appVersion` (its own SemVer, bumped once per chart release, not equal to any component version); Worker Deployment **Build ID** = explicit `buildID`, else the image tag, so it carries the SHA. (Other cluster docs that say Build ID equals the component version mean the version part of that tag.)
- **Private dependency charts are resolved from ECR:** `helm registry login` (Makefile `helm-login`) locally; CI uses `validate-chart@v1` with the ECR OIDC identity. Build sub-chart dependencies **before** the umbrella; `charts/*/charts/` and `Chart.lock` are git-ignored.

### Umbrella contents

| File | Purpose |
| --- | --- |
| `Chart.yaml`, `values.yaml`, `CHANGELOG.md` | dependencies (the library and one entry per component), global + per-component values, generated release log |
| `templates/shared-config.yaml` | one line: `include "platform-app-cluster.sharedConfig"` (shared Temporal, container and task-queue ConfigMaps) |
| `templates/temporal-resources.yaml` | one line: `include "platform-app-cluster.temporalResources"` (Connection, TemporalNamespace, TemporalNexusEndpoint) |
| `templates/NOTES.txt` | post-install hints |

Clusters built on the standard use the library and carry none of these templates.

### Gateway sub-chart

`files/capabilities/*.yaml` (manifests), `templates/capabilities-configmap.yaml` and `worker-infrastructure.yaml` (one `include` each), and `worker-deployment.yaml` which builds the env (`CAPABILITIES_DIR`, the `STS_*` values from `.Values.sts`, plus `componentTaskQueueEnv`) and the capability volume and checksum annotation, then includes `workerDeployment`. The `sts` values default to the production auth cluster (`https://auth.budy.internal/sts`, the in-cluster JWKS URL, audience `urn:budy:nexus:<endpoint>:<Service>`); GitOps pins them in `base` and the audience per environment.

### Security-facing rules (from `scaffold-ob-application`; the chart must satisfy them)

- Every Pod template carries `budybot.io/netpol: <netpolPrefix>-<component>` (distinct, stable). The `platform-app-cluster` WorkerDeployment helper sets it from `global.cluster.netpolPrefix`; a value missing from the namespace's `BudyNetpolIdentity` allow-list in k8s-security is rejected at admission. (context-cluster and dt-manager still set it through GitOps `podLabels`.)
- Every Pod template lists consumed VSO destination Secrets and non-hot-reloaded ConfigMaps in `secret.reloader.stakater.com/reload` / `configmap.reloader.stakater.com/reload` (comma-separated exact names, on the **Pod template**, not the workload metadata). The library sets the ConfigMap annotation for the three shared ConfigMaps; add the Secret annotation through the helper's `podAnnotations` when a component consumes a Secret. The gateway's capability ConfigMap rolls through `checksum/capabilities` instead.
- Migration/admin Jobs use a separate ServiceAccount, Vault role and Secret from the runtime worker; hook ordering (SA → VaultAuth → VaultDynamicSecret → Job) is documented in context-cluster `AGENTS.md` §8. Never convert a ConfigMap the worker needs into a hook.

## 2. What is duplicated today (the case for a library)

| Evidence | context-cluster | dt-manager |
| --- | --- | --- |
| `_helpers.tpl` files | 11 charts, 539 lines | 5 charts, 313 lines |
| Helpers redefined per chart | `name`, `fullname`, `labels`, `selectorLabels`, `serviceAccountName`, `image`, `buildID` | same |
| Gateway vs k8scr-provider helpers, after renaming | 4 differing lines | — |
| `WorkerDeployment` templates | 12 across both repos (the context-cluster gateway's `deployment.yaml` alone is 202 lines) | |
| Worker identity / Vault transit / Vault agent wiring | identical 41-line `temporal-worker-infrastructure.yaml` shape per component | |

Only `platform-temporal-worker` is consumed by these two repos today (pinned to `0.1.6` in every `Chart.yaml`). `platform-common` and `platform-vso` exist but neither is used by them directly. New clusters use `platform-common` (names and base labels), `platform-app-cluster` and `platform-capability` (section 4).

## 3. Existing library charts (`ob1-mn-github-helm-charts-repo-1`)

| Library chart | Version | Provides |
| --- | --- | --- |
| `platform-common` | 0.1.1 | `name`, `fullname`, `chart`, `labels`, `selectorLabels`, `deployment`, `configmap`, `service`, `pdb`, `vaultAuth` (+ resolved values) |
| `platform-vso` | 0.1.1 | `vaultStaticSecret(List)`, `vaultDynamicSecret(List)` |
| `platform-temporal-worker` | 0.1.6 | `identity`, `vaultTransitAccess`, `vaultAgent.{configMap,annotations,podLabels,volumeMounts,volumes}`, `labels` |

Publishing: GitHub Actions workflow `release-charts.yaml` lints changed charts, packages, and pushes to ECR OCI (`ob1-helm-chart-repo-v1/helm-charts-repo-1/<chart>`), authenticating with the same AWS OIDC role as image builds. Consumers declare `repository: oci://745404749629.dkr.ecr.us-west-2.amazonaws.com/ob1-helm-chart-repo-v1/helm-charts-repo-1`. Library charts are *vendored into the consuming chart when it is packaged*, so ArgoCD at runtime needs access only to the published umbrella, not to the library registry.

Convention for helper includes: `include "<lib>.<helper>" (dict "root" . "values" .Values.<x>)`.

## 4. `platform-app-cluster` and `platform-capability` (built)

Two library charts published from `ob1-mn-github-helm-charts-repo-1` (`platform-helm-libs/charts/`, `platform-capability` 0.1.0, `platform-app-cluster` 0.2.0; each its own ECR repository `ob1-helm-chart-repo-v1/helm-charts-repo-1/<chart>`, declared in `budy-cloud-management`). A component's chart is values plus a few `include` lines.

- **`platform-app-cluster`** is generic: the conventions of an application cluster (the component and part-of labels and the netpol label; names and base labels come from `platform-common`, shared runtime ConfigMaps, task-queue config, the WorkerDeployment for any Temporal worker, worker identity and Vault resources, the Temporal Connection, Namespace and Nexus endpoint, the `global.enabled` switch). Nothing in it is specific to a gateway or to Nexus-first clusters, and it is not tied to one cluster.
- **`platform-capability`** is the small gateway-only part: the capability manifests ConfigMap, its rollout checksum and the task-queue override env. It uses `platform-app-cluster` helpers, so the gateway chart declares both. Only a chart that serves a capability registry (`go/capability`) needs it.

Declare `platform-common`, `platform-app-cluster` **and** `platform-temporal-worker` in each component chart (the Vault helpers come from the last; `platform-app-cluster` takes its names from `platform-common`, so there is one naming rule), `platform-capability` additionally in the gateway chart, and `platform-common` plus `platform-app-cluster` in the umbrella for the shared resources. `examples/app-cluster-consumer` in the helm charts repo is a CI-rendered example; `nainai-cluster-1` is the real reference.

Global values every chart in the cluster shares:

```yaml
global:
  enabled: true                       # false renders nothing: the release is empty
  cluster: {name: nainai-cluster-1, netpolPrefix: nainai}
  gatewayComponent: gateway-1         # the component the Nexus endpoint targets (default: gateway)
  components: [gateway-1]             # one <COMPONENT>_TASK_QUEUE key each
```

Derived names (never hand-written): Temporal namespace `ob1-temporal-<cluster>-ns-1`, Nexus endpoint `ob1-nexus-<cluster>-endpoint-1`, task queue `<cluster>-<component>-tq`, pod label `budybot.io/netpol: <netpolPrefix>-<component>`, connection `<cluster>-temporal-connection`.

| Helper (`platform-app-cluster.` unless stated) | Does |
| --- | --- |
| `…name / fullname / labels / selectorLabels / serviceAccountName / image / buildID` | the helpers every chart used to copy; `part-of` from `global.cluster.name` |
| `…workerDeployment` | the `WorkerDeployment`: rollout/sunset merge, connection and namespace, standard env (`SERVICE_NAME`, `SERVICE_ID`, `POD_UID`, `BUILD_ID`, `TASK_QUEUE` from the shared ConfigMap), shared-config mounts, `/services/health` probes, Temporal client-auth projected token, Vault Agent fragments, `budybot.io/netpol`, Reloader annotation, non-root with read-only root filesystem; extension points `env`, `volumes`, `volumeMounts`, `podAnnotations` |
| `…workerInfrastructure` | `TemporalWorkerIdentity`, `VaultTransitAccess`, Vault Agent ConfigMap (a plain ServiceAccount in local development) |
| `platform-capability.capabilitiesConfigMap`, `.capabilitiesChecksum`, `.capabilitiesConfigMapName` | gateway manifests as a ConfigMap and the `checksum/capabilities` value |
| `platform-capability.componentTaskQueueEnv` | gateway env so the shared task-queue ConfigMap decides component queues (`<COMPONENT>_TASK_QUEUE`, read by `capability.Registry.OverrideTaskQueuesFromEnv`) |
| `…sharedConfig` (umbrella) | `shared-temporal-config`, `container-config`, `shared-task-queue-config`; keys match `go/worker/standard` (`namespaces.TEMPORAL_NAMESPACE`, `container-config.config.*`) |
| `…temporalResources` (umbrella) | `Connection`, `TemporalNamespace`, `TemporalNexusEndpoint` with `create` flags |

Rules: the Nexus endpoint name is derived, not configurable, and `shared/contract` ties its constant to `global.cluster.name` with a test; every override point is a documented value; Sprig's `default true false` is `true`, so the library uses a `hasKey`-aware `flag` helper and an explicit `false` is honoured.

Versioning: SemVer in the library chart; consumers pin an **exact** version and bump deliberately, one PR per cluster. A breaking helper change is a new major. A library chart is vendored into the published umbrella when it is packaged, so Argo CD needs only the umbrella's registry. Build sub-chart dependencies before the umbrella (`make helm-deps`); `charts/*/charts/` and `Chart.lock` are git-ignored.

### Switching a chart off for an environment

`global.enabled: false` in an environment's values makes every library-rendered resource disappear; Argo CD keeps an empty release. The reference ships stage and prod this way (`values/env/stage-1.values.yaml`, `values/env/prod-2.values.yaml` in the GitOps repo). Because `env/*` is inside `charts/apps/<app>/`, enabling an environment is one PR to `main` that removes the override and travels through the Kargo train. An empty release passes the bake gates (their queries end in `or vector(0)` / `or vector(1)`).

## 5. Registry: ECR only (GHCR evaluated)

Library and application charts are published to ECR only. Each chart is its own ECR repository declared in `budy-cloud-management`; a new library chart needs its entry there before its first release.

GitHub Packages (GHCR) was spiked in October 2026 and not adopted. Publishing works (`helm registry login ghcr.io` with the job's `GITHUB_TOKEN` and `packages: write`, then `helm push`), and so does reading from the publishing repository. Reading from **another** repository's workflow fails with `403 denied` because a new package is private and linked only to its publisher. Access needs a per-package, per-consumer "Manage Actions access" grant that has no REST API and no Terraform resource, or a GitHub App token with `read:packages`. Either costs more than the ECR login the consumers already have, and tag immutability and retention would need a second governance setup. Revisit only if package access could be granted organisation-wide. (GHCR remains the image layer cache, a separate use.)

## 6. Chart CI checks (via `validate-chart@v1` plus repo scripts)

- Dependencies resolve; `helm lint`; `helm template` with CI-safe values for the base profile.
- `Chart.yaml` `version == appVersion`.
- Every `chart_values_image_tag_path` in `components.json` exists in the umbrella values.
- No sub-chart is configured for independent publication.
- Rendered Temporal/VSO/RBAC labels and references are consistent (names, task queues, ServiceAccounts, Secret references).
- Go constant `NexusEndpoint` equals the chart endpoint-name literal.
- Every Pod template has `budybot.io/netpol` and the Reloader annotations for declared Secrets/ConfigMaps.
