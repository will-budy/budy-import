---
name: Memory Service — TRD
code: memory-service-trd
version: 0.1
status: stub — detailed design pending
last_updated: 2026-04-11
---

# Memory Service — Technical Reference Document

> ⚠️ This document is a stub. Detailed technical design to be completed in a dedicated design thread per service.

## Implementation Language & Framework

### Decided:

- Language: TypeScript (Temporal SDK, PostgreSQL queries, LLM integration)
- Temporal SDK: @temporalio/client + @temporalio/worker
- Database: node-postgres (pg) for PostgreSQL + pgvector extension
- Caching: node-redis for Redis
- Vector embeddings: @anthropic-ai/sdk (or via LiteLLM proxy)
- LLM calls: axios (via LiteLLM proxy)
- Logging: Winston, structured JSON

## Configuration

### Environment variables:

- `TEMPORAL_NAMESPACE`: Shared namespace (e.g., `de-v2-platform`)
- `TEMPORAL_FRONTEND_ADDR`: `temporal-frontend:7233`
- `TEMPORAL_TASK_QUEUE`: `memory.default`
- `POSTGRES_DSN`: PostgreSQL connection string (must have pgvector extension)
- `REDIS_ADDR`: Redis address (e.g., `redis:6379`)
- `LITELLM_API_URL`: LiteLLM proxy URL
- `LITELLM_MODEL_EXTRACTION`: Model for fact extraction (e.g., `claude-3-5-haiku-20241022`)
- `LITELLM_MODEL_EMBEDDING`: Model for embeddings (if using Claude embeddings API)
- `SLACK_BOT_TOKEN`: Slack token for core memory approval notifications (Vault)
- `SLACK_ADMIN_CHANNEL`: Slack channel ID for approvals (e.g., `C12345678`)
- `CONSOLIDATION_CRON`: Cron expression for consolidation schedule (e.g., `0 */4 * * *` for every 4h)
- `CONSOLIDATION_BATCH_SIZE`: Episodic batch size for LLM (default: 100)
- `IMPORTANCE_THRESHOLD`: Score threshold for core memory approval (default: 0.7)
- `VECTOR_DIMENSIONS`: Embedding vector size (default: 1536 for Anthropic)
- `PROMETHEUS_ADDR`: Metrics endpoint
- `LOG_LEVEL`: debug | info | warn | error

[TODO: Finalize env validation and secret injection]

## Database Schemas

### episodic_memories:

```sql
CREATE TABLE episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  thread_id TEXT,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  tools_used TEXT[],
  outcome TEXT,  -- 'success' | 'partial' | 'failed'
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episodic_tenant_agent ON episodic_memories(tenant_id, agent_id);
CREATE INDEX idx_episodic_processed ON episodic_memories(processed);
CREATE INDEX idx_episodic_created_desc ON episodic_memories(created_at DESC);
```

### semantic_memories:

```sql
CREATE TABLE semantic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  importance_score FLOAT DEFAULT 0.5,
  vector VECTOR(1536),
  source_episode_id UUID REFERENCES episodic_memories(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_semantic_tenant_agent ON semantic_memories(tenant_id, agent_id);
CREATE INDEX idx_semantic_vector ON semantic_memories USING ivfflat (vector vector_cosine_ops);
```

### core_memories:

```sql
CREATE TABLE core_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_core_tenant_agent ON core_memories(tenant_id, agent_id);
CREATE INDEX idx_core_approved_at ON core_memories(approved_at DESC);
```

### rejected_memories:

```sql
CREATE TABLE rejected_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  rejected_by TEXT NOT NULL,
  rejected_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

[TODO: Add all required fields, constraints, partitioning for large tables]

## Activity Definitions

### store:

```typescript
interface StoreInput {
  agent_id: string;
  tenant_id: string;
  episode: {
    message: string;
    response: string;
    tools_used?: string[];
    outcome: "success" | "partial" | "failed";
    thread_id?: string;
  };
}

// Returns: { memory_id: string }
```

Timeout: 2s, Retries: 2x

### search:

```typescript
interface SearchInput {
  agent_id: string;
  tenant_id: string;
  query: string;
  top_k: number;  // default 5
}

// Returns: { memories: [{ id, content, similarity_score }] }
```

Timeout: 3s, Retries: 1x

### getCore:

```typescript
interface GetCoreInput {
  agent_id: string;
  tenant_id: string;
}

