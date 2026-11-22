---
name: DT Consulting Services — Engagement flow (platform context)
code: dt-consulting-services-1-engagement-flow
version: 0.3
status: draft
last_updated: 2026-11-17
---

# DT Consulting Services: engagement flow (platform context)

Platform-level context for how `dt-consulting-services-1` fits with the clusters around it. Service-internal design (workflows, workers, schemas, phases) lives in the service repository under `docs/design/` (`Budybot/dt-consulting-services-1_repo-1`: `engagements.md`, `console.md`, `phase-0-test-plan.md`); this page holds what other clusters and readers need.

> **Status: draft (November 2026).** Owner decisions are marked *Decided*. Phase 0.1 (engagement intake from the tenant console) is built and being brought up in dev-1; everything after it is designed, not built.

## Glossary

| Term | Meaning |
| --- | --- |
| **Dynamo worker** | A Temporal worker, one per DT workbench, that runs the DT's deterministic workflows. Workflows may contain prompts and call external and internal systems. Its source is one repository per digital teammate (DT) in GitLab (gitjib-cluster-1), created from a template; once an image built to the required spec (task queue, common modules) is pushed, the worker is deployed automatically by [nainai-cluster-1](../nainai-cluster-1/info.md). |
| **Engagement** | A PRD-style request from a DT to this cluster to add or change a Dynamo-worker workflow: outcome, context, audience, do's and don'ts, success criteria, references to existing resources. Nothing technical or implementation-specific. |
| **Live engagement** | An engagement that is not closed. *Decided:* a DT has at most one. |
| **Coding sandbox** | A Claude Code pod of sandbox type `claude-coder-1`, requested from [Karkhana](../karkhana-cluster-1/info.md) (`KarkhanaServiceV1`); there is no sandbox custom resource per sandbox, only the platform's `SandboxType` catalog entry. It writes the code; it has no general internet and installs packages only from the approved npm proxy. See [Karkhana sandboxes](../karkhana-cluster-1/sandboxes.md). |

## Actors and clusters

| Cluster | Role in the flow |
| --- | --- |
| DT workbench (one worker per DT) | The caller, in the context of a conversation thread between the DT manager and the DT (the communication cluster attaches each conversation to a workbench thread). Later phases: the DT calls through skills and tools this cluster publishes as CRs. |
| `dt-consulting-services-1` | Owns engagements: intake, state in its database `ob1-dt-consulting-services-db-1`, orchestration, the tenant console, and the outcome (a published, running workflow). |
| [gitjib-cluster-1](../gitjib-cluster-1/info.md) | GitLab, the approved npm proxy and the platform's npm modules. Hosts each DT's worker repository; its CI builds and pushes the image on merge. Provisioning (groups, repositories, users) is gitjib's own provider. |
| [nainai-cluster-1](../nainai-cluster-1/info.md) | Deploys the Dynamo worker version; asked whether the new version is healthy. |
| [studio-services-cluster-1](../studio-services-cluster-1/info.md) | Artifacts (documents, dashboards) an engagement can reference or render to. Its gateway is the authentication pattern this cluster follows. |
| [janus-cluster-1](../janus-cluster-1/info.md) | Connections (for example Google Calendar, OAuth done) a workflow may use. |
| context cluster | People profiles and other context at known keys. |
| dt-manager-1 (DT reviewer) | *Decided:* the review gate for package approvals and code review. It decides or escalates to pitcrew. Until integrated, review steps auto-approve (dev only). |
| [pitcrew-cluster-1](../pitcrew-cluster-1/info.md) | Where DT reviewer escalates; not called by this cluster directly. |
| [karkhana-cluster-1](../karkhana-cluster-1/info.md) | Runs the coding sandbox. `delivery-lead-1` requests it through `KarkhanaServiceV1` as the coder service role (`svcrole-dtcs-coder-1`, service user `dtcs-coder-1`), in the engagement's tenant. Capabilities used: `requestSandbox`, `getSandbox`, `putFiles`, `runCommand`, `getCommand`, `pauseSandbox`, `resumeSandbox`, `deleteSandbox` (see [Karkhana sandboxes](../karkhana-cluster-1/sandboxes.md)). |

## Workers

*Decided (November 2026):* split by identity and permission boundary.

| Worker | Owns |
| --- | --- |
| `engagement-manager-1` | Engagement record and lifecycle, one-live rule, the DT thread (questions, feedback), PRD to HLD research and feasibility, package requests. Built (phase 0.1: intake and lifecycle). |
| `delivery-lead-1` | Planning, requesting the sandbox from Karkhana and putting the PRD and HLD into it with `putFiles`, supervising the coding agent (`runCommand`, `getCommand`), the compile and CI error loop, pause and resume with context in S3, opening the PR. |
| `release-qa-1` | Review and merge, CI watch (image pushed), publishing the workflow's trigger, verifying the new worker version is healthy. |
| `console-1` | The tenant console at `dtcs.<env>.orangebox.ai` (see [Console](console.md)). Built. |

