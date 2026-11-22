---
name: nainai-cluster-1
kind: service
description: Manages DT Dynamo Worker deployments - loads updates, starts and restarts workers, and coordinates transitions while older workflows are still running.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/nainai-cluster-1_repo-1
status: active
tags: [execution-mode, application-cluster, go, temporal, nexus, worker-deployment]
interfaces: [nexus]
runtime:
  language: go
  framework: temporal
  deployment: eks
links:
  design: []
  runbooks: []
  dashboards: []
  api_contracts: []
  builds: []
  release_candidates: []
---

# nainai-cluster-1

nainai-cluster-1 manages the deployments of DT Dynamo Workers. It loads updates, starts and restarts workers, and coordinates transitions while older workflows are still running on the previous version.

> **Status (17 November 2026):** the gateway is released; `operator-1`, the Crossplane provider that deploys DT Dynamo workers, is built and enabled in dev-1 (de-v2 `charts/apps/nainai-cluster-1`). Its design is in the repository's [`docs/operator-1.md`](https://github.com/Budybot/nainai-cluster-1_repo-1/blob/main/docs/operator-1.md); this page summarises it. The `deployer` component sketched below under *Proposed shape* is not built, and no deploy command is planned (see *How a worker is deployed*).
>
> **Proposal (20 November 2026):** nainai becomes the tenant provisioning system (owner of `UserOrg`, `DigitalTeammate` and Dynamo worker settings). Under discussion, not decided; the *Boundary* below is unchanged until it is. See [Tenant provisioning](tenant-provisioning.md).

## How a worker is deployed

A DT Dynamo worker deploys itself when CI pushes its image. Nothing calls nainai to deploy or roll back a worker.

```text
teammate's GitLab fork, protected default branch
  └─ CI build-image job ──▶ push dynamo-worker-<x.y.z>-<sha7> to <env account>/v1/dt-root-ns/v1/<org>/<dt>/dynamo-worker-<n>
ECR push event ──▶ EventBridge rule (environment account) ──▶ API destination ──▶ operator-1 /webhook/ecr   (5-minute poll as fallback)
operator-1 ──▶ reconcile DTDynamoDeployment ──▶ WorkerDeployment on the newest tag matching the template's pattern
temporal-worker-controller ──▶ the new version rolls out; running workflows finish on the version they started
```

| | |
| --- | --- |
| **Who chooses the image** | `operator-1`: the most recently pushed tag in the worker's own ECR repository that matches a regex. No tag is accepted as input (operator decision 8) |
| **How a push arrives** | ECR → EventBridge → HTTPS webhook on the operator, authenticated by a shared token whose SHA-256 the operator holds; a 5-minute poll catches missed events (decisions 9 and 10) |
| **Who creates the worker resource** | The `DigitalTeammate` Crossplane composition composes one `DynamoWorker` per worker, which creates the tenant ECR repository, the `DTDynamoDeployment` and the Temporal `Connection` |
| **What a publish does** | dt-consulting-services' [Mission registry](../dt-consulting-services-1/info.md) only *observes* which version runs (a to-do in its saga); it never asks nainai to deploy or roll back |
| **Outbound network** | `operator-1` sets the Janus outbound settings on every worker pod (`ClusterProviderConfig.spec.platform.janus`): `HTTPS_PROXY` to Janus's `outbound-gateway-1`, the `outbound-policy-1` worker API URL and a projected service-account token. A template cannot set or override them. Workers have no direct internet; they trust only the Janus roots baked into the worker image (see the [glossary](../../../ref/glossary.md#outbound-gateway)) |
| **Rolling back** | Push an earlier commit through the same pipeline (a revert merge in the fork) |

## Boundary (proposed)

