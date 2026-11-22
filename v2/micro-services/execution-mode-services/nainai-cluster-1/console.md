# nainai console

The admin and support UI for the DT Dynamo worker fleet that `operator-1` manages. It is the first
console built on the [Platform Console Standard](../../../ref/platform-console-standard.md); the runbook for
adding another is the wiki skill `scaffold-platform-console`.

Status (October 2026): deployed. A user signed in through the platform portal, opened the 9i page and saw the workers and their
deployment states. The Rollouts and Templates pages exist but have not been checked end to end.

## Purpose

Lets platform admins and support see, in one place, the worker deployments `operator-1` manages: which image each runs, which
build is current and which is the target, whether the resource is ready, and the Temporal worker controller's view of each rollout.

## Shape

| | |
| --- | --- |
| Component | `console-1` in `nainai-cluster-1_repo-1` (non-Nexus, Node component), image and chart released with the cluster |
| Scope | System scope only (`scope_type=platform` tokens). Its data sources use the pod's credentials, so a tenant token gets 403 |
| Hosts | `nainai.dev-1.orangebox.ai`, `nainai.stage-1.orangebox.ai`, `nainai.prod-2.orangebox.ai`. The same hosts carry the operator's public `/webhook/ecr` route, which is evaluated first (`group.order`); the UI route is behind the ALB's Google OIDC |
| Sign-in | Platform UI route `nainai-console-1` (app id = route id, resource = `https://nainai.<env>.orangebox.ai`), STS handoff redeemed by the console's service account |
| Data | `k8s` list adapters on `nainai.ob1.ai` `DTDynamoDeployment` and `DTWorkerTemplate`, `temporal.io` `WorkerDeployment`, and events. Views are projections that pick fields by name |
| Kubernetes access | ClusterRole `ob1-tf-eks-de-v2-nainai-1-ns-1-console-1`: `get`, `list` on those kinds and events; no secrets, no `pods/exec` |
| Session key | Vault KV `v1/de-v2/ob1-tf-eks-de-v2-nainai-1-ns-1/nainai-cluster-1-console-1/session`, key `sessionSecret`, synced by VSO |

## Pages

- **Fleet:** one row per worker (name, namespace, image tag, current and target build, ready reason, rollout state) with a detail
  panel for conditions and events.
- **Rollouts:** the Temporal worker controller's current and target version of each worker deployment.
- **Templates:** `DTWorkerTemplate` resources (cluster scoped).

Lists request up to 500 rows and say when they are cut. Paging with a continuation token is in `@budybot/console-kit` (0.2.0) and is
not adopted here yet.

## Where it is wired

| Repository | What |
| --- | --- |
| `nainai-cluster-1_repo-1` | `components/console-1`, `charts/console-1`, catalog entry |
| `budy-common-modules` | `@budybot/console-kit` |
| `vault-gitops` | role `ob1_tf_vault_nainai-console-1_role_1`, default KV policy |
| `k8s-security` | network policies, netpol identity, `ReferenceGrant`, gateway egress, `nainai-shared-vso-1` allowed namespaces |
| `argocd-critical-stack` | nainai AppProject cluster-resource whitelist |
| `argocd-eks-stack` | OIDC-protected Ingress and HTTPRoute |
| `de-v2` | STS redeemer policy, audiences, client resources; nainai app values |
| `de-v2` (`frontend-cluster-1` values) | `platform-ui-1` route (`routeDefaults` and per-environment `routes`) and form-action origin |

## Open items

- Adopt `usePagedList` from `console-kit` 0.2.0.
- Temporal versions panel and connector: not built; add Temporal credentials when Temporal authentication ships.
- The next phase is the console's own roadmap (the V2 build of the 9i controller UI), tracked separately.
