# TRD Template

Replace `<ServiceName>` throughout. Remove all guidance comments before publishing.

---

```markdown
---
name: <ServiceName> — TRD
code: <service-name>-trd
version: 0.1
status: draft
last_updated: YYYY-MM-DD
---

# <ServiceName> — Technical Reference Document

## Implementation Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript (Node 22+) | Consistent with de-v2 platform |
| HTTP framework | Fastify v4 | High throughput, typed plugin system |
| Temporal SDK | `@temporalio/client` + `@temporalio/worker` ≥ 1.10.0 | Stable Nexus activity support |
| <Concern> | <Choice> | <Rationale> |

## Project Structure

```
<service-name>/
├── src/
│   ├── server.ts              # Fastify app setup
│   ├── worker.ts              # Temporal worker registration
│   ├── main.ts                # Entrypoint
│   │
│   ├── adapters/              # Channel/provider adapters
│   │   ├── types.ts           # Adapter interface + deps type
│   │   ├── registry.ts        # Adapter registry
│   │   └── <channel>/         # One dir per channel
│   │
│   ├── types/                 # Canonical TypeScript types
│   │   ├── <schema>.ts        # e.g. agent-message.ts
│   │   └── outbound.ts        # Activity input/output types
│   │
│   ├── routes/                # Fastify route handlers
│   ├── activities/            # Temporal activity implementations
│   ├── temporal/              # Client + dispatcher
│   ├── secrets/               # Vault client
│   └── infra/                 # Redis, metrics
│
├── Dockerfile
├── package.json
└── tsconfig.json
```

## TypeScript Type Definitions

<!-- Cross-reference: field-level documentation is in the HLD schema sections.
     These definitions are implementation-complete (file paths, export names). -->

### <Schema name>

```typescript
// src/types/<filename>.ts

export interface <TypeName> {
  <field>: <type>;
  <field>?: <type>;
}
```

<!-- Repeat for each type. Include AdapterDeps with concrete dependency types. -->

### <AdapterName> Interface

```typescript
// src/adapters/types.ts

import { FastifyRequest } from "fastify";
// ... imports

export interface AdapterDeps {
  redis: Redis;
  logger: Logger;
  // channel-specific clients
}

export interface <AdapterName> {
  readonly channelId: "<type>";
  <method>(req: FastifyRequest, deps: AdapterDeps): Promise<<Return>>;
}
```

## ID & Key Construction

<!-- Deterministic functions that build conversation_id, session_key, message_id.
     These must be consistent across all services that reconstruct these keys. -->

```typescript
// Conversation ID format: "<channel>/<account_id>/<chat_type>/<native_id>"
function build<Channel>ConversationId(
  accountId: string,
  chatType: string,
  nativeId: string,
): string {
  return `<channel>/${accountId}/${chatType}/${nativeId}`;
}

// Session key: equals conversation_id, or appends "/thread/<thread_id>" for threads
function buildSessionKey(conversationId: string, threadId?: string): string {
  if (!threadId) return conversationId;
  return `${conversationId}/thread/${threadId}`;
}

// message_id: deterministic UUIDv5 from platform's native event ID
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // UUID namespace OID
function buildMessageId(channel: string, platformEventId: string): string {
  return uuidv5(`${channel}:${platformEventId}`, NAMESPACE);
}
```

## API Endpoints

### POST /<webhook-path>

```
Content-Type:  <content-type>
Authorization: <auth header>

Body: <description of body format>
```

**Processing:**
1. <Validation step> → HTTP <code> if invalid
2. <Parse step>
3. **HTTP 200** (always return 200 before async work; external systems retry on non-200)
4. Async: <normalize> → <dispatch>

**Response on success:** HTTP 200  
**Response on auth failure:** HTTP 400 / 401

---

<!-- Repeat for each endpoint. GET /health is always present. -->

### GET /health

```
Response: { "status": "ok", "uptime_seconds": <N> }
HTTP 200
```

## Error Handling Matrix

### Inbound (webhook handlers)

| Scenario | Action | HTTP status |
|----------|--------|-------------|
| Invalid signature | Log warning, return error | 400 |
| Temporal unavailable at dispatch time | Log error; external system retries | 200 (already sent) |
| Normalization error | Log with raw payload; do not start workflow | 200 (already sent) |
| Duplicate event (`REJECT_DUPLICATE`) | Silently drop | — |

> **Why 200 on Temporal failure?** External systems (Slack, GCP) retry on non-200.
> We return 200 before async dispatch, so failures are logged for replay, not retried by the external system.

### Outbound (Temporal activities)

| Scenario | Error type | Retry? | Max attempts |
|----------|-----------|--------|--------------|
| Redis unavailable (pre-send idempotency check) | Retryable | Yes | Unlimited |
| Redis write failure after successful send | Log warning, return result | No | 1 |
| idempotency_key already cached | No-op, return cached | No | 1 |
| API 429 (rate limited) | Retryable | Yes | 10 |
| API 5xx | Retryable | Yes | 5 |
| API 4xx (permanent) | Permanent | No | 1 |

## Temporal Configuration

### Workflow dispatch

```typescript
await temporalClient.start(<WorkflowName>, {
  taskQueue: "<task-queue>",
  workflowId: `<prefix>:${channel}:${eventId}`,
  args: [{ <arg> }],
  workflowIdConflictPolicy: WorkflowIdConflictPolicy.REJECT_DUPLICATE,
  workflowExecutionTimeout: "<N> minutes",
});
```

### Worker registration

<!-- If multiple task queues: define separate workers. Never mix task queues. -->

```typescript
// Worker 1 — <Purpose> (<task-queue-name>)
const worker1 = await Worker.create({
  taskQueue: "<task-queue-1>",
  activities: { <activityName> },
});

