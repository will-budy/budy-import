---
name: Digital Entities v2 Platform — Product Requirements Document
code: de-v2-prd
version: 0.1
status: draft
owner: Budy Engineering
last_updated: 2026-04-11
---

# Digital Entities v2 Platform — PRD

## 1. Executive Summary

Budy's v1 platform executes reliable, deterministic AI workflows for 3 enterprise clients in the Senior Living space. As the client base grows, every customer support request, mission update, report improvement, and user call requires manual human effort from Budy staff. This model does not scale.

de-v2 adds an autonomous agent layer: AI Digital Entities that can hold conversations via Slack and Email, learn from interactions through a human-reviewed approval workflow, and delegate to v1's reliable execution engine for known tasks. The first mandate is to automate Budy's own internal operations — support, reporting, and user call management — before exposing v2 capabilities to enterprise clients.

---

## 2. Background: What V1 Gave Us and Where It Falls Short

### V1 strengths

- Reliable, deterministic Temporal workflows for repeatable sales & marketing tasks
- Production-stable for 3 enterprise clients, 100+ users, 3 Digital Entities
- Cost-efficient: no LLM calls beyond saved prompt steps
- Strong integration layer with client CRMs and marketing platforms

### Where V1 cannot go

- **No conversational interface**: Users interact only via CRM task assignment. There is no Slack or Email chat capability.
- **No learning**: When Budy staff fix a bug or handle a support request, that knowledge is lost. There is no mechanism for the system to improve from the experience.
- **Manual development**: Every new mission requires a consultant to run workshops, author Temporal workflows, and deploy. Clients cannot self-serve.
- **Manual support**: Bug reports, feature requests, and usage questions from 100+ enterprise users are handled by Budy staff. Volume is growing with each client.
- **Manual reporting**: Weekly and monthly reports are AI-assisted but human-executed. There is no ad-hoc question answering.

---

## 3. Problem Statement

### The immediate pain (Q2 2026)

Budy currently has 3 enterprise clients and 100+ end users. Support, development, and reporting are all handled manually by a small Budy team. This is starting to break:

- Customer support volume is growing and there is no tracking system — requests arrive via various channels with no ticketing or resolution tracking
- Mission development and updates require consultant time that is already constrained
- Reporting improvements require manual effort every cycle
- User call prep and follow-up is done by hand

### The scaling inflection point

At 3 clients, manual operations are painful but manageable. At 10+ clients with 500+ users and 20+ entities, it is not manageable at all. The time to build the autonomous layer is now, before the manual model breaks.

### The opportunity

Budy's business is to provide AI Digital Teammates to enterprises. The most credible demonstration of that capability is using those teammates internally, at production quality, to run Budy's own operations. Building for internal use first gives Budy a real environment to iterate in, real feedback to learn from, and a working reference implementation to show clients.

---

## 4. Goals

### P0 — Must have by end of Q2 2026 (June 30)

1. **Support Agent live for internal use**: Autonomously handles Slack-based support requests from Budy's own team and client contacts. Opens issues/tickets, triages, resolves where possible, escalates with full context where not.
2. **Report Builder Agent live for internal use**: Builds and delivers scheduled reports on-demand via Slack/Email. Answers ad-hoc data questions without human involvement.
3. **Full request tracking from day 1**: Every support request and report request is logged — whether resolved autonomously or escalated. Baseline autonomous resolution rate established.

### P1 — By end of Q3 2026

1. **User Call Runner Agent**: Schedules, preps, and follows up on user calls autonomously. Pre-call research packaged for the Budy team. Post-call summaries and follow-ups executed.
2. **Beta rollout to all 3 enterprise clients**: Support Agent and Report Agent exposed (via Slack) to all 3 enterprise clients in limited beta. Client users can ask their agent questions directly.
3. **Learning loop operational**: Agents propose skill updates and memory corrections from real interactions. Human approval via Slack + Temporal signal workflow is live and being used.

### P2 — H2 2026

1. **Consolidation and memory promotion**: Agents demonstrably improve from interactions. Approval rates and time-to-resolve trending in the right direction.
2. **v1 mission delegation**: Agents route to v1 missions for known, repeatable tasks rather than reasoning through them via LLM. LLM costs per resolved request decreasing over time.
3. **Internal self-improvement**: Budy operators can update agent skills and personas via the approval workflow without a full consultant engagement.

---