// Returns: { core_memories: [{ id, fact, approved_at }] }
```

Timeout: 1s, Retries: 1x (with Redis fallback)

### getSessionContext:

```typescript
interface GetSessionContextInput {
  thread_id: string;
  tenant_id: string;
  limit: number;  // e.g., 10 messages
}

// Returns: { history: string }  // Formatted conversation text
```

Timeout: 2s, Retries: 1x

### extractFactsLLM:

```typescript
interface ExtractFactsInput {
  episodes: Array<{ message: string; response: string }>;
  agent_id: string;
}

// Returns: { facts: [{ content: string; importance: number }] }
```

Timeout: 5s, Retries: 1x

### deduplicateFacts:

```typescript
interface DeduplicateInput {
  facts: Array<{ content: string; importance: number }>;
  tenant_id: string;
  agent_id: string;
  similarity_threshold: number;  // default 0.8
}

// Returns: { unique_facts: [{ content: string; importance: number }] }
```

Timeout: 3s, Retries: 1x

### upsertSemantic:

```typescript
interface UpsertSemanticInput {
  facts: Array<{ content: string; importance: number }>;
  tenant_id: string;
  agent_id: string;
  source_episode_ids: string[];
}

// Returns: { count: number }  // Number of memories upserted
```

Timeout: 2s, Retries: 1x

[TODO: Define all detailed signatures, error handling, and retry policies]

## Workflow Definitions

### Consolidation Workflow:

```typescript
// Triggered by cron schedule
// Input: { tenant_id: string; agent_id: string }
// No output
```

[TODO: Define detailed state machine, error handling, backpressure]

### Core Memory Approval Workflow:

```typescript
// Triggered by Consolidation Workflow when high-importance fact found
// Input: { fact: string; importance: number; agent_id: string; tenant_id: string }
// Output: { approved: boolean; note?: string }
```

[TODO: Define signal schema, timeout for approval, escalation policy]

## Error Handling & Retry Strategy

### Activity-level:

- Store: Retry 2x on transient DB error, fail fast on constraint violation
- Search: Retry 1x on vector search timeout
- LLM extraction: Retry 1x on 429/500, fail after 2x
- Core memory approval: No retries (workflow-level); timeout after 7 days

### Workflow-level:

- Consolidation: If activity fails, log error and continue to next batch
- Core memory approval: If approval times out, escalate to second admin, or auto-reject

[TODO: Define detailed error codes, circuit breakers, and alert conditions]

## Performance Characteristics

### Targets:

- Memory storage (store): < 100ms latency
- Memory search (top-5): < 500ms p50, < 1s p99 (includes vector search)
- Core memory fetch: < 50ms (from Redis cache)
- Session context fetch: < 200ms
- LLM fact extraction: < 5s (batch of 100 episodes)
- Consolidation cycle: < 30s for 1000 episodes

[TODO: Define performance testing strategy and monitoring]

## Testing Strategy

[TODO: Unit tests for memory logic, integration tests with test PostgreSQL and pgvector, e2e with Temporal test server]

- Unit: Deduplication logic, importance scoring
- Integration: Full consolidation cycle with test data
- E2e: Real Temporal workflow execution

## Deployment Configuration

[TODO: K8s Deployment for memory-service-worker]

```yaml
# deployment.yaml (stub)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: memory-service-worker
  namespace: de-v2-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: memory-service-worker
  template:
    metadata:
      labels:
        app: memory-service-worker
    spec:
      serviceAccountName: memory-service-worker
      containers:
      - name: worker
        image: de-v2/memory-service-worker:latest
        env:
        - name: TEMPORAL_NAMESPACE
          value: de-v2-platform
        # ... other env vars from ConfigMap/Secret
        resources:
          requests:
            memory: 512Mi
            cpu: 300m
          limits:
            memory: 1Gi
            cpu: 1000m
```

[TODO: Complete Helm chart, RBAC, network policies]

## Observability

### Prometheus metrics:

- `memory_store_duration_seconds` — Histogram of store latency
- `memory_search_duration_seconds` — Histogram of search latency
- `memory_consolidation_duration_seconds` — Histogram of consolidation cycle time
- `memory_consolidation_episodes_processed` — Counter of episodes processed
- `memory_facts_extracted_total` — Counter of facts extracted
- `memory_facts_deduplicated_total` — Counter of facts deduplicated
- `memory_core_memories_approved_total` — Counter of approved core memories

### Log fields:

- `workflow_id`, `run_id` (Temporal metadata)
- `agent_id`, `tenant_id`, `thread_id`
- `operation` (store, search, consolidate, approve)
- `duration_ms`, `error` (if applicable)

[TODO: Define trace spans and custom dashboards]