// Worker 2 — <Purpose> (<task-queue-name>)
const worker2 = await Worker.create({
  taskQueue: "<task-queue-2>",
  workflowsPath: require.resolve("./<workflow-path>"),
  activities: { <activityName> },
});

await Promise.all([worker1.run(), worker2.run(), app.listen({ port: PORT })]);
```

## Configuration (Environment Variables)

| Variable | Source | Description |
|----------|--------|-------------|
| `TEMPORAL_FRONTEND_ADDR` | Env | `temporal-frontend:7233` |
| `TEMPORAL_NAMESPACE` | Env | `de-v2-platform` |
| `REDIS_ADDR` | Env | `redis:6379` |
| `VAULT_ADDR` | Env | `http://vault:8200` |
| `PORT` | Env | HTTP listen port (default `8080`) |
| `LOG_LEVEL` | Env | `info` |
| <secret> | Vault | `secret/de-v2/<service>/<key>` |

## Redis Usage

```typescript
// Key naming: cgw:<purpose>:<discriminator>
const SENDER_CACHE_TTL = 3600;       // 1h
const IDEMPOTENCY_TTL = 86400;       // 24h

const senderKey = (accountId: string, userId: string) =>
  `<prefix>:sender:${accountId}:${userId}`;

const idemKey = (key: string) =>
  `<prefix>:idem:${key}`;
```

### Redis Availability Policy

**Temporal activities — FAIL-CLOSED:**

```typescript
let cached: <OutputType> | null;
try {
  cached = await redis.get(idemKey(input.idempotency_key));
} catch (err) {
  // Redis down — throw retryable. Do NOT call external API without idempotency check.
  throw ApplicationFailure.retryable(
    "Redis unavailable: cannot verify idempotency state before sending",
    "RedisUnavailableError",
  );
}

if (cached) return cached;

const result = await <externalApiCall>();

// Best-effort write — if this fails, the external call already succeeded.
// Do NOT throw here; that would cause Temporal to retry and re-send.
try {
  await redis.set(idemKey(input.idempotency_key), result, "EX", IDEMPOTENCY_TTL);
} catch (err) {
  logger.warn({ err }, "Redis write failed after successful send");
}

return result;
```

**HTTP handler caches — FAIL-OPEN:**
If Redis is down during inbound normalization, fall back to direct API call or leave field undefined. Log and proceed. Failing the HTTP handler would cause external system to retry unnecessarily.

## Performance Characteristics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Webhook acknowledgment | p50 < 100ms, p99 < 500ms | k6 load test |
| Temporal workflow start | p50 < 200ms | Temporal SDK metrics |
| Activity end-to-end | p50 < 1s, p99 < 2s | Activity duration histogram |
| Throughput per pod | 1,000+ req/s | k6 sustained load |

## Testing Strategy

### Unit tests
- Signature validation (valid, invalid, expired timestamp)
- Deterministic ID construction (`buildMessageId`, `buildConversationId`)
- Normalization for each channel (each message type, with/without attachments)
- Activity idempotency check (cache hit → return cached, cache miss → send)

### Integration tests
- Webhook handler with mocked Temporal client → correct workflowId started
- Outbound activity with mocked external client → correct API calls made
- Duplicate event → `REJECT_DUPLICATE` handled silently

### E2E tests (manual / CI with test accounts)
- Send real event → observe RouterWorkflow in Temporal UI
- Agent calls activity → verify delivery in channel

### Load tests (k6)
- 1,000 req/s sustained for 5 minutes against webhook endpoint with mocked Temporal
- Target: 0 errors, p99 < 500ms, memory stable

## Observability

### Prometheus metrics

| Metric | Type | Labels |
|--------|------|--------|
| `<svc>_inbound_requests_total` | Counter | `channel`, `status` |
| `<svc>_inbound_duration_seconds` | Histogram | `channel` |
| `<svc>_temporal_start_total` | Counter | `workflow`, `status` |
| `<svc>_send_response_total` | Counter | `channel`, `status` |
| `<svc>_send_response_duration_seconds` | Histogram | `channel` |
| `<svc>_redis_errors_total` | Counter | `operation` |

### Structured log fields (pino)

```json
{
  "timestamp": "ISO8601",
  "level": "info",
  "request_id": "<uuid>",
  "channel": "<channel>",
  "channel_account_id": "<account>",
  "message_id": "<uuid>",
  "tenant_id": "<tenant>",
  "duration_ms": 42
}
```

Never log: message body, sender email/phone, attachment URLs. Log only metadata.

## Deployment Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <service-name>
  namespace: de-v2-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: <service-name>
  template:
    metadata:
      labels:
        app: <service-name>
    spec:
      containers:
        - name: <service-name>
          image: <image>
          ports:
            - containerPort: 8080   # HTTP
            - containerPort: 9090   # Temporal worker
            - containerPort: 8081   # Metrics
          resources:
            requests:
              memory: "256Mi"
              cpu: "200m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          env:
            - name: TEMPORAL_FRONTEND_ADDR
              value: "temporal-frontend:7233"
            - name: REDIS_ADDR
              value: "redis:6379"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
```
