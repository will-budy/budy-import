---
name: Execution Mode Services
kind: subsystem
description: Application clusters for the execution-mode group - DT worker deployment management, tenant workflow code hosting, the Agent Success control UI, the coding service, and event ingestion.
part_of_subsystem: platform
primary_owner: tbd
github_repo: tbd
status: active
tags: [execution-mode, application-cluster, go, temporal, nexus]
interfaces: []
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

# Execution Mode Services

Five application clusters provisioned together in October 2026. Their source repositories are declared in the `github-infra` stack `repos-applications/execution-mode/v1`; their ECR/Helm repositories and Kubernetes namespaces are declared in `budy-cloud-management`; their namespaces are allowed in the ArgoCD `apps-de-v2-services-acd-proj-1` project.

All five follow the repository standard in the wiki skill `scaffold-nexus-cluster-repo` (`skills/scaffold-nexus-cluster-repo/SKILL.md` at the wiki repository root): Go monorepos, the shared `platform-actions@v1` entry workflows, a component catalog, umbrella plus sub-charts on the `platform-app-cluster` library (plus `platform-capability` in the gateway), shared Go modules from `budy-common-modules`, and an `AGENTS.md` carrying the platform context.

**All five are the same Nexus type** (owner decision, October 2026): each has at least one Nexus **gateway** and one **worker component**, every gateway authenticates callers the same way (STS bearer token verified over HTTP against the auth cluster's JWKS endpoint), and every repo has the capability registry with dynamic routing and discovery. They may also contain non-Nexus components; those are catalog entries like any other. What differs is the contract, the components and the extra components:

| Cluster | Components (proposed) | Non-Nexus components (proposed) |
| --- | --- | --- |
| nainai-cluster-1 | `deployer` (read-only stub verb built) | none |
| dt-consulting-services-1 | `engagement-manager-1` (built), `delivery-lead-1`, `release-qa-1` (planned) | `console-1` (tenant console) |
| karkhana-cluster-1 | `sandbox-manager-1` (built, not yet promoted to dev at the time of writing: sandbox requests and desired state; the sandboxes are run by `sandbox-operator-1`, released as its own chart) | `console-1` (tenant console, built as a shell) |
| events-cluster-1 | one per watcher type | `webhook-ingress` (HTTP) |
| janus-cluster-1 | `connection-registry-1`, `vault-manager-1`, `publish-1` (tuple writer), `outbound-policy-1` (Envoy ext_authz decision point, gateway control plane and run-token API; outbound enforcement), `openfga-bootstrap-1`, `oauth-provider-1` | `intake-1` (HTTP, from connections-1), `console-1` (staff console), and, as separate de-v2 Applications, `outbound-gateway-1` (Envoy outbound gateway), `janus-vault-cluster-1`, `janus-openfga-1` and `janus-redis-1` (rate-limit counters) |
| studio-services-cluster-1 | `artifact-store-1` (implemented: docs and dashboards, versioning, sharing) | `artifact-web-1` (HTTP renderer for owners and shares) |
| pitcrew-cluster-1 | `ticket-engine-1` (built, in review: tickets and their SOP-driven workflow) | `console-1` (operator console, system scope, in review), `sql-exporter-1` (queue and time-limit metrics) |
| gitjib-cluster-1 | provisioning (groups, repos, registry scopes) | wrapper charts for GitLab and the npm registry |

`janus-cluster-1` and `studio-services-cluster-1` were provisioned afterwards, the same way and gateway-only first, from the same standard; both have since gained their components (see their own pages).

`karkhana-cluster-1` was added in November 2026, the same way and gateway-only first, from the same standard; it is not one of the original five, and its first component, `sandbox-manager-1`, is built and its operator is released (see its own page and [Karkhana sandboxes](karkhana-cluster-1/sandboxes.md)).

`nainai-cluster-1` is the **reference instance** of the standard and is built end to end; the other four are copied from it. Component lists for the other four are proposals drafted from their one-paragraph briefs, to be confirmed by the owner.

## Index

| Name | Kind | Description | Status | Link |
| --- | --- | --- | --- | --- |
| nainai-cluster-1 | service | Manages DT Dynamo Worker deployments: loads updates, starts and restarts workers, and coordinates transitions while older workflows are still running. | active | [nainai-cluster-1/info.md](nainai-cluster-1/info.md) |
| gitjib-cluster-1 | service | Hosts self-managed GitLab and a private npm registry for tenant-private and platform-shared workflow repos, approved dependencies and versioned packages. | active | [gitjib-cluster-1/info.md](gitjib-cluster-1/info.md) |
| pitcrew-cluster-1 | service | Agent Success's ticket and approval service: SOP-driven tickets for escalations, PR reviews, code feedback and content, skill and context approvals, worked from one operator console. Phase 1 built and in review. | active | [pitcrew-cluster-1/info.md](pitcrew-cluster-1/info.md) |
| dt-consulting-services-1 | service | Turns a digital teammate's engagement (a PRD-like request) into a published, running workflow of its Dynamo worker: research, sandboxed coding, PR, release. | active | [dt-consulting-services-1/info.md](dt-consulting-services-1/info.md) |
| karkhana-cluster-1 | service | Karkhana (workshop): the sandbox service. A gateway and a manager take requests into Postgres, and an operator runs each sandbox as a pod with a persistent workspace in the tenant's namespace. | proposed | [karkhana-cluster-1/info.md](karkhana-cluster-1/info.md) |
| events-cluster-1 | service | Routes incoming webhooks to published workflows and watches supported external events through polling. | active | [events-cluster-1/info.md](events-cluster-1/info.md) |
| janus-cluster-1 | service | Connection manager: manages connections and their secrets in a dedicated Vault, authorizes their use per workflow and activity, brokers them to DT Dynamo workers, and controls and rate-limits outbound calls. | active | [janus-cluster-1/info.md](janus-cluster-1/info.md) |
| studio-services-cluster-1 | service | Artifact management for Digital Teammates to collaborate with humans: stores, versions and shares the artifacts they produce and review together. | active | [studio-services-cluster-1/info.md](studio-services-cluster-1/info.md) |

## Databases

Each cluster has one standard three-role PostgreSQL database (roles `<database>-admin-role`, `-user-role`, `-read-role`), declared in the argocd-eks-stack inventory (see [PostgreSQL Database Provisioning](../../gitops/postgres-database-provisioning.md#standard-databases)). They exist in every environment and are empty until the owning cluster's migration Job runs.

| Cluster | Database |
| --- | --- |
| studio-services-cluster-1 | `ob1-studio-artifacts-db-1` |
| pitcrew-cluster-1 | `ob1-pitcrew-db-1` |
| dt-consulting-services-1 | `ob1-dt-consulting-services-db-1`, and `ob1-mission-registry-db-1` for the [Mission registry](dt-consulting-services-1/mission-registry.md) (kept separate so it can move) |
| karkhana-cluster-1 | `ob1-karkhana-db-1` |
| gitjib-cluster-1 | `ob1-gitjib-db-1` (control) and `ob1-gitjib-gitlab-db-1` (GitLab) |
| janus-cluster-1 | `ob1-janus-db-1` |
| nainai-cluster-1 | `ob1-nainai-db-1` |
| events-cluster-1 | none yet |

## Related Development

| Name | Type | Status | Link |
| --- | --- | --- | --- |
| Nexus-first cluster standard | skill | draft | `skills/scaffold-nexus-cluster-repo/SKILL.md` (wiki repository root) |
| Application Cluster CI/CD Standard | standard | draft | [application-cicd-standard.md](../../gitops/application-cicd-standard.md) |
| Agent Success Dashboards/Queues | build | draft | [builds/m2/prd.md](../../builds/m2/prd.md) |

## Cross-cluster questions (open)

1. **Who calls whom.** The five briefs imply flows (gitjib → nainai packages; events → published workflows, now defined by the [Mission registry](dt-consulting-services-1/mission-registry.md); dt-consulting → Karkhana sandboxes and PR hosts) that are not written down anywhere in the wiki. Each service doc lists its assumed callers and callees as open questions; resolve them together so contracts line up.
2. **Overlap with the platform operator.** `budy-platform-operator-1` already reconciles `BudyWorkerPool`/`BudyWorker` per userOrg. Decide whether nainai-cluster-1 drives those CRDs, replaces part of that behaviour, or manages a different class of worker.
3. **Overlap with comms-gateway.** The comms gateway already ingests channel webhooks (Slack, Gmail). Decide the boundary with events-cluster-1.
4. **Language for UI.** Resolved for Pit Crew: the operator console is a React single-page app and a Node backend-for-frontend on `@budybot/console-kit`, as the [platform console standard](../../ref/platform-console-standard.md) prescribes; the services behind it are Go.
5. **Glossary.** "DT Dynamo Worker" does not appear in the wiki; add a glossary entry when defined.
