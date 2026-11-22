---
name: Digital Entities v2 Platform
code: de-v2
version: 0.1 (design-draft)
status: design
owner: Budy Engineering
last_updated: 2026-11-13
---

# Digital Entities v2 Platform (de-v2) — Context & Index

## What is de-v2?

de-v2 is Budy's second-generation Digital Entity infrastructure. It adds an autonomous, conversational agent layer on top of the existing v1 deterministic workflow platform. de-v2 Digital Entities can hold conversations via Slack and Email, reason about novel situations, learn from interactions through a human-reviewed approval workflow, and delegate to v1 missions for known, repeatable tasks.

Where v1 workflows are **deterministic** (fixed missions, human-authored, highly reliable and cost-efficient), de-v2 agents are **adaptive**: they accumulate context across conversations, acquire new skills through structured human approval, and improve over time from real interactions.

The first de-v2 entities are built for Budy's own internal operations — customer support, report generation, and user call management — before rolling out to enterprise clients.

---

## v1 → v2 Relationship

| Concern | v1 (Consultant Platform) | de-v2 (This Platform) |
|---------|--------------------------|------------------------|
| **Interaction** | CRM task assignment, scheduled automations | Slack, Email (chat-native) |
| **Logic** | Deterministic Temporal workflows (consultant-authored) | Adaptive LLM-driven agent loops |
| **Learning** | Manual — consultant re-designs missions | Autonomous — skill proposals + human review |
| **Cost model** | Low per-run (deterministic) | Higher per-turn (LLM reasoning) |
| **Best for** | Reliable, repeatable, high-volume tasks | Complex reasoning, novel situations, conversation |

**Key principle:** de-v2 agents orchestrate v1 missions. When an agent can reduce a task to a known workflow, it delegates to v1 rather than reasoning through from scratch. This keeps costs down and reliability high.

See [v1 Platform Context](../de-v1-platform/v1-platform.md) for full v1 architecture.

---

## Service Registry

### Phase 1 & 2 — Core Platform

| Service | Code | Type | Phase | One-liner |
|---------|------|------|-------|-----------|
| Comms Gateway 1 | `comms-gateway-1` | Go/TS — K8s Deployment | 1 | Only REST surface. Receives Slack/Email webhooks, normalizes to AgentMessage, starts Comms Router 1 in Temporal. |
| Comms Router 1 | `comms-router-1` | TypeScript — Temporal Workflow (Shared NS) | 1 | Classifies incoming messages by explicit binding, thread continuity, or LLM intent. Dispatches to the correct agent via Nexus. |
| Digital Entity 2 | `digital-entity-2` | TypeScript — Temporal Worker (Agent NS) | 1 | Core reasoning engine. One K8s Deployment per agent identity. Runs the LLM loop, executes tools/skills, manages context, produces responses. |
| LLM Router 1 | `llm-router-1` | Python — LiteLLM Proxy (off-the-shelf) | 1 | Multi-model LLM proxy with per-agent budget controls and OpenTelemetry integration. The only internal HTTP surface. |
| Auth & Permissions | `auth-service` | TypeScript — Temporal Worker (Shared NS) | 1 | Issues short-lived scoped JWTs for privileged operations. Enforces fine-grained permission policies. Routes permission escalations to human approval via Temporal signals. |
| Memory Service | `memory-service` | TypeScript — Temporal Worker (Shared NS) | 2 | Stores and retrieves episodic, semantic, session, and core memories. Runs cron-based consolidation and human-approval workflows. |
| Skill Service | `skill-service` | TypeScript — Temporal Worker (Shared NS) | 2 | Manages versioned SKILL.md content in PostgreSQL. Runs human-approval workflows via Temporal signals for new and modified skills. |
| Sandbox Service 1 (v1 design; superseded, see [Karkhana sandboxes](../../../v2/micro-services/execution-mode-services/karkhana-cluster-1/sandboxes.md)) | `sandbox-service-1` | TypeScript — Temporal Worker (Shared NS) | 2 | Isolated execution environments (code/browser/v1-test) via ephemeral K8s Jobs. All agent tool-call code execution runs here. |

### Phase 3 & 4 — Scale & Operations

| Service | Code | Type | Phase | One-liner |
|---------|------|------|-------|-----------|
| Observability Backend | `observability-backend` | TypeScript — Temporal Worker (Shared NS) | 3 | Business metrics aggregation (autonomous resolution rate, cost per resolution, skill adoption). Supplements Prometheus with KPI-level analytics. |
| Tenant Management | `tenant-management` | TypeScript — Temporal Worker (Shared NS) | 4 | Automates tenant lifecycle: provision Temporal + K8s namespaces, agent registry entries, Nexus routes, worker deployments. |

> **Agent Registry** is not a separate microservice. It is a PostgreSQL table (`agent_registry`) and a shared TypeScript library read at bootstrap by Comms Router 1 and all Agent Workers.

> **Future services** (not in v2.0 scope): A2A Gateway, Codegen Service, Connector/Integration Registry, Agent Evaluation Service, Admin UI Backend, Notification Service. See [future-services.md](future-services.md).

---

## Initial Agent Roster

The first de-v2 agents are internal to Budy. They handle work that is currently done manually by Budy staff.

| Agent ID | Domain | Primary Channel | Purpose |
|----------|--------|-----------------|---------|
| `support-agent` | Customer Support | Slack | Handles support requests from Budy staff and client contacts. Opens tickets, triages, resolves autonomously where possible, escalates with full context where not. |
| `report-agent` | Reporting & Analytics | Slack + Email | Builds and delivers scheduled reports. Answers ad-hoc data questions. Runs on-demand report generation. |
| `usercall-agent` | Customer Success | Slack | Manages user call scheduling, pre-call research, and post-call summaries and follow-ups. |

