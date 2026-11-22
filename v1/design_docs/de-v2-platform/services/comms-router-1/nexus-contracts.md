---
name: Comms Router 1 — Nexus Contracts
code: comms-router-1-nexus
version: 0.1
status: draft — to be finalized in TRD
last_updated: 2026-04-11
---

# Comms Router 1 — Nexus Contracts

> These are the Temporal Nexus operations the Comms Router 1 consumes. TypeScript interface definitions are indicative — finalize in TRD.

## Operations Exposed

**None.** Comms Router 1 does not expose Nexus operations; it is invoked directly by Comms Gateway 1 via `startWorkflow()`.

## Operations Consumed

### agent.executeTask (Nexus call into tenant namespace)

**Called by:** Comms Router 1 (in shared namespace)

**Target:** Tenant agent namespace (dynamic, per tenant)

**Description:** Dispatch a routing decision to a specific digital entity 2. The Comms Router 1 crosses the namespace boundary via Nexus to reach the agent in its isolated tenant namespace.

### Input:

```typescript
interface ExecuteTaskInput {
  agentId: string;          // Agent identifier
  taskPayload: AgentTaskPayload;
}

interface AgentTaskPayload {
  tenant_id: string;
  message: AgentMessage;
  thread_id: string;
  sender_id: string;
  channel: "slack" | "email" | "webhook";
}
```

### Output:

```typescript
interface ExecuteTaskOutput {
  taskId: string;           // Workflow/task ID for tracking
  accepted_at: string;      // ISO8601
}
```

### Error Handling:

- Throws `AgentNotFoundError` (agent_id does not exist in tenant namespace)
- Throws `NamespaceNotFoundError` (tenant namespace does not exist)
- Throws `Timeout` (agent namespace is unresponsive)
- Router catches errors and executes fallback response

### SLA / Expectations:

- Target latency: < 500ms p50 (blocking Nexus call)
- Timeout: 30s (max wait for agent to accept task)
- No retries at Nexus level; Router decides whether to retry or fallback

## Notes

- **Namespace Isolation**: Router (in shared namespace) calls into tenant-specific namespaces. Each tenant's agents run isolated in their own Temporal namespace, providing strong isolation.
- **Fire-and-Forget Semantics**: After `agent.executeTask` returns successfully, the agent begins processing. Router does not wait for task completion; task completion is signaled back via digital entity 2's normal response channels (gateway.sendResponse).
- **Multi-tenant**: Router must construct the correct tenant namespace name before making the Nexus call. Namespace name pattern: `tenant-{tenant_id}`.
- **Future**: If agent selection needs revision (e.g., agent timeout), Router signals are not yet defined. This could be added in v2 contracts for dynamic agent reassignment.
