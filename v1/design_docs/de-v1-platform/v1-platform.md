---
name: v1 Consultant Platform (Generation 1)
code: v1-platform
version: 1.x (production)
status: active
owner: Budy Engineering
last_updated: 2026-04-11
---

# v1 Consultant Platform — Context Document

## What is v1?

The v1 Consultant Platform is Budy's first-generation Digital Entity infrastructure. It executes deterministic Temporal workflows — called **Missions** — authored by Budy consultants through a design and workshop process. V1 is production-stable, serving 3 enterprise clients with over 100 end users as of Q2 2026.

V1 workflows are reliable, cost-efficient, and highly repeatable. They use LLM calls and tool calls within a fixed, human-authored structure — but the workflow logic itself is deterministic: the same inputs produce the same outputs. There is no dynamic reasoning loop or conversational interface.

**V1 is not being replaced by V2.** The de-v2 platform adds an autonomous agent layer on top of v1. V2 agents can call V1 execution services as tools, combining V1's reliability for known tasks with V2's adaptive reasoning for novel situations. This keeps v1 costs low and preserves its reliability guarantees.

---

## Business Context

Budy's product is AI Digital Teammates for enterprise clients. The focus is Sales & Marketing workflows for a specific vertical: **Senior Living operators in the US**. Budy operates as both the platform builder and the implementation consultant — running design workshops, interviewing domain experts, authoring missions, and deploying entities for each client.

Each enterprise client has one Digital Entity deployed. That entity interacts with the client's sales and operations teams through their existing tools (CRM, marketing platforms, email).

**Long-term vision:** Digital Entities should be like a computer — a client buys one, installs domain-specific capabilities (skills/missions), and trains/customizes it over time. V1 is the foundation. V2 adds the learning and conversation layer.

---

## Current Capabilities (as of Q2 2026)

### What V1 Digital Entities do today

- **CRM task creation**: Generate tasks for sales reps based on trigger events (schedules, CRM record changes, inbound webhooks from client systems)
- **Marketing campaign management**: Adjust campaign subscription status for contacts based on CRM record state (e.g., move prospect to nurture sequence when marked as "not ready")
- **Reporting**: Email weekly and monthly summaries and reports to designated users
- **Task execution**: Accept tasks assigned by users via the CRM, execute them (CRM updates, email actions), and reply back with results
- **Consistent persona**: Each enterprise's entity uses a shared personality prompt across all missions — same tone and style regardless of which mission runs

### What V1 Digital Entities do NOT do today

- Chat natively — no Slack or Email conversational interface
- Learn from interactions — no memory consolidation or skill proposal
- Self-modify — missions cannot be updated by the entity itself
- Reason dynamically — all logic is pre-authored by a consultant

---

## How Missions Are Built (The V1 Consulting Process)

1. **Design workshops**: Budy consultants run structured sessions with client domain experts (e.g., senior living sales directors)
2. **Expert interviews**: Recorded and transcribed — capturing how tasks are done, what decisions are made, what information is needed
3. **Mission authoring**: Consultants use AI coding tools (Cursor, Claude Code) to author Temporal workflows and activities based on the transcripts
4. **A Mission = a parent Temporal workflow** with child workflows and activities (tool calls, LLM reasoning steps)
5. **A Role = a group of Missions** assigned to one Digital Entity

All current implementation, training, development, customer support, and mission updates are done by humans (AI-assisted, but human-executed).

---

## V1 Architecture

V1 is divided into two service groups: **Design Services** and **Execution Services**.

### Design Services

Design Services are the internal tooling Budy consultants use to author and publish Digital Entity missions.

### Workflow & Activity Editor:

- UI-based editor for creating and modifying Temporal workflows (Missions) and Temporal activities (tool calls, LLM prompt calls, integrations)
- Workflows and activities are separate, reusable records — an activity can be shared across multiple missions
- Git-style versioning in PostgreSQL: all revisions retained, full audit history queryable
- Missions reference specific activity versions for reproducibility

### Connection & Credentials Management:

- Stores integration settings for each client's SaaS systems (CRM, marketing platforms, Google Workspace)
- Per-tenant credential management with appropriate access controls

### Publishing:

- Consultant marks a parent workflow as a publishable automation
- Automation type: `webhook-triggered` (fires on external event) or `scheduled` (cron-based)
- On publish: a Temporal worker container image is built → a K8s Deployment is created or updated
- **Two worker pool modes:**
  - **Dedicated worker**: one K8s Deployment per workflow automation. All workflows and activities for that mission run on this worker. Higher isolation, higher resource cost. Used for high-priority or sensitive missions.
  - **Shared worker**: multiple workflow automations served by a single Temporal worker Deployment. More cost-efficient, appropriate for lower-traffic or lower-criticality missions.

### Execution Services

Execution Services are the runtime infrastructure that receives triggers and executes published missions.

### API Gateway (Webhook Surface):

- The only REST-facing component of v1
- Receives inbound webhooks from client systems (CRM events, marketing triggers, etc.)
- Triggers the internal `executeConsultantWorkflow` in Temporal
- Also handles outbound: posting replies back to client systems

### Supervisor Services:

- Temporal workers that serve `executeConsultantWorkflow`
- Responsibilities:
  - Identify the correct Temporal task queue for the target mission
  - Start the consultant workflow on the correct task queue
  - Scale worker deployments up/down on-demand, or hand off to KEDA for autoscaling
- Conceptually similar to AWS Lambda's invocation layer: receive invocation → cold-start worker if needed → execute mission

### SharedConsultantWorker1:

- Temporal worker providing shared activities callable by any consultant workflow
- Activities include:
  - **Prompt calls**: LLM invocations using saved, versioned prompts (reasoning steps within missions)
  - **Memory calls**: Read/write operations against the V1 Memory System

### V1 Memory System

### Flex Memory:

- Client-defined schema within platform-imposed constraints (max fields per type)
- Used for client-specific state that doesn't map to a standard entity
- Example: custom attributes about a sales prospect not available in the CRM schema

### Structured Memory:

- Fixed schema aligned to standard entities (e.g., Salesforce task records, contact records, campaign membership)
- Used when the data model is well-known, stable, and shared across missions

### Storage:

- PostgreSQL with multi-tenant tables and Row-Level Security (RLS)
- Each tenant's data is logically isolated at the row level within shared tables
- No separate databases per tenant — isolation is enforced at the query level

---

## Operational Reality (Q2 2026)

| Metric | Value |
|--------|-------|
| Enterprise clients | 3 |
| Active end users | 100+ |
| Digital Entities in production | 3 (one per client) |
| Implementation model | Manual: consultants run workshops, author missions, deploy |
| Ongoing ops | Manual: support, mission updates, report improvements — AI-assisted but human-executed |
| Conversational interface | None (CRM task assignment only) |

**The scaling constraint:** As client count grows, every support request, mission update, and report improvement requires manual human effort. V2's first mandate is to automate Budy's own internal operations (support, reporting, user call management), freeing consultants to focus on higher-value design work and demonstrating the v2 capability before rolling it out to clients.

---

## How de-v2 Platform Uses v1

V2 agents (de-v2-platform) can call V1 services as tools in two ways:

### 1. Trigger a V1 Mission via V1 API Gateway:

The V2 agent constructs a webhook payload and calls the V1 gateway to kick off a known, reliable workflow. Appropriate when the task maps cleanly to an existing mission and deterministic execution is preferred over LLM reasoning.

### 2. Call V1 Shared Activities via Temporal Nexus:

For lower-level operations (memory reads, prompt calls against saved prompts), V2 may bridge directly to V1 Temporal activities via Nexus rather than going through the HTTP gateway. This avoids the overhead of the full mission execution path for lightweight operations.

### Why this matters for cost and reliability:

V2 LLM reasoning is more expensive and less predictable than V1 deterministic execution. When a V2 agent recognizes that a task maps to a known V1 mission (e.g., "send the weekly report for client X"), it should delegate to V1 rather than reasoning through the task itself. This keeps per-task costs down and leverages V1's reliability for high-volume, repeatable work.

---

## V1 Technology Summary

| Component | Choice |
|-----------|--------|
| Orchestration | Temporal (self-hosted on EKS) |
| Languages | TypeScript (missions, activities) |
| Worker model | K8s Deployments (dedicated or shared) |
| Autoscaling | KEDA on Temporal task queue depth |
| Memory storage | PostgreSQL with RLS (multi-tenant) |
| Secrets | Vault + Vault Operator |
| Infra | AWS EKS, Istio, Karpenter, Prometheus |
| LLM calls | Via SharedConsultantWorker1 (saved prompt activities) |