| Owns | Does not own |
| --- | --- |
| The decision and sequencing of when a Dynamo Worker version starts, restarts and drains | The code or packages a worker runs (see gitjib-cluster-1) |
| Transition coordination while older workflows are still running | The Temporal server, Kubernetes cluster and Worker Controller |
| The cluster's Nexus contract for requesting deployments and reading transition state | Tenant lifecycle (`budy-platform-operator-1`) and DT provisioning (dt-manager-1) |

The "older workflows still running" requirement is exactly what Temporal Worker Deployment Versioning with Pinned behavior provides (executions finish on the version they started). Whether nainai drives that mechanism for Dynamo Workers or wraps it is an open question below.

## Proposed shape

| | |
| --- | --- |
| **Repository type** | Nexus-first: gateway + components (the reference instance of the standard) |
| **Gateway** | `gateway`: Nexus service `DeploymentServiceV1` (decided October 2026) with `DescribeCapabilities` |
| **First component** | `operator-1` (built; see *How a worker is deployed*). The `deployer` drafted here earlier, with verbs `loadUpdate`, `startWorker`, `restartWorker`, `getTransitionStatus`, is not built and no deploy command is planned: a push deploys. A read-only status capability may come later for the Mission registry's observe step |
| **Likely platform access** | Kubernetes API (namespaced RBAC) or the platform operator CRDs; decided in `k8s-security`, not in this repo |

Bootstrap target (gateway-only first pass): gateway container, empty capability registry, umbrella chart, CI green, one image published, dev smoke test (`DescribeCapabilities` through the Nexus endpoint, one denied-tenant call). Components, and the capability smoke test, follow one at a time. See the standard's definition of done.

## Names (derived from the standard)

| | |
| --- | --- |
| Kubernetes namespace | `ob1-tf-eks-de-v2-nainai-1-ns-1` |
| Nexus endpoint | `ob1-nexus-nainai-cluster-1-endpoint-1` |
| Task queues | `nainai-cluster-1-gateway-tq`, `nainai-cluster-1-deployer-tq` |
| Umbrella chart | `nainai-cluster-1-repo-1` |
| Image repository | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_nainai-cluster-1_repo-1` |
| Helm repository | `ob1-helm-chart-repo-v1/nainai-cluster-1-repo-1` |

## Callers and callees (assumed, unconfirmed)

- Callers: none for deployment (a push deploys). A read of a worker's current version may be added for the Mission registry's observe step.
- Update source: the worker's image, built by its GitLab fork's CI with credentials from gitjib's token broker.
- Callees: Kubernetes API or `budy-platform-operator-1` CRDs; Temporal for deployment state.

## Open questions

1. **Definition.** Answered (November 2026): a Dynamo worker is a Temporal worker, one per DT workbench, running deterministic workflows. See the [glossary](../dt-consulting-services-1/engagement-flow.md#glossary).
2. **Relationship to the platform operator.** `budy-platform-operator-1` reconciles `BudyWorkerPool` and `BudyWorker` per userOrg. Does nainai create or modify those, replace part of that behavior, or manage a different class of worker?
3. **Update source and trigger.** Answered (November 2026): an image tag pushed by the worker repository's CI; the ECR push event triggers the load (operator decisions 8 and 9). It is not a Nexus call: see *How a worker is deployed*.
4. **Who calls it.** Which services are Nexus callers, and what identity and tenancy do they present?
5. **Transition policy.** Rollout and sunset behavior per worker (ramp steps, scale-down and delete delays); where it is configured; who may override it.
6. **Failure and rollback.** What happens when a started worker fails readiness mid-transition; is rollback a new call or automatic?
7. **Kubernetes permissions.** Does it need cluster-scoped access, or only namespaced access in tenant namespaces? Needed before the `k8s-security` onboarding PR.

## Detailed Docs

| Name | Type | Link |
| --- | --- | --- |
| PRD / HLD / TRD / Nexus contracts | design | not written yet; use the wiki `service-design-docs` skill |
| Repository | source | `Budybot/nainai-cluster-1_repo-1` |
| Group index | index | [Execution Mode Services](../info.md) |
