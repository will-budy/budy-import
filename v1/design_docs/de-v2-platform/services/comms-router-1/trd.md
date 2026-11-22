---
name: Comms Router 1 — TRD
code: comms-router-1-trd
version: 0.1
status: stub — detailed design pending
last_updated: 2026-04-11
---

# Comms Router 1 — Technical Reference Document

> ⚠️ This document is a stub. Detailed technical design to be completed in a dedicated design thread per service.

## Implementation Language & Framework

### Decided:

- Language: TypeScript (Temporal SDK)
- Temporal SDK: @temporalio/client + @temporalio/worker
- HTTP client: axios (for LiteLLM calls)
- Database: node-postgres (pg) for PostgreSQL
- Caching: node-redis for optional in-memory/Redis agent catalog caching
- Logging: Winston, structured JSON

## Configuration

### Environment variables:

- `TEMPORAL_NAMESPACE`: Shared namespace (e.g., `de-v2-platform`)
- `TEMPORAL_FRONTEND_ADDR`: `temporal-frontend:7233`
- `TEMPORAL_TASK_QUEUE`: `router.default` (task queue for this workflow)
- `POSTGRES_DSN`: PostgreSQL connection string
- `LITELLM_API_URL`: LiteLLM proxy URL (e.g., `http://llm-router-1:8000`)
- `LITELLM_MODEL_INTENT`: Model name for intent classification (e.g., `claude-3-5-haiku-20241022`)
- `REDIS_ADDR`: Optional Redis for caching (skip if not using cache)
- `PROMETHEUS_ADDR`: Metrics scrape endpoint
- `LOG_LEVEL`: debug | info | warn | error

[TODO: Define validation, defaults, and error handling for all env vars]

## Database Schemas

### agent_bindings:

```sql
CREATE TABLE agent_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,  -- 'slack' | 'email'
  channel_id TEXT NOT NULL,  -- Slack channel ID or email address
  agent_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, channel, channel_id)
);

CREATE INDEX idx_binding_lookup ON agent_bindings(tenant_id, channel, channel_id);
```

### thread_context:

```sql
CREATE TABLE thread_context (
  thread_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_thread_tenant ON thread_context(tenant_id);
CREATE INDEX idx_thread_active ON thread_context(last_active_at);
```

### agent_registry:

```sql
CREATE TABLE agent_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',  -- 'active' | 'inactive' | 'deprecated'
  tenant_namespace TEXT NOT NULL,  -- Temporal namespace for this agent
  task_queue TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_tenant_status ON agent_registry(tenant_id, status);
```

[TODO: Expand with all required fields, indexes, and constraints]

## Workflow Definition

### Input:

```typescript
interface RouterWorkflowInput {
  message: AgentMessage;
}
```

### Output:

```typescript
interface RouterWorkflowOutput {
  routed_agent_id: string;
  routing_method: "explicit" | "thread_continuity" | "intent_classification" | "fallback";
  routed_at: string;  // ISO8601
}
```

[TODO: Define detailed workflow state machine, decision points, and error recovery]

## Activity Definitions

### lookupExplicitBinding(tenantId, channel, channelId):

```typescript
// Returns agent_id or null
// Timeout: 2 seconds
// Retry: 2x on transient failure
```

### lookupThreadContinuity(threadId, tenantId):

```typescript
// Returns agent_id or null
// Checks for recent activity (< 7 days)
// Timeout: 2 seconds
```

### getAvailableAgents(tenantId):

```typescript
// Returns [AgentMetadata]
// Caches result in memory or Redis (TTL: 1 hour)
// Timeout: 3 seconds
```

### classifyIntentLLM(message, agentCatalog):

```typescript
// Calls LiteLLM with Haiku
// Returns { agent_id, confidence: number }
// Timeout: 5 seconds
// Retry: 1x on transient failure
```

### updateThreadContext(threadId, tenantId, agentId):

```typescript
// Upserts into thread_context
// Updates last_active_at and increments message_count
// Timeout: 2 seconds
```

[TODO: Define detailed signatures, error handling, and retry policies for each activity]

## Error Handling & Retry Strategy

### Activity retry policies:

- Database activities (binding, continuity, agents): Retry 2x, exponential backoff, max 5s
- LLM classification: Retry 1x, exponential backoff, max 10s
- Nexus dispatch: No retry at workflow level (delegated to Nexus timeout policy)
- Fallback response: Retry 2x, exponential backoff

### Workflow-level error handling:

- If explicit binding lookup fails (DB error): Log warning, proceed to thread continuity
- If all activities fail: Execute fallback response and complete workflow
- If Nexus dispatch fails: Log error, emit alert, execute fallback response

[TODO: Define detailed error codes, handling strategies, and alert conditions]

## Performance Characteristics

### Targets:

- End-to-end routing latency: < 500ms p50, < 1s p99
- Explicit binding lookup: < 50ms
- Thread continuity lookup: < 50ms
- Intent classification (LLM): < 400ms (including network latency)
- Throughput: 1,000+ workflows/s in shared namespace

[TODO: Define performance testing strategy and monitoring thresholds]

## Testing Strategy

[TODO: Unit tests for decision logic, integration tests with test databases and mock LLM, e2e tests with test Temporal server]

- Unit: Decision logic (binding > continuity > classification > fallback)
- Integration: Test with embedded PostgreSQL (testcontainers) and mock LiteLLM
- E2e: Full workflow execution using Temporal test server

## Deployment Configuration

[TODO: K8s Deployment for comms-router-1-worker]

```yaml
# deployment.yaml (stub)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: comms-router-1-worker
  namespace: de-v2-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: comms-router-1-worker
  template:
    metadata:
      labels:
        app: comms-router-1-worker
    spec:
      serviceAccountName: comms-router-1-worker
      containers:
      - name: worker
        image: de-v2/comms-router-1-worker:latest
        env:
        - name: TEMPORAL_NAMESPACE
          value: de-v2-platform
        - name: TEMPORAL_FRONTEND_ADDR
          value: temporal-frontend:7233
        # ... other env vars from Vault
        resources:
          requests:
            memory: 256Mi
            cpu: 200m
          limits:
            memory: 512Mi
            cpu: 500m
```

[TODO: Complete Helm chart, RBAC, network policies, and service account]

## Observability

### Prometheus metrics:

- `router_workflow_decisions_total` — Counter by routing method (explicit, continuity, classification, fallback)
- `router_workflow_duration_seconds` — Histogram of end-to-end routing latency
- `router_activity_duration_seconds` — Histogram per activity type (binding lookup, LLM, etc.)
- `router_agent_selection_errors_total` — Counter of failed routing decisions

### Log fields:

- `workflow_id`, `run_id` (Temporal metadata)
- `tenant_id`, `thread_id`, `sender_id`
- `selected_agent_id`, `routing_method`
- `duration_ms`, `error` (if applicable)

[TODO: Define trace spans, custom metrics, and Grafana dashboard queries]
