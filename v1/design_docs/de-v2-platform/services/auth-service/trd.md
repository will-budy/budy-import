---
name: Auth & Permissions Service — TRD
code: auth-service-trd
version: 0.1
status: stub — detailed design pending
last_updated: 2026-04-11
---

# Auth & Permissions Service — Technical Reference Document

> ⚠️ This document is a stub. Detailed technical design to be completed in a dedicated design thread.

## Implementation Language & Framework

- **Language**: TypeScript
- **Runtime**: Node.js
- **Temporal SDK**: `@temporalio/worker`, `@temporalio/activity`, `@temporalio/workflow`
- **JWT**: `jose` library (JOSE standard — supports both symmetric HMAC and asymmetric RS256/ES256)
- **Vault client**: `node-vault` or HTTP client against Vault API

## Configuration (Key Env Vars)

```env
TEMPORAL_NAMESPACE=platform
TEMPORAL_TASK_QUEUE=auth-service
DATABASE_URL=...                         # via Vault Operator
REDIS_URL=...                            # via Vault Operator
VAULT_ADDR=...
VAULT_JWT_KEY_PATH=...                   # Vault path to JWT signing key
JWT_DEFAULT_TTL_SECONDS=300              # Default token TTL (5 min)
JWT_ESCALATION_TIMEOUT_HOURS=24          # How long escalation workflow waits for human
PERMISSION_CACHE_TTL_SECONDS=300         # Redis cache TTL for policy hot-cache
SLACK_ADMIN_CHANNEL_ID=...              # Channel for escalation notifications
```

## Database Schemas

```sql
-- Permission policies per agent
CREATE TABLE agent_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  static_permissions TEXT[] NOT NULL DEFAULT '{}',
  denied_permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL,
  UNIQUE (agent_id, tenant_id)
);

-- Immutable audit log
CREATE TABLE auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  permission_requested TEXT NOT NULL,
  outcome TEXT NOT NULL,  -- 'GRANTED', 'DENIED', 'ESCALATION_INITIATED', 'ESCALATION_APPROVED', 'ESCALATION_DENIED', 'ESCALATION_TIMEOUT'
  token_jti TEXT,         -- populated if JWT was issued
  workflow_id TEXT,       -- Temporal workflow ID if escalation triggered
  context JSONB,          -- what the agent was trying to do
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Revocation list (for emergency revocation before TTL expiry)
CREATE TABLE token_revocations (
  jti TEXT PRIMARY KEY,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by TEXT NOT NULL,
  reason TEXT
);

-- Escalation records (linked to audit_log)
CREATE TABLE permission_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_log_id UUID REFERENCES auth_audit_log(id),
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  permission_requested TEXT NOT NULL,
  agent_context TEXT,       -- why the agent needs this permission (agent-provided)
  llm_summary TEXT,         -- LLM-generated summary for human reviewer
  status TEXT NOT NULL,     -- 'pending', 'approved', 'denied', 'timeout'
  decided_by TEXT,          -- operator who approved/denied
  decision_note TEXT,
  grant_permanent BOOLEAN DEFAULT FALSE,  -- if true, add to static_permissions
  workflow_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
```

## Temporal Activities

```typescript
// auth.requestPermission — hot path, called by every agent before privileged ops
requestPermission(input: {
  agent_id: string;
  tenant_id: string;
  permission: string;        // e.g. "sandbox:execute:code"
  context?: string;          // optional: why the agent needs this
  ttl_seconds?: number;      // optional: override default TTL
}): Promise<{ token: string } | { escalation_workflow_id: string }>

// auth.validateToken — called by target services before accepting requests
validateToken(input: {
  token: string;
  required_permission: string;
  tenant_id: string;
}): Promise<{ valid: boolean; agent_id?: string; expires_at?: string }>

// auth.revokeToken — emergency revocation
revokeToken(input: { jti: string; reason: string; revoked_by: string }): Promise<void>
```

## Temporal Workflows

```typescript
// PermissionEscalationWorkflow
// Triggered when an agent requests a permission beyond its static set
// Pauses until human signal, then issues JWT or returns denial
escalationWorkflow(input: {
  agent_id: string;
  tenant_id: string;
  permission: string;
  agent_context: string;
  requesting_workflow_id: string;
}): Promise<{ granted: boolean; token?: string }>
```

## Error Handling & Retry Strategy

- `requestPermission`: retry on transient DB/Redis errors (max 3 attempts, exponential backoff). Non-retriable: policy not found (agent not registered), permission explicitly denied.
- `validateToken`: no retries — validation is synchronous and deterministic. Invalid token returns `{ valid: false }`.
- Escalation workflow: inherits Temporal's durable execution. Worker crash mid-escalation replays from last event. Signal timeout after `JWT_ESCALATION_TIMEOUT_HOURS` → auto-deny with log entry.

## Performance Characteristics

- `requestPermission` (in-policy): target < 50ms (Redis cache hit) or < 100ms (PG miss + sign)
- `validateToken`: target < 20ms (Redis lookup for revocation list + JWT verify)
- Escalation workflow: async — does not block digital entity 2 beyond activity timeout for the escalation trigger

## Testing Strategy

[TODO: define in TRD phase]

- Unit: policy evaluation logic, JWT sign/verify
- Integration: full activity round-trip against test PG and test Vault dev server
- E2E: digital entity 2 requests permission → JWT issued → target service validates → audit log verified

## Observability

Key metrics to emit (Prometheus):

- `auth_permission_requests_total{agent_id, tenant_id, permission, outcome}` — counter
- `auth_escalations_active` — gauge (how many escalations currently pending human review)
- `auth_token_ttl_seconds` — histogram (distribution of issued token TTLs)
- `auth_request_duration_seconds` — histogram (hot path latency)