## Flow

```text
DT (or the console) ─startEngagement─▶ gateway-1 ─▶ engagement-manager-1: record, start EngagementWorkflowV1
   discovery   PRD → HLD: research, approved packages, referenced resources; questions to the DT thread (awaitingFeedback)
   planning ── delivery-lead-1: requestSandbox + putFiles (PRD + HLD), Claude Code writes the code, PR in the DT's worker repo (gitjib)
   reviewing ─ release-qa-1: DT reviewer review, merge
   publishing  gitjib CI builds and pushes the image; nainai deploys; the workflow's trigger is registered
   verifying   the new worker version is healthy ─▶ done
DT ─closeEngagement─▶ closed at any stage; the lifecycle workflow cleans up (sandbox, branches, unpublished triggers)
```

*Decided:* **done** is the workflow published and the new worker version healthy, not the PR merged and not the image pushed.

## Contract

Nexus service `DTConsultingServiceV1` on `ob1-nexus-dt-consulting-services-1-endpoint-1`, the generic `Execute` and `DescribeCapabilities`. Component `engagement-manager-1` capabilities: `startEngagement`, `getEngagement`, `listEngagements`, `closeEngagement` (built); `provideFeedback` (planned). The payload schemas are in the gateway's capability manifest; the typed payloads in the `contract` module. Callers need a tenant-scope STS session whose subject is a digital teammate of the tenant in an editor session (`active_digital_teammate`).

## Worked example (first target)

A DT asks for a workflow that produces an office display board for a team of five or six: a shared calendar plus a light daily activity shown each morning. The engagement references an existing Studio artifact type to render to, people profiles in the context cluster at given keys, and an existing Janus connection to Google Calendar.

## Constraints

- *Decided:* phases 1 to 3 build npm (TypeScript) workers only; Go later.
- *Decided:* the coding sandbox installs only from the approved npm proxy and the platform's npm modules in gitjib; it has no general internet. Workers outside it may research on the internet.
- *Decided:* phase 0 depends only on this cluster and gitjib: no DT reviewer, pitcrew or DT caller. The console drives it.
- *Decided:* no user has cross-tenant access. The cluster's system roles assume a small set of bootstrapped GitLab user types (viewer, PR author, reviewer) per repository, each worker only the type it needs.
- Authentication follows the platform gateway pattern (STS bearer token verified over HTTP); see the Studio services gateway.

## Phases

| Phase | Outcome |
| --- | --- |
| 0 | Console through the portal (ingress, STS handoff), database migrated, chart deployed to dev-1 |
| 0.1 | From the console, as a DT: start an engagement, see it registered and started by its workflow, close it |
| 1 | Discovery (PRD to HLD, feasibility), auto-approved review steps |
| 2 | Delivery (sandbox from Karkhana, coding, pause and resume, PR) |
| 3 | Release (review and merge, CI, publish, verify: done) |
| later | DT skills and tools (CRs), DT reviewer and pitcrew integration, feedback over the DT thread, Go workers |

## Open cross-cluster questions

1. Which gitjib operations this cluster needs (branch, merge request, repository read, CI status) and whether they are Nexus operations on `GitjibHostingServiceV1`.
2. The sandbox contract is settled in [Karkhana sandboxes](../karkhana-cluster-1/sandboxes.md): type `claude-coder-1`, network profile `sandbox-coder-1` (npm through the approved proxy), pause and resume. Still open: GitLab access from a sandbox is not wired yet (no GitLab proxy in front of gitjib's token broker, no GitLab egress for the profile), so the git branch source (`git {projectPath, branch}` on `requestSandbox`) does not work yet; `putFiles` does. No end-to-end run on a cluster yet.
3. How a workflow is given Studio artifacts, context keys and Janus connections, and who checks the DT may use them.
4. The DT reviewer request and response contract for package approvals and code review.
5. The thread reference a DT passes (workbench session or workflow id) and how the engagement manager posts to that thread.
6. Which cluster registers a published workflow's trigger: *proposed* events-cluster-1 for all kinds (webhook, internal, email, schedule); see [events-cluster-1 trigger model](../events-cluster-1/triggers.md).

## Related

- [dt-consulting-services-1](info.md), [Console](console.md), [Karkhana sandboxes](../karkhana-cluster-1/sandboxes.md)
- [Execution Mode Services](../info.md), [PostgreSQL Database Provisioning](../../../gitops/postgres-database-provisioning.md)
