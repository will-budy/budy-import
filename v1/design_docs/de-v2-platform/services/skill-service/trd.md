---
name: Skill Service — TRD
code: skill-service-trd
version: 0.1
status: stub — detailed design pending
last_updated: 2026-04-11
---

# Skill Service — Technical Reference Document

> ⚠️ This document is a stub. Detailed technical design to be completed in a dedicated design thread per service.

## Implementation Language & Framework

### Decided:

- Language: TypeScript (Temporal SDK, PostgreSQL queries, LLM integration)
- Temporal SDK: @temporalio/client + @temporalio/worker
- Database: node-postgres (pg) for PostgreSQL
- Caching: node-redis for Redis
- LLM calls: axios (via LiteLLM proxy)
- Logging: Winston, structured JSON

## Configuration

### Environment variables:

- `TEMPORAL_NAMESPACE`: Shared namespace (e.g., `de-v2-platform`)
- `TEMPORAL_FRONTEND_ADDR`: `temporal-frontend:7233`
- `TEMPORAL_TASK_QUEUE`: `skill.default`
- `POSTGRES_DSN`: PostgreSQL connection string
- `REDIS_ADDR`: Redis address (e.g., `redis:6379`)
- `LITELLM_API_URL`: LiteLLM proxy URL
- `LITELLM_MODEL_SUMMARY`: Model for approval summaries (e.g., `claude-3-5-haiku-20241022`)
- `SLACK_BOT_TOKEN`: Slack token for skill approval notifications (Vault)
- `SLACK_ADMIN_CHANNEL`: Slack channel ID for approvals (e.g., `C12345678`)
- `S3_BUCKET`: S3 bucket for skill resources (optional)
- `S3_REGION`: AWS region for S3
- `PROMETHEUS_ADDR`: Metrics endpoint
- `LOG_LEVEL`: debug | info | warn | error

[TODO: Finalize env validation and secret injection]

## Database Schemas

### skills:

```sql
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  content TEXT NOT NULL,  -- SKILL.md format, up to 100KB
  resources JSONB,  -- S3 references: { scripts: [{name, s3_uri}], ... }
  created_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, name, version)
);

CREATE INDEX idx_skill_status ON skills(status);
CREATE INDEX idx_skill_tenant ON skills(tenant_id);
CREATE INDEX idx_skill_approved_at ON skills(approved_at DESC);
```

### agent_skills:

```sql
CREATE TABLE agent_skills (
  agent_id TEXT NOT NULL,
  skill_id UUID NOT NULL REFERENCES skills(id),
  tenant_id TEXT NOT NULL,
  version_pinned INT,  -- NULL means always use latest, otherwise pinned to specific version
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agent_id, skill_id)
);

CREATE INDEX idx_agent_skills_agent ON agent_skills(agent_id);
CREATE INDEX idx_agent_skills_skill ON agent_skills(skill_id);
```

[TODO: Add all required fields, constraints, and additional indexes]

## Activity Definitions

### getForAgent:

```typescript
interface GetForAgentInput {
  agent_id: string;
  tenant_id: string;
  version?: "latest" | number;  // default "latest"
}

// Returns: { skills: [{ id, name, version, content, resources, ... }] }
```

Timeout: 2s, Retries: 2x (with Redis cache fallback)

### get:

```typescript
interface GetInput {
  skill_id: string;
  version?: number;  // default latest
}

// Returns: { skill: { id, name, version, content, resources, ... } }
```

Timeout: 1s, Retries: 1x

### propose:

```typescript
interface ProposeInput {
  agent_id: string;
  tenant_id: string;
  name: string;
  content: string;  // SKILL.md format
  metadata: {
    description?: string;
    required_permissions?: string[];
    tags?: string[];
  };
}

// Returns: { skill_id: string }
```

Timeout: 1s, Retries: 1x

### approve:

```typescript
interface ApproveInput {
  skill_id: string;
  approved_by: string;  // admin user ID
}

// Returns: { skill_id: string }
```

Timeout: 1s, Retries: 1x

### reject:

```typescript
interface RejectInput {
  skill_id: string;
  rejected_by: string;
  note?: string;
}

// Returns: { skill_id: string }
```

Timeout: 1s, Retries: 1x

### assignToAgent:

```typescript
interface AssignToAgentInput {
  skill_id: string;
  agent_id: string;
  tenant_id: string;
  version_pinned?: number;  // NULL means latest
}

// Returns: { assigned: boolean }
```

Timeout: 1s, Retries: 1x

### generateApprovalSummary:

```typescript
interface GenerateApprovalSummaryInput {
  skill_id: string;
}

// Returns: { summary: string; risks: string; requires_review: boolean }
```

Timeout: 5s, Retries: 1x

[TODO: Define detailed signatures and error handling for all activities]

## Workflow Definitions

### Skill Approval Workflow:

```typescript
// Triggered when skill status moves to 'pending_approval'
// Input: { skill_id: string }
// Output: { approved: boolean; note?: string }
```

[TODO: Define detailed state machine, signal schema, timeout for approval]

## Error Handling & Retry Strategy

### Activity-level:

- Read operations: Retry 2x on transient error (timeout, network)
- Write operations: Retry 1x on transient error, fail fast on constraint violation
- LLM calls: Retry 1x on 429/500, fail after 2x

### Workflow-level:

- Approval workflow: If approval times out (7 days), escalate or auto-reject

[TODO: Define detailed error codes and alert conditions]

## Performance Characteristics

### Targets:

- getForAgent: < 100ms (from Redis cache) or < 500ms (cold)
- get: < 100ms
- propose: < 100ms
- generateApprovalSummary: < 5s (LLM call)
- Approval workflow: < 7 days (admin SLA)

[TODO: Define performance testing strategy]

## Testing Strategy

[TODO: Unit tests for skill logic, integration tests with test PostgreSQL, e2e with Temporal test server]

- Unit: Skill versioning, approval logic
- Integration: Full approval workflow with test data
- E2e: Real Temporal cluster execution

## Deployment Configuration

[TODO: K8s Deployment for skill-service-worker]

```yaml
# deployment.yaml (stub)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: skill-service-worker
  namespace: de-v2-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: skill-service-worker
  template:
    metadata:
      labels:
        app: skill-service-worker
    spec:
      serviceAccountName: skill-service-worker
      containers:
      - name: worker
        image: de-v2/skill-service-worker:latest
        env:
        - name: TEMPORAL_NAMESPACE
          value: de-v2-platform
        # ... other env vars from ConfigMap/Secret
        resources:
          requests:
            memory: 256Mi
            cpu: 200m
          limits:
            memory: 512Mi
            cpu: 500m
```

[TODO: Complete Helm chart, RBAC, network policies]

## Observability

### Prometheus metrics:

- `skill_retrieval_duration_seconds` — Histogram of getForAgent/get latency
- `skill_approval_duration_seconds` — Histogram of approval workflow duration
- `skill_approvals_total` — Counter of approved/rejected skills
- `skill_cache_hits_total` — Counter of Redis cache hits vs misses

### Log fields:

- `workflow_id`, `run_id` (Temporal metadata)
- `skill_id`, `tenant_id`, `agent_id`
- `operation` (propose, approve, reject, retrieve)
- `duration_ms`, `error` (if applicable)

[TODO: Define trace spans and custom dashboards]