## 5. Non-Goals (v2.0 scope)

The following are explicitly out of scope. Decisions that would require designing for these must be flagged and deferred.

| Out of scope | Why |
|-------------|-----|
| **A2A (Agent-to-Agent protocol)** | External agent interoperability is a future capability. Internal agent delegation uses Temporal Nexus, not A2A. |
| **Client self-service agent modification** | Clients will not directly modify entity personas, skills, or workflows in v2.0. Budy operators control the approval chain. This is Phase 3/4. |
| **Multi-industry expansion** | The agent roster and domain expertise is scoped to Sales & Marketing / Senior Living. No new verticals in v2.0. |
| **Generic / horizontal agents** | No "do anything" agents. All agents are specialized by domain and role. |
| **External webhook channel for clients** | v2.0 channels are Slack and Email only. No client systems calling v2 agents directly via webhook. |
| **Replacing v1** | v2 agents augment and orchestrate v1. All existing v1 missions continue to run as-is. |
| **New LLM provider integrations** | LiteLLM handles provider routing. No custom LLM integrations in de-v2 scope. |

---

## 6. User Personas

### Internal — Budy Team

| Persona | Role | How they use de-v2 |
|---------|------|-------------------|
| **Budy Engineer / Consultant** | Design, deploy, monitor | Approves skill and memory proposals via Slack. Monitors agent behavior and quality. Authors new agent personas and initial skill sets. |
| **Budy Customer Success** | Client-facing operations | Uses Support Agent to handle client requests. Uses Report Agent for client reporting cycles. Primary daily users of the internal agents. |
| **Platform Operator** | Infrastructure, oversight | Manages agent registry, Temporal namespaces, K8s deployments, LiteLLM budgets. Monitors observability dashboards. |

### Client-Side (Phase 2 beta — enterprise users)

| Persona | Role | How they use de-v2 |
|---------|------|-------------------|
| **Sales Rep / Senior Living Operator** | End user | Chats with the Support Agent via Slack for help with their Digital Entity. Receives reports via Email. |
| **Enterprise Admin** | Oversight, escalations | Receives escalated issues. Reviews approval requests if/when client-level approval is introduced. |

---

## 7. Success Metrics

### Phase 1 baseline (by end of June 2026)

| Metric | Target | Notes |
|--------|--------|-------|
| Support requests tracked per week | 100% | Every request logged, whether resolved or escalated |
| Report generation (scheduled) | 100% autonomous | vs ~0% autonomous today |
| Ad-hoc report questions answered autonomously | Baseline established | Target 50%+ by end of Phase 2 |
| Agent response latency (Slack message → reply) | < 30 seconds for simple requests | |
| Autonomous support resolution rate | Baseline established | Unknown today — first 6 weeks establishes this |

### Phase 2 targets (end of Q3 2026)

| Metric | Target |
|--------|--------|
| Autonomous support resolution rate | 50% (up from baseline) |
| Skill proposals submitted by agents | ≥ 1 per agent per week |
| Human-approved skill promotions | Baseline established |
| LLM cost per resolved support request | Target cost per resolution established |

### Long-term (H2 2026+)

| Metric | Target |
|--------|--------|
| Autonomous support resolution rate | 80% |
| Human interventions per week | Declining week-over-week trend |
| Skill proposals accepted by humans | > 70% acceptance rate |
| v1 mission delegation rate | Measurable % of agent tasks delegated to v1 |

---

## 8. Phased Rollout

### Phase 1 — Foundation (Weeks 1–6, target: end of May 2026)

### Scope:

- Comms Gateway 1: Slack only. Webhook ingestion → AgentMessage normalization → start Comms Router 1.
- Comms Router 1: explicit channel binding lookup only (no intent classification yet). Route to correct agent via Nexus.
- Support Agent worker: one K8s Deployment, one Temporal task queue. Basic LLM loop. Handles Slack messages, posts replies.
- Report Builder Agent worker: same deployment pattern. Triggered by Slack requests and scheduled Temporal cron.
- LiteLLM Proxy: deployed with Claude Sonnet (reasoning) + Claude Haiku (fast/classification) + OpenAI fallback.
- PostgreSQL schema: `agent_registry`, `episodic_memories`, `thread_context`, `skills` (basic), `audit_log`.
- Shared Redis key structure defined and implemented.
- Temporal namespaces: `platform` (shared) + `budy-agents` (tenant).

