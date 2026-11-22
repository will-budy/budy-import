---
name: dt-consulting-services-1
kind: service
description: Turns a digital teammate's engagement (a PRD-like request) into a published, running workflow of its Dynamo worker - research, sandboxed coding, PR, release - with its own permissions and context, separate from DT Workbench.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/dt-consulting-services-1_repo-1
status: active
tags: [execution-mode, application-cluster, go, temporal, nexus, coding-agent, sandbox, console, engagements]
interfaces: [nexus]
runtime:
  language: go
  framework: temporal
  deployment: eks
links:
  design: [engagement-flow.md, console.md]
  runbooks: []
  dashboards: []
  api_contracts: []
  builds: []
  release_candidates: []
---

# dt-consulting-services-1

dt-consulting-services-1 separates coding from DT Workbench. A digital teammate submits an *engagement*, a PRD-like request to add or change a workflow of its Dynamo worker; the cluster researches and designs it, has the code written by a sandboxed coding agent, gets the PR reviewed and merged in the DT's worker repository, and sees the workflow through to published and running, with its own permissions and context.

> **Status: phase 0.1 built (November 2026), being brought up in dev-1.** DTs submit *engagements* (PRD-style requests to add or change a Dynamo-worker workflow); see [Engagement flow](engagement-flow.md) for the cross-cluster picture and [Console](console.md) for the tenant console. Service design: `docs/design/` in the repository.

## Boundary

| Owns | Does not own |
| --- | --- |
| Engagements: intake, the one-live-engagement rule, their state and lifecycle | The DT's conversations with its DT manager (communication cluster, workbench) |
| Turning an engagement into a published, running workflow of the DT's Dynamo worker | The worker repository hosting, CI and npm registry (gitjib-cluster-1); worker deployment (nainai-cluster-1) |
| The coding agent's work, through a `claude-coder-1` sandbox it requests from Karkhana as the coder service role (`svcrole-dtcs-coder-1`) | The sandbox runtime (Karkhana: [karkhana-cluster-1](../karkhana-cluster-1/sandboxes.md)) |
| The tenant console | Review decisions (DT reviewer in dt-manager-1, escalation to pitcrew) |

## Shape

| | |
| --- | --- |
| **Repository type** | Nexus-first: gateway + components, plus a Node console |
| **Gateway** | `gateway-1`: Nexus service `DTConsultingServiceV1`, `Execute` and `DescribeCapabilities` |
| **Components** | `engagement-manager-1` (built: `startEngagement`, `getEngagement`, `listEngagements`, `closeEngagement`; lifecycle workflow `EngagementWorkflowV1`), `delivery-lead-1` (built: sandboxed coding, merge request, CI watch), `release-qa-1` (built, off until tested: stub review, merge, image pipeline, publish), `console-1` (built: tenant console with engagements and the Mission registry), `mission-registry-1` (built: missions, `createPublication`, `getPublication`; the [Mission registry](mission-registry.md), own database) |
| **Database** | `ob1-dt-consulting-services-db-1` (standard three-role database); schema by engagement-manager-1's migration Job. The Mission registry has its own, `ob1-mission-registry-db-1` |
| **Authorization** | Start and close need `tenant:<t>#active_digital_teammate` (go/authz); the cluster model `engagement_1` is published through authz-config |

## Names (derived from the standard)

| | |
| --- | --- |
| Kubernetes namespace | `ob1-tf-eks-de-v2-dt-consulting-services-1-ns-1` (46 characters; valid) |
| Nexus endpoint | `ob1-nexus-dt-consulting-services-1-endpoint-1` |
| Task queues | `dt-consulting-services-1-gateway-1-tq`, `dt-consulting-services-1-<component>-1-tq` |
| Nexus service (decided) | `DTConsultingServiceV1` |
| Gateway component, task queue | `gateway-1`, `dt-consulting-services-1-gateway-1-tq` |
| Netpol label, Vault Transit role | `budybot.io/netpol: dt-consulting-services-gateway-1`, `ob1_crossplane_vault_transit_dt_consulting_services_gateway_1` |
| engagement-manager-1 | task queue `dt-consulting-services-1-engagement-manager-1-tq`, netpol `dt-consulting-services-engagement-manager-1`, Vault roles `ob1_tf_vault_dt-consulting-services-engagement-manager-1_role_1` (app) and `ob1_tf_vault_dt-consulting-services-engagement-manager-1-job_role_1` (migration) |
| mission-registry-1 | task queue `dt-consulting-services-1-mission-registry-1-tq`, netpol `dt-consulting-services-mission-registry-1`, Vault roles `ob1_tf_vault_dt-consulting-services-mission-registry-1_role_1` and `ob1_tf_vault_dt-consulting-services-mission-registry-1-job_role_1`, database `ob1-mission-registry-db-1` |
| console-1 | host `dtcs.<env>.orangebox.ai`, netpol `dt-consulting-services-console-1`, Vault role `ob1_tf_vault_dt-consulting-services-console-1_role_1` |
| Database | `ob1-dt-consulting-services-db-1` |
| Umbrella chart | `dt-consulting-services-1-repo-1` |
| Image repository | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_dt-consulting-services-1_repo-1` |
| Helm repository | `ob1-helm-chart-repo-v1/dt-consulting-services-1-repo-1` |

## Callers and callees

- Callers: the tenant console now; DTs through published skills and tools later.
- Callees: Postgres, OpenFGA (authorization); later the LLM router, gitjib (GitLab, npm), karkhana-cluster-1 (`KarkhanaServiceV1`: the coding sandbox), DT reviewer, nainai-cluster-1. See [Engagement flow](engagement-flow.md).

## Open questions

The design questions still open are in [Engagement flow](engagement-flow.md#open-cross-cluster-questions) (cross-cluster) and `docs/design/engagements.md` section 9 (service).

## Detailed Docs

| Name | Type | Link |
| --- | --- | --- |
| Engagement flow (platform context) | design | [engagement-flow.md](engagement-flow.md) |
| Console | design | [console.md](console.md) |
| Mission registry (what a published workflow is) | design | [mission-registry.md](mission-registry.md) |
| Service design docs | design | `docs/design/` in the service repository (engagements, console, phase 0 test plan, mission registry and its test plan) |
| Repository | source | `Budybot/dt-consulting-services-1_repo-1` |
| Group index | index | [Execution Mode Services](../info.md) |
