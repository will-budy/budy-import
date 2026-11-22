---
name: pitcrew-cluster-1
kind: service
description: Agent Success's ticket and approval service: SOP-driven tickets for escalations, PR reviews, code feedback and content, skill and context approvals, with one operator console, replacing fragmented approvals across Jira and cluster-specific UIs.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/pitcrew-cluster-1_repo-1
status: active
tags: [execution-mode, application-cluster, ui, bff, agent-success, tickets, sop]
interfaces: [nexus, http]
runtime:
  language: go
  framework: temporal
  deployment: eks
links:
  design: [prd.md, hld.md, trd.md]
  runbooks: []
  dashboards: []
  api_contracts: [nexus-contracts.md]
  builds: [../../../builds/m2/prd.md]
  release_candidates: []
---

# pitcrew-cluster-1

pitcrew-cluster-1 is Agent Success's ticket and approval service. Platform services hand it a ticket under a named procedure (an SOP); it accepts or rejects the request at once, then drives the ticket through the SOP's steps (an AI reviewer, a person, or an automated action) and returns the outcome. Agent Success staff work every ticket from one console. It covers escalations, PR reviews, code feedback, and content, skill and context-change approvals, and reduces the fragmented approval workflows spread across Jira and cluster-specific UIs.

> **Status: Phase 1 built, in review (November 2026).** `ticket-engine-1`, the `PTSOP` CRD, the SQL exporter and the console are written and open as draft pull requests in this repository and in the platform repositories they touch; nothing is released or deployed. The [PRD](prd.md), [HLD](hld.md), [TRD](trd.md) and [Nexus contracts](nexus-contracts.md) describe what was built, with the deviations from the first design recorded in the TRD's "As built" section. The owner has decided the core shape (a ticket system of record in PostgreSQL, SOPs as data, a deliberate tenant-assume step for customer content, and a dedicated Agent Success platform role); the HLD's Design Decisions Log lists what is settled and its Open Questions lists what is not.

## Boundary

| Owns | Does not own |
| --- | --- |
| Tickets and their history, in this cluster's PostgreSQL database | The systems that originate the work (DT reviewer in dt-manager-1, context review gate in context-cluster, PR hosts) and their decision logic |
| SOP execution: steps, AI and human actors, time limits, escalation | Identity, roles and permissions (auth cluster) |
| The Agent Success operator console: queue, ticket history, review and approval screens | Delivering approved messages to customers (the communications services) |
| Per-ticket audit: who decided what, under which SOP version, and who opened which customer's content | Manager approval of report changes |

It is a **callee** of other clusters through its own Nexus contract (`PitcrewServiceV1`) and publishes nothing to them in Phase 1.

## Shape

| | |
| --- | --- |
| **Repository type** | Nexus-first (gateway + component) plus a non-Nexus console |
| **Components** | `gateway-1` (exists), `ticket-engine-1` (built, in review: intake and the SOP-driven ticket workflow), `console-1` (built, in review: React single-page app and Node BFF in one container, per the [platform console standard](../../../ref/platform-console-standard.md)) |
| **Precedent** | the platform console standard and the nainai console for the UI; studio-services-cluster-1 for a Nexus-first cluster with a PostgreSQL store |
| **Product context** | the Agent Success Rep persona and dashboards/queues in the [Mark 2 PRD](../../../builds/m2/prd.md) |

The rest of the standard applies unchanged: Go monorepo for services, component catalog (the console is a component with `validation.kind: node`), thin entry-workflow callers, umbrella plus sub-charts, README, changesets.

**First pass (October 2026):** the gateway only (`gateway-1`), like `nainai-cluster-1`; the components above are added one at a time afterwards, each as a catalog entry.

## Names (derived from the standard)

| | |
| --- | --- |
| Kubernetes namespace | `ob1-tf-eks-de-v2-pitcrew-1-ns-1` |
| Nexus service (decided) | `PitcrewServiceV1` |
| Gateway component, task queue | `gateway-1`, `pitcrew-cluster-1-gateway-1-tq` |
| Netpol label, Vault Transit role | `budybot.io/netpol: pitcrew-gateway-1`, `ob1_crossplane_vault_transit_pitcrew_gateway_1` |
| Umbrella chart | `pitcrew-cluster-1-repo-1` |
| Image repository | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_pitcrew-cluster-1_repo-1` |
| Helm repository | `ob1-helm-chart-repo-v1/pitcrew-cluster-1-repo-1` |

## Callers (assumed, unconfirmed)

Callers submit tickets through the Pit Crew Nexus contract. Expected first callers: the DT reviewer in dt-manager-1 (the `requestContextReviewV2` flow and package or code review), the context review gate in context-cluster, the DT consulting service (errors and code errors), the Digital Teammates themselves (communication, skill and tool approvals, client emails), and the PR host for PR reviews and code feedback (GitHub and/or gitjib). Each needs an SOP and, for tenant data, a tenant-scoped token. Jira: Mark 2 uses Jira Service Desk today; Pit Crew replaces that path, and the cut-over is an open question in the HLD.

## Settled and open

Settled by the owner (full list in the HLD Design Decisions Log): Pit Crew is the system of record for tickets (PostgreSQL, `ob1-pitcrew-db-1`); the workflow is a generic interpreter and SOPs are versioned Kubernetes resources; a request is accepted or rejected immediately and the outcome is collected by a separate call; the console reads for speed but changes go through the gateway as the person; customer content is reached only by a deliberate, recorded tenant assume; staff hold a dedicated Agent Success platform role and sign in through the platform portal.

Resolved in the Phase 1 build (see the TRD, "As built"): the console's read path (database reads of the `meta` schema, changes through the gateway), platform-scope access to ticket envelopes (the read role), the SOP publishing path (`PTSOP` resources), and the cross-repository changes (the build PRs below).

Still open (HLD Open Questions): how the console assumes a tenant session (Phase 1 uses an OpenFGA check and fails closed until the platform provides an exchange), delegation scope, long-wait limits, guard language, AI step plumbing, notification provider, retention, and the Jira cut-over.

## Detailed Docs

| Name | Type | Link |
| --- | --- | --- |
| PRD | design | [Product Requirements](prd.md) |
| HLD | design | [High Level Design](hld.md) |
| TRD | design | [Technical Requirements](trd.md) |
| Nexus contracts | api contract | [Nexus contracts](nexus-contracts.md) |
| Repository | source | `Budybot/pitcrew-cluster-1_repo-1` |
| Build PR, pitcrew-cluster-1 | pull request | [pitcrew-cluster-1_repo-1#5](https://github.com/Budybot/pitcrew-cluster-1_repo-1/pull/5) |
| Build PRs, platform | pull requests | [eks-stack#1523](https://github.com/Budybot/ob1_mn_github_argocd_eks_stack/pull/1523), [vault-gitops#282](https://github.com/Budybot/ob1_mn_github_vault-gitops_repo-1/pull/282), [de-v2#2261](https://github.com/Budybot/ob1_mn_gh_de-v2_gitops_repo_1/pull/2261), [k8s-security#575](https://github.com/Budybot/ob1_mn_github_k8s-security_gitops_repo_1/pull/575), [critical-stack#182](https://github.com/Budybot/ob1_mn_gh_argocd-critical-stack_repo_1/pull/182), [authz-config#20](https://github.com/Budybot/authz-config_gitops_repo-1/pull/20), [auth-service#372](https://github.com/Budybot/ob1_mn_gh_auth-service-1_repo-1/pull/372), [frontend#95](https://github.com/Budybot/frontend-cluster-1_repo-1/pull/95) |
| Group index | index | [Execution Mode Services](../info.md) |
