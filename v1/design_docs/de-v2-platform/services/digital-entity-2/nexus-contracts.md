---
name: Digital Entity 2 — Nexus Contracts
code: digital-entity-2-nexus
version: 0.1
status: draft — to be finalized in TRD
last_updated: 2026-04-11
---

# Digital Entity 2 — Nexus Contracts

> These are the Temporal Nexus operations Digital Entity 2 exposes and consumes. TypeScript interface definitions are indicative — finalize in TRD.

## Operations Exposed

### agent.executeTask

**Called by:** Comms Router 1 (in shared namespace)

**Description:** Execute a task assigned to this agent. This is the primary entry point for agent workers. The Comms Router 1 crosses namespace boundaries via Nexus to dispatch a task to a specific agent in a tenant namespace.

### Input:

```typescript
interface ExecuteTaskInput {
  agentId: string;
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
  taskId: string;           // Workflow execution ID
  accepted_at: string;      // ISO8601 timestamp
}
```

### Error Handling:

- Throws `AgentNotReadyError` (worker initializing or unhealthy)
- Throws `NamespaceError` (namespace misconfiguration)
- No retries at Nexus level; Router decides retry strategy

### SLA / Expectations:

- Target latency: < 500ms (Nexus dispatch + workflow start)
- Timeout: 30s (max wait for workflow to acknowledge task)
- Fire-and-forget semantics: task execution is asynchronous; results posted back via agent responses

## Operations Consumed

### From shared namespace services:

### memory.search (Memory Service)

**Called by:** Digital Entity 2 (in loadContext activity)

### Input:

```typescript
interface MemorySearchInput {
  agent_id: string;
  tenant_id: string;
  query: string;
  top_k: number;  // e.g., 5
}
```

### Output:

```typescript
interface MemorySearchOutput {
  memories: Array<{
    id: string;
    content: string;
    similarity_score: number;
  }>;
}
```

### memory.getCore (Memory Service)

**Called by:** Digital Entity 2 (in loadContext activity)

### Input:

```typescript
interface GetCoreMemoryInput {
  agent_id: string;
}
```

### Output:

```typescript
interface GetCoreMemoryOutput {
  core_memories: Array<{
    id: string;
    content: string;
    approved_at: string;
  }>;
}
```

### memory.store (Memory Service)

**Called by:** Digital Entity 2 (in saveEpisodicMemory activity)

### Input:

```typescript
interface StoreMemoryInput {
  agent_id: string;
  tenant_id: string;
  episode: {
    message: string;
    response: string;
    tools_used: string[];
    outcome: string;  // 'success' | 'partial' | 'failed'
    timestamp: string;
  };
}
```

### Output:

```typescript
interface StoreMemoryOutput {
  memory_id: string;
}
```

### skill.getForAgent (Skill Service)

**Called by:** Digital Entity 2 (in loadContext activity, or via init container)

### Input:

```typescript
interface GetSkillsInput {
  agent_id: string;
  tenant_id: string;
}
```

### Output:

```typescript
interface GetSkillsOutput {
  skills: Array<{
    id: string;
    name: string;
    description: string;
    content: string;  // SKILL.md format
    required_permissions: string[];
  }>;
}
```

### gateway.sendResponse (Comms Gateway 1)

**Called by:** Digital Entity 2 (in sendResponse activity)

### Input:

```typescript
interface SendResponseInput {
  channel: "slack" | "email";
  threadId: string;
  content: string;
  tenantId: string;
}
```

### Output:

```typescript
interface SendResponseOutput {
  messageId: string;
  sentAt: string;
}
```

## Notes

- **Namespace Isolation**: Digital Entity 2 runs in a tenant namespace (e.g., `tenant-{tenant_id}`). It makes Nexus calls into the shared namespace to access Memory, Skill, and Gateway services. This provides isolation: agents from different tenants never directly interact.
- **Continue-As-New**: When conversation history approaches size limits, digital entity 2 archives to S3 and continues workflow. The Nexus contract remains the same; only internal workflow state changes.
- **Tool Execution**: Tool/skill execution is internal to the digital entity 2; it does not use Nexus. Skills are fetched once and cached.
- **Idempotency**: Nexus calls should be idempotent. If agent.executeTask is retried, task IDs should be reused or managed carefully.
- **SLA Visibility**: Agent worker exports Prometheus metrics for context loading latency, LLM call latency, and tool execution time. Shared services should also export similar metrics for end-to-end latency visibility.
