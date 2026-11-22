---
name: Digital Entity 2 — TRD
code: digital-entity-2-trd
version: 0.1
status: stub — detailed design pending
last_updated: 2026-04-11
---

# Digital Entity 2 — Technical Reference Document

> ⚠️ This document is a stub. Detailed technical design to be completed in a dedicated design thread per service.

## Implementation Language & Framework

### Decided:

- Language: TypeScript (Temporal SDK, LLM integration, tool execution)
- Temporal SDK: @temporalio/client + @temporalio/worker
- LLM client: @anthropic-ai/sdk (for Claude) or axios (via LiteLLM proxy)
- Database: node-postgres (pg) for PostgreSQL
- Caching: node-redis for Redis
- Logging: Winston, structured JSON
- Tool execution: Subprocess + sandboxed runtime (depends on skill type)

## Configuration

### Environment variables:

- `AGENT_ID`: Agent identifier (e.g., `support-agent-v1`)
- `AGENT_NAME`: Human-readable agent name (e.g., `Support Agent`)
- `TENANT_ID`: Tenant identifier (extracted from namespace or injected)
- `TEMPORAL_NAMESPACE`: Tenant namespace (e.g., `tenant-{tenant_id}`)
- `TEMPORAL_FRONTEND_ADDR`: `temporal-frontend:7233`
- `TEMPORAL_TASK_QUEUE`: Agent task queue name (e.g., `agent.support-agent-v1`)
- `POSTGRES_DSN`: PostgreSQL connection string
- `REDIS_ADDR`: Redis address (e.g., `redis:6379`)
- `LITELLM_API_URL`: LiteLLM proxy URL (e.g., `http://llm-router-1:8000`)
- `LITELLM_MODEL_REASONING`: Model for complex reasoning (e.g., `claude-3-5-opus-20241022`)
- `LITELLM_MODEL_CODING`: Model for coding tasks (e.g., `claude-3-5-sonnet-20241022`)
- `LITELLM_MODEL_FAST`: Model for fast classification (e.g., `claude-3-5-haiku-20241022`)
- `MEMORY_SERVICE_NAMESPACE`: Shared namespace where Memory Service runs (e.g., `de-v2-platform`)
- `SKILL_SERVICE_NAMESPACE`: Shared namespace where Skill Service runs (e.g., `de-v2-platform`)
- `GATEWAY_NAMESPACE`: Shared namespace where Comms Gateway 1 runs (e.g., `de-v2-platform`)
- `PROMETHEUS_ADDR`: Metrics endpoint (e.g., `0.0.0.0:8081`)
- `LOG_LEVEL`: debug | info | warn | error
- `MAX_HISTORY_SIZE_KB`: Max conversation history size before continue-as-new (default: 2000)
- `CONTEXT_WINDOW_KB`: Max context to include in LLM call (default: 100)

[TODO: Finalize env schema, validation, and secret injection from Vault]

## Database Schemas

### agent_registry (read-only from agent perspective):

