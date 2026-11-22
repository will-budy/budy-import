---
name: karkhana-cluster-1
kind: service
description: Karkhana (workshop): the sandbox service. A Nexus gateway and a manager take requests into Postgres, and an operator runs each sandbox as a pod with a persistent workspace in the tenant's namespace.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/karkhana-cluster-1_repo-1
status: active
tags: [execution-mode, application-cluster, go, temporal, nexus, sandbox, operator, karkhana]
interfaces: [nexus]
runtime:
  language: go
  framework: temporal
  deployment: eks
links:
  design: [console.md]
  runbooks: []
  dashboards: []
  api_contracts: []
  builds: []
  release_candidates: []
---

# karkhana-cluster-1

karkhana-cluster-1 is the Karkhana cluster. *Karkhana* is the Hindi and Urdu word for a workshop or factory: the place where things are made, here the sandboxes Digital Teammates and platform services work in. A caller asks for a sandbox of a named type; Karkhana records the request, and an operator runs the sandbox as a pod with a persistent workspace in the tenant's own namespace, under its own identity.

The design, the contract and the data model are in [Sandboxes](sandboxes.md). The tenant console is in [Console](console.md).

> **Status: built, being brought up in dev (checked 2026-11-13 against each repository's `main`).** Released: the karkhana-cluster-1 chart 0.1.3 (gateway-1, `sandbox-manager-1`, console-1) and the operator chart `sandbox-service-1-repo-1` 0.3.6 (`sandbox-operator-1` 0.4.0, the first release of the new operator). Dev still pins karkhana-cluster-1 chart 0.1.1, so `sandbox-manager-1` is not promoted to dev yet; stage and prod have none of it switched on. Not done: GitLab access from sandboxes, the `sandbox-1` workload session kind (de-v2 #2414, open), an end-to-end test on a cluster. The list, with what each environment needs, is in [Sandboxes: Status](sandboxes.md#status).

## Boundary

| Owns | Does not own |
| --- | --- |
| The sandbox request API (Nexus capabilities), its authorization and limits | The sandbox images and the runner in them (`ob1_mn_gh_sandbox-shell-1_repo-1`) |
| Desired state, status, the event trail and usage records of every sandbox | Rating, credits and enforcement (Glassbox) |
| Running sandboxes: pods, workspaces and per-sandbox identities (the operator) | The catalog of sandbox types (platform-crs) and what each profile may reach (k8s-security) |
| | The workload sessions (authz-manager-1) and the `glassbox_id` claim (STS): the operator asks for the session, the manager records the claim |

## Shape

| | |
| --- | --- |
| **Repository type** | Nexus-first: gateway + components |
| **Gateway** | `gateway-1`: Nexus service `KarkhanaServiceV1`, `Execute` and `DescribeCapabilities` |
| **Components** | `sandbox-manager-1` (requests, limits, desired state; owns the migrations), `console-1` (the tenant console, a shell with an empty Sandboxes page) |
| **Chart** | `karkhana-cluster-1-repo-1` (umbrella, 0.1.3: sub-charts `gateway-1`, `sandbox-manager-1`, `console-1`), Argo CD app `karkhana-cluster-1-app`; images in `ob1-ecr-repo-v2/ob1_tf_aws_ecr_karkhana-cluster-1_repo-1`, tags prefixed by component |
| **Operator** | `sandbox-operator-1`, in `ob1_mn_gh_sandbox-service-1_repo-1`, released as its own chart (`sandbox-service-1-repo-1`, 0.3.6, image `ob1_tf_aws_ecr_sandbox-service-1_repo-1:sandbox-operator-1-<version>-<sha>`) and deployed by the cluster's supporting Argo CD project (app `sandbox-service-1-app`) into `ob1-tf-eks-de-v2-sandbox-1-ns-1`. It holds cluster-wide rights and the sandbox secrets, so it does not share a namespace with the console. The chart also carries the `SandboxType` CRD and the admission policy `sandbox-operator-1-fence`. |
| **Runner and images** | `sandbox-runner-1` and the image types (`claude-code-1`) in `ob1_mn_gh_sandbox-shell-1_repo-1`; image `ob1-ecr-repo-v2/ob1_tf_aws_ecr_sandbox-shell-1_repo-1:<type>-<version>` |
| **Database** | `ob1-karkhana-db-1`, one schema per service with its own roles; sandboxes use schema `sandbox` |
| **Custom resource** | `SandboxType` (`karkhana.budy/v1alpha1`, cluster-scoped); the first type, `claude-coder-1`, is deployed from platform-crs (`v1/stacks/de-v2-sandbox-type`) |
| **Release** | Kargo projects `karkhana-cluster-1` and `sandbox-service-1` (kargo-config `release-trains/de-v2`): dev, dev-bake, stage, stage-bake, prod, prod-verify, all auto-promoting |

## Names (derived from the standard)

| | |
| --- | --- |
| Kubernetes namespace | `ob1-tf-eks-de-v2-karkhana-1-ns-1` (ambient) |
| Nexus endpoint | `ob1-nexus-karkhana-cluster-1-endpoint-1` |
| Nexus service (decided by the owner, 2026-11-11) | `KarkhanaServiceV1` |
| Netpol labels | `karkhana-gateway-1`, `karkhana-sandbox-manager-1`, `karkhana-console-1`; the operator is `sandbox-operator-1`; sandbox pods carry their type's network profile, for example `sandbox-coder-1` (that value is reserved to pods labelled as the operator's) |
| Task queues | `karkhana-cluster-1-gateway-1-tq`, `karkhana-cluster-1-sandbox-manager-1-tq` |
| Database | `ob1-karkhana-db-1`, schema `sandbox`; roles `ob1-karkhana-db-1-sandbox-rw-role` (manager), `-sandbox-operator-rw-role` (operator), `-sandbox-ro-role` (readers) |
| Vault roles (database credentials, VSO) | manager `ob1_tf_vault_karkhana-sandbox-manager-1_role_1` (migration Job `..._job_role_1`), operator `ob1_tf_vault_sandbox-operator-1_role_1` |
| Vault Transit roles | `ob1_crossplane_vault_transit_karkhana_gateway_1`, `ob1_crossplane_vault_transit_karkhana_sandbox_manager_1` |
| Console host | `karkhana.<env>.orangebox.ai` (for example `karkhana.dev-1.orangebox.ai`), route id `karkhana-console-1` |
| Argo CD projects | `apps-karkhana-cluster-1-acd-proj-1`, `apps-karkhana-supporting-1-acd-proj-1` |
| Kargo Project / Argo app | `karkhana-cluster-1` / `karkhana-cluster-1-app` |

## Open questions

1. Which ambient metrics the Kargo bake gates can read (the existing PodMonitor targets Istio sidecars).
2. Archiving a paused workspace to a snapshot: the cluster has no snapshot controller.