Client-side agents (one per enterprise client) follow in Phase 2 beta, running in isolated tenant namespaces.

---

## Platform Documents

| Document | Description | Status |
|----------|-------------|--------|
| [Platform PRD](platform-prd.md) | Goals, success metrics, user personas, phased timeline | Draft |
| [Platform Architecture HLD](../archive/autonomous-agent-architecture.md) | Full system architecture, Mermaid diagrams, end-to-end flows | v0.2 (to be renamed `platform-architecture.md`) |
| [v1 Platform Context](../de-v1-platform/v1-platform.md) | Generation 1 platform — what it does, how de-v2 uses it | Draft |
| ADRs | Architecture Decision Records | To be populated (ADR directory pending) |

---

## Temporal Namespace Model

```text
Temporal Cluster (self-hosted, EKS)
│
├── Namespace: platform  (shared services)
│     ├── Comms Router 1
│     ├── Memory Workflows (consolidation, approval)
│     ├── Skill Workflows (CRUD, approval)
│     ├── Gateway Activities (send Slack/Email responses)
│     └── LLM Activities (call LiteLLM proxy)
│
├── Namespace: budy-agents  (Budy internal — Phase 1)
│     ├── support-agent   [task queue: support-agent]
│     ├── report-agent    [task queue: report-agent]
│     └── usercall-agent  [task queue: usercall-agent]
│
└── Namespace: [client-x]-agents  (future — Phase 4)
      └── [client agent workers per tenant]
```

Nexus bridges the `platform` shared namespace to each tenant agent namespace. Shared services (Memory, Skill, LLM) serve all tenants — data isolation enforced via `tenant_id` in PostgreSQL and namespace-prefixed Redis keys.

---

## Kubernetes Namespace Model

```text
k8s Namespace: de-v2-platform  (shared services)
  ├── comms-gateway-1       Deployment, 2+ replicas, KEDA on request rate
  ├── comms-router-1-worker Deployment, 1+ replicas
  ├── memory-service-worker  Deployment, 1+ replicas
  ├── skill-service-worker   Deployment, 1+ replicas
  └── llm-router-1            Deployment, 2+ replicas (LiteLLM)

k8s Namespace: de-v2-budy-agents
  ├── support-agent         Deployment, 1 replica + KEDA on Temporal queue depth
  ├── report-agent          Deployment, 1 replica + KEDA
  └── usercall-agent        Deployment, 1 replica + KEDA

k8s Namespace: de-v2-[client-x]-agents  (future)
  └── [client agent workers]
```

---

## Persistence Overview

| Store | Purpose | Who Uses It |
|-------|---------|-------------|
| PostgreSQL | Agent registry, skills (versioned), episodic memories, core memories, thread context, audit log | All services |
| pgvector | Semantic memory vectors (embedded episodic facts) | Memory Service |
| Shared Redis | Working memory cache, skill hot-cache, thread context cache (TTL-based) | All agent workers |
| S3 | Conversation history archive (Claim Check for Temporal 2MB limit), large skill resources | Digital Entity 2, Skill Service |
| Vault | Secrets and API keys — injected via Vault Operator as env vars. No secrets in images. | All services |

---

## Nexus Operations Summary

### Exposed by `platform` shared namespace:

| Operation | Called By | Description |
|-----------|-----------|-------------|
| `memory.search(tenantId, agentId, query)` | Agent Workers | Semantic search over vector DB |
| `memory.store(tenantId, agentId, episode)` | Agent Workers | Store episodic memory |
| `skill.getForAgent(tenantId, agentId)` | Agent Workers (bootstrap) | Fetch approved skills |
| `gateway.sendResponse(channel, threadId, content)` | Agent Workers | Post reply to Slack/Email |

### Exposed by tenant agent namespaces:

| Operation | Called By | Description |
|-----------|-----------|-------------|
| `agent.executeTask(agentId, taskPayload)` | Comms Router 1 | Hand off a classified message to the correct agent |

---

## Open Questions (Platform Level)

| # | Question | Decision |
|---|----------|----------|
| 1 | pgvector vs Qdrant for semantic memory? | Start with pgvector (simpler, one less system). Revisit if memory volume or query latency becomes a concern. |
| 2 | Temporal Cloud vs self-hosted? | Self-hosted on EKS for now. Same cluster as v1. Temporal Cloud revisited if ops burden becomes significant. |
| 3 | Claude Agent SDK: use as library, fork tool execution, or skip? | Under evaluation. See `autonomous-agent-architecture.md` §6. Recommendation: start with direct Anthropic API via LiteLLM, bring in SDK MCP client if needed. |
| 4 | How does a de-v2 agent call a v1 mission? | Via v1 API Gateway HTTP call (simplest, requires `v1:trigger:mission:{id}` Auth permission) or via Temporal Nexus bridging to v1 shared namespace. To be decided in digital-entity-2 TRD. |
| 5 | A2A implementation timing? | Phase 4 / when external agent partner is identified. Comms Gateway 1 normalization is pluggable; Auth Service tokens are A2A-compatible from day 1. No refactor needed when A2A is activated. See [future-services.md](future-services.md). |
| 6 | Auth JWT signing: single Vault symmetric key or per-tenant asymmetric key pair? | To be decided in auth-service TRD. Per-tenant keys give stronger isolation; single key is simpler to operate. |
| 7 | Sandbox browser warm pool? | To be decided in sandbox-service-1 TRD. Warm pool reduces cold start but increases cost. Defer decision until browser sandbox usage patterns are known. |