```sql
CREATE TABLE agent_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,  -- Custom system instructions for this agent
  model_tier TEXT DEFAULT 'reasoning',  -- 'reasoning' | 'coding' | 'fast'
  status TEXT DEFAULT 'active',
  tenant_namespace TEXT NOT NULL,
  task_queue TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### thread_context (agent writes last_active_at, message_count):

```sql
CREATE TABLE thread_context (
  thread_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

[TODO: Define full schema with all required fields and constraints]

## Workflow Definitions

### AgentTaskWorkflow:

```typescript
interface AgentTaskWorkflowInput {
  tenant_id: string;
  message: AgentMessage;
  thread_id: string;
  sender_id: string;
  channel: "slack" | "email" | "webhook";
}

async function AgentTaskWorkflow(input: AgentTaskWorkflowInput): Promise<void> {
  // 1. Load context (memories, skills, history)
  // 2. Loop: Call LLM → process tool calls → iterate
  // 3. Send response
  // 4. Save episodic memory
  // 5. Update thread context
}
```

[TODO: Define detailed state machine, decision points, error handling]

## Activity Definitions

### loadContext:

```typescript
interface LoadContextInput {
  agent_id: string;
  tenant_id: string;
  thread_id: string;
  sender_id: string;
}

interface LoadContextOutput {
  core_memories: string;
  episodic_memories: string;
  thread_history: string;
  available_skills: SkillMetadata[];
  system_prompt: string;
}
```

Timeout: 5s, Retries: 2x

### callLLM:

```typescript
interface CallLLMInput {
  model_tier: "reasoning" | "coding" | "fast";
  messages: Array<{ role: string; content: string }>;
  tools: Array<{ name: string; description: string; input_schema: object }>;
  system_prompt: string;
}

interface CallLLMOutput {
  content: string;
  tool_calls?: Array<{ id: string; name: string; input: object }>;
  stop_reason: "end_turn" | "tool_use";
}
```

Timeout: 30s, Retries: 1x on transient failure

### executeTool:

```typescript
interface ExecuteToolInput {
  skill_id: string;
  tool_name: string;
  input: object;
}

interface ExecuteToolOutput {
  result: string;
  error?: string;
}
```

Timeout: 60s, Retries: 1x

### sendResponse:

Calls `gateway.sendResponse` Nexus operation.
Timeout: 3s, Retries: 2x

### saveEpisodicMemory:

Calls `memory.store` Nexus operation.
Timeout: 2s, Retries: 1x

### updateThreadContext:

Direct PostgreSQL update.
Timeout: 1s, Retries: 2x

[TODO: Expand all activity signatures with detailed error handling]

## Error Handling & Retry Strategy

### Activity-level retries:

- Context loading (transient): Retry 2x, exponential backoff
- LLM call (transient): Retry 1x on 429/500/503
- Tool execution: Retry 1x
- Response posting: Retry 2x
- Memory saving: Retry 1x

### Workflow-level error handling:

- If context loading fails: Fail workflow, trigger admin alert
- If LLM call fails after retries: Use fallback model (Haiku) or report error to user
- If tool execution fails: Log error, continue with failure message to LLM
- If response posting fails: Log error, attempt fallback (direct user notification)
- If memory saving fails: Log error (non-critical; memory loss acceptable)

[TODO: Define detailed error codes, fallback strategies, and circuit breakers]

## Performance Characteristics

### Targets:

- Task completion: < 10s p50 (simple response), < 30s p50 (with tools), < 2m p99
- Context loading: < 1s
- LLM inference: < 20s (including network)
- Tool execution: < 60s
- Throughput: 100+ tasks/s per tenant namespace (depends on task queue replicas)

[TODO: Define performance testing strategy and SLA thresholds]

## Testing Strategy

[TODO: Unit tests for context loading, LLM prompting, tool execution; integration tests with test Temporal server and mock services; e2e tests with test agent tasks]

- Unit: Prompt formatting, tool call parsing, error handling
- Integration: Full workflow with test Temporal server, mock Memory/Skill services
- E2e: Real Temporal cluster, test agent in test tenant namespace

## Deployment Configuration

[TODO: K8s Deployment, init container, emptyDir volume, RBAC, service account]

```yaml
# deployment.yaml (stub)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: digital-entity-2-support
  namespace: tenant-${TENANT_ID}
spec:
  replicas: 1  # KEDA will scale based on task queue depth
  selector:
    matchLabels:
      app: digital-entity-2-support
      agent: support-agent
  template:
    metadata:
      labels:
        app: digital-entity-2-support
        agent: support-agent
    spec:
      serviceAccountName: digital-entity-2-support
      initContainers:
      - name: init-agent
        image: de-v2/digital-entity-2:latest
        command: ["node", "dist/init.js"]
        env:
        - name: AGENT_ID
          value: support-agent
        - name: TENANT_ID
          value: ${TENANT_ID}
        # ... other env vars from ConfigMap/Secret
        volumeMounts:
        - name: scratch
          mountPath: /tmp/agent-scratch
      containers:
      - name: worker
        image: de-v2/digital-entity-2:latest
        env:
        - name: AGENT_ID
          value: support-agent
        - name: TENANT_ID
          value: ${TENANT_ID}
        # ... other env vars
        resources:
          requests:
            memory: 512Mi
            cpu: 300m
          limits:
            memory: 1Gi
            cpu: 1000m
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - name: scratch
          mountPath: /tmp/agent-scratch
      volumes:
      - name: scratch
        emptyDir:
          sizeLimit: 1Gi
```

[TODO: Complete Helm chart, HPA/KEDA config, network policies]

## Observability

### Prometheus metrics:

- `agent_task_duration_seconds` — Histogram of task completion time
- `agent_llm_call_duration_seconds` — Histogram of LLM inference latency
- `agent_tool_execution_duration_seconds` — Histogram of tool execution time
- `agent_tasks_total` — Counter of tasks completed, by status
- `agent_tool_calls_total` — Counter of tool invocations, by tool name and status
- `agent_memory_recalls` — Counter of memory searches, by success/miss

### Log fields:

- `workflow_id`, `run_id` (Temporal metadata)
- `agent_id`, `tenant_id`, `thread_id`, `sender_id`
- `task_duration_ms`, `context_load_ms`, `llm_call_ms`
- `tools_used`, `memory_recalls`, `error` (if applicable)

[TODO: Define trace spans, custom dashboards, alerting rules]
