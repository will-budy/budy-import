---
name: Future Services Backlog
code: future-services
version: 0.1
status: backlog — not in de-v2 v2.0 scope
last_updated: 2026-04-11
---

# Future Services — Backlog

These services are deliberately out of scope for de-v2 v2.0 (Phase 1–3). They are documented here so the platform is designed with awareness of them — not so they are built now.

Any architectural decision that would make one of these services difficult or impossible to add later should be flagged as a risk.

---

## 1. A2A Gateway

**What it is:** An Agent-to-Agent protocol (Google A2A, open standard) endpoint that allows external agents — from a client's own systems or from third-party AI vendors — to interact with Budy Digital Entities as peers.

**Why not now:** No external agent partners exist yet. A2A adds a non-trivial auth surface (AgentAuth + agent card publication) and a task lifecycle management layer (submitted → working → completed/cancelled). Building it before there's a use case is waste.

### Why it won't require a big refactor when we do it:

- Comms Gateway 1's normalization layer is designed as pluggable — adding an A2A handler is additive code, same as adding a new webhook channel.
- Auth Service is A2A-token-compatible from day 1 — tokens are structured to work as A2A AgentAuth bearer tokens without modification.
- The main work when A2A is activated: implement the A2A server endpoint on Comms Gateway 1 (`/.well-known/agent.json` agent card + `/tasks` submission endpoint), and wire A2A streaming (SSE or WebSocket) for long-running task responses.

**Target phase:** Phase 4 or when first external agent partner is identified.

**Design prerequisites:** A2A agent card content (what capabilities does each Budy Digital Entity expose to external agents?) — requires input from product and client success.

---

## 2. Codegen Service (Autonomous Consultant)

**What it is:** A service that enables de-v2 agents to author new v1 Temporal workflows and activities — the "autonomous consultant" capability. An agent, through repeated interactions on a topic, identifies a repeatable pattern that should become a deterministic v1 mission. It drafts the TypeScript workflow code, tests it in the Sandbox Service 1 (`v1-test` type), attaches test results, and submits it for human review and promotion into v1 Design Services.

**Why not now:** This is the highest-complexity capability in the roadmap. It requires the agent to understand Temporal workflow patterns deeply enough to generate valid TypeScript, the Sandbox Service 1's `v1-test` type to be mature, and the human approval workflow to be well-established. All of those are Phase 2/3 work.

**Why it's the most exciting capability:** It closes the loop — agents don't just learn skills within de-v2; they can permanently improve v1 (the reliable, cost-efficient layer) by generating new missions from experience. This is the "training your own workforce" vision.

**Dependencies:** Sandbox Service 1 (v1-test), Skill Service (skill approval workflow as template), v1 Design Services (accepting generated workflows), human review process for generated code.

**Target phase:** Phase 4 (H2 2026+), research starts in Phase 3.

---

## 3. Connector / Integration Registry

**What it is:** A catalog and lifecycle manager for the integrations that Digital Entities use to interact with client systems — CRM APIs, marketing platforms, email, Slack workspaces. Manages OAuth tokens (refresh, revocation), API key rotation, integration health monitoring, and per-tenant credential isolation.

**Why not now:** v1 Design Services already handles connection settings and credentials management for v1 missions. de-v2 inherits those integrations initially (agents trigger v1 missions which use v1 credentials). A separate de-v2 connector registry becomes necessary when de-v2 agents need to make direct integration calls (not via v1 mission delegation).

**Design consideration:** When building Auth Service (in scope), leave room for `integration:call:{connector_name}` as a permission type — this is what the Connector Registry will gate access to.

**Target phase:** Phase 4, or when de-v2 agents need direct (non-v1) integration access.

---

## 4. Agent Evaluation / QA Service

**What it is:** Automated quality testing for agent behavior. When a skill is updated, a new agent persona is deployed, or a core memory is promoted, the Evaluation Service runs a pre-defined set of test scenarios against the agent and reports pass/fail alongside the human approval request. Humans see not just "here is the proposed change" but "here is how the agent behaved in 20 test cases before and after."

**Why not now:** You need enough agent interaction history to build meaningful eval scenarios, and you need the skill approval workflow (Phase 2) to be established before you bolt eval onto it.

**Impact when added:** This is what takes skill approval from "human reads code and decides" to "human sees test results and decides" — a significant quality and trust improvement, especially before rolling out to clients.

**Target phase:** Phase 3/4. Can be designed in Phase 3 alongside the consolidation work.

---

## 5. Admin UI Backend

**What it is:** A REST or GraphQL backend serving a management interface for Budy platform operators. Today all management is via Slack signals and direct PostgreSQL queries. As the platform grows (10+ clients, 30+ agents, hundreds of skills), Slack-based approvals and direct DB access don't scale for operational tooling.

**Why not now:** Slack-based approval workflow is sufficient for 3 clients and a small ops team. The overhead of building and maintaining a UI backend before the platform is proven is not justified.

**What it would expose:** Agent registry management, skill browsing and approval (alternative to Slack), memory inspection, tenant provisioning (alternative to manual Temporal triggers), KPI dashboard (consuming Observability Backend), permission policy management (consuming Auth Service).

**Target phase:** Phase 4 or when the Slack-based UX becomes a bottleneck for operators.

---

## 6. Notification Service

**What it is:** A centralized service for all human-facing notifications from de-v2 — skill approval requests, memory promotion requests, permission escalations, digest summaries, weekly KPI reports. Currently each service (Memory, Skill, Auth) sends Slack notifications directly.

**Why not now:** Three services sending Slack messages independently is manageable. Centralization becomes valuable when you need: deduplication (don't send three notifications for one change), delivery guarantees (retry if Slack API is down), notification preferences (some operators want email, some want Slack, some want both), and rate limiting (don't flood a channel during a consolidation burst).

**Target phase:** Phase 3 or when notification volume or complexity becomes a pain point.

---

## Architectural Reminders for In-Scope Services

When building Phase 1/2 services, keep the following in mind so future backlog services don't require rework:

| Future service | What to watch for now |
|---------------|----------------------|
| A2A Gateway | Comms Gateway 1 normalization must be pluggable. Auth Service tokens must be A2A-compatible (already designed). |
| Codegen Service | Sandbox `v1-test` type must accept raw TypeScript code (already designed). Skill approval workflow must support "generated by agent" provenance. |
| Connector Registry | Auth Service permission taxonomy must include `integration:call:*` as a permission type. |
| Agent Evaluation | Skill approval workflow must support attaching test result artifacts alongside the approval request. |
| Admin UI Backend | All management operations must be available via Nexus (not just Slack signals) — they already are by design. |
| Notification Service | Each service's Slack notification logic should be extracted into a shared notification function (easy to re-route later). |