**Milestone:** A Slack message to `#support-agent` gets a coherent, contextual response. A report request triggers report generation and delivery.

### Phase 2 — Memory, Learning & Beta (Weeks 7–13, target: June 30, 2026)

### Scope:

- Memory Service: Temporal worker with all activities (store, search, getCore, getSessionContext). Consolidation Workflow (cron-scheduled).
- pgvector: semantic memory vectors enabled on existing PostgreSQL.
- User Call Runner Agent worker.
- Intent-based routing in Comms Router 1 (Haiku-class LLM classifier).
- Skill Service: PostgreSQL-backed, full CRUD + Skill Approval Workflow (Temporal signal, Slack notification).
- Init container bootstrap pattern for all agent workers.
- Email channel in Comms Gateway 1 (Gmail Pub/Sub).
- Budget controls: per-agent LiteLLM API keys with monthly caps.
- Beta rollout: all 3 enterprise clients get Slack access to Support Agent and Report Agent.

**Milestone:** Agents remember context across conversations. Support Agent proposes its first skill from a repeating pattern. Client users can reach agents via Slack.

### Phase 3 — Consolidation & Autonomy (Weeks 14–20, target: end of Q3 2026)

### Scope:

- Core Memory Approval Workflow: Slack notification + Temporal signal approve/reject.
- Blue-green restart CronJob: scheduled restart with consolidation gate.
- v1 mission delegation: agents can call v1 API Gateway as a tool, routing known tasks to deterministic workflows.
- Agent permission model: tiered permissions with Temporal signal-based escalation.
- Observability: Prometheus + Grafana dashboard for LLM cost per agent, autonomous resolution rate, memory growth.

**Milestone:** Agents demonstrably improving from interactions. Budy team spending less time on support. LLM costs tracked and decreasing as v1 delegation kicks in.

### Phase 4 — Multi-Tenancy & Scale (Q4 2026+)

### Scope:

- Per-client Temporal agent namespaces (Nexus cross-namespace setup).
- Per-client K8s namespaces for digital entity 2 isolation.
- KEDA autoscaling on Temporal queue depth for all agent workers.
- Client-level agent customization tooling (Budy-operator-controlled).
- A2A protocol exploration for external agent interoperability (research only).

**Milestone:** Multiple clients running isolated agent namespaces on shared infrastructure.

---

## 9. Dependencies

| Dependency | Type | Phase | Notes |
|-----------|------|-------|-------|
| V1 API Gateway | Internal | Phase 3 | V2 agents call v1 gateway to trigger missions as tools |
| V1 Memory System | Internal | Phase 2 | V2 memory service may read v1 memory for historical context |
| Temporal (self-hosted EKS) | Infrastructure | Phase 1 | Must support Nexus for cross-namespace calls |
| LiteLLM Proxy | Internal | Phase 1 | Must be deployed before any agent work begins |
| Slack App (Events API + OAuth) | External | Phase 1 | Slack app provisioned for Budy workspace(s) |
| Gmail Pub/Sub | External | Phase 2 | Google Workspace Pub/Sub for inbound email events |
| pgvector PostgreSQL extension | Infrastructure | Phase 2 | Must be enabled on existing PostgreSQL cluster |
| Vault Operator | Infrastructure | Phase 1 | Secret injection for all services. Already in use in v1. |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM costs exceed budget | Medium | High | Per-agent monthly caps in LiteLLM from Phase 1. Alert at 80% consumption. Dashboard from Phase 3. |
| Temporal Nexus complexity delays Phase 1 | Medium | Medium | Phase 1 uses single shared namespace only. Nexus introduced only in Phase 2 when agent namespace splits. |
| Agent hallucinations on client support requests | Medium | High | Human escalation path always available. Agents trained to escalate when uncertain. All skill/memory promotions require human approval. |
| Phase 1 scope creep into memory/learning features | High | Medium | Memory Service and Skill Service are Phase 2. Phase 1 agents are stateless between Slack threads (only thread-level context from PostgreSQL). Enforced in sprint planning. |
| v1 dependency coupling | Low | Medium | V2 calls v1 only via defined integration points (HTTP gateway or Nexus). No direct v1 DB access from v2. |
| pgvector doesn't scale for semantic memory at growth | Low | Low | Sufficient for 4-6 agents at launch. Qdrant migration path documented as open question. |
