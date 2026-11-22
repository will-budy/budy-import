---
name: Comms Gateway 1 — TRD
code: comms-gateway-1-trd
version: 0.5
status: in-review
last_updated: 2026-04-13
---

# Comms Gateway 1 — Technical Reference Document

## Implementation Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript (Node 22+) | Consistent with de-v2 platform; same Temporal SDK; same team |
| HTTP framework | Fastify v4 | ~70k req/s in benchmarks, typed plugin system, built-in JSON schema validation |
| Temporal SDK | `@temporalio/client` + `@temporalio/worker` ≥ 1.10.0 | `WorkflowIdConflictPolicy.SKIP` and `REJECT_DUPLICATE` require ≥ 1.9.0; 1.10+ for stable Nexus activity support |
| Slack SDK | `@slack/web-api` + `@slack/events-api` (signature verification) | Official; handles HMAC verification |
| Gmail SDK | `googleapis` (Node.js client) | Official Google client |
| GCP OIDC verification | `google-auth-library` `OAuth2Client.verifyIdToken()` | Validates Pub/Sub push tokens |
| Redis client | `ioredis` | Robust reconnect handling; typed interface |
| Vault client | `node-vault` or `@hashicorp/vault-client` | Secret retrieval + lease renewal |
| Logging | `pino` (Fastify's built-in logger) | Structured JSON, low overhead |
| Metrics | `@opentelemetry/sdk-node` + Prometheus exporter | Consistent with platform observability stack |
| Container base | `node:22-alpine` | Small image, LTS |

## Project Structure

```text
comms-gateway-1/
├── src/
│   ├── server.ts              # Fastify app setup, plugin registration
│   ├── worker.ts              # Temporal activity worker registration
│   ├── main.ts                # Entrypoint: starts HTTP server + activity worker
│   │
│   ├── adapters/
│   │   ├── types.ts           # ChannelAdapter interface, AdapterDeps type
│   │   ├── registry.ts        # ChannelAdapterRegistry — Map<channelId, adapter>
│   │   ├── slack/
│   │   │   ├── adapter.ts     # SlackAdapter implements ChannelAdapter
│   │   │   ├── normalize.ts   # Slack event payload → AgentMessage
│   │   │   ├── interactions.ts # Slack interaction payload → InteractionEvent
│   │   │   └── outbound.ts    # chat.postMessage / chat.update / Block Kit
│   │   └── gmail/
│   │       ├── adapter.ts     # GmailAdapter implements ChannelAdapter
│   │       ├── normalize.ts   # Gmail message → AgentMessage
│   │       ├── outbound.ts    # users.messages.send
│   │       └── ingest-workflow.ts  # GmailIngestWorkflow + activities
│   │
│   ├── types/
│   │   ├── agent-message.ts   # AgentMessage, TenantHints, Attachment
│   │   ├── interaction.ts     # InteractionEvent, SlackInteractionPayload
│   │   └── outbound.ts        # SendResponseInput/Output, UpdateMessageInput/Output, SlackBlock
│   │
│   ├── routes/
│   │   ├── webhook-slack.ts           # POST /webhook/slack handler
│   │   ├── webhook-slack-interactions.ts  # POST /webhook/slack/interactions handler
│   │   ├── webhook-gmail.ts           # POST /webhook/gmail handler
│   │   └── health.ts                  # GET /health handler
│   │
│   ├── activities/
│   │   ├── send-response.ts   # gateway.sendResponse Temporal activity
│   │   └── update-message.ts  # gateway.updateMessage Temporal activity
│   │
│   ├── temporal/
│   │   ├── client.ts          # TemporalClient singleton
│   │   └── dispatcher.ts      # startRouterWorkflow(), routeInteraction()
│   │
│   ├── secrets/
│   │   └── vault.ts           # VaultSecretResolver, startup loader
│   │
│   └── infra/
│       ├── redis.ts           # Redis client, cache helpers
│       └── metrics.ts         # OpenTelemetry meter, metric definitions
│
├── Dockerfile
├── package.json
└── tsconfig.json
```

## TypeScript Type Definitions

> **Canonical schema documentation lives in the HLD.** The definitions below are the implementation-complete TypeScript source of truth (with file paths and export names). For field-level annotations, format semantics, and worked examples, refer to the HLD's "AgentMessage Schema" and "InteractionEvent Schema" sections.

### AgentMessage

```typescript
// src/types/agent-message.ts

export const AGENT_MESSAGE_SCHEMA = "budy.agent_message.v1" as const;

export type Channel = "slack" | "email";
export type ChatType = "direct" | "channel" | "group" | "email";

export interface AgentMessage {
  schema: typeof AGENT_MESSAGE_SCHEMA;
  message_id: string;

  channel: Channel;
  channel_account_id: string;
  channel_message_id: string;

  chat_type: ChatType;
  conversation_id: string;
  session_key: string;
  thread_id?: string;

  sender_id: string;
  sender_name?: string;

  content: string;

  reply_to_message_id?: string;
  thread_starter?: ThreadStarter;

  attachments: Attachment[];

  tenant_hints: TenantHints;
  tenant_id?: string;

  sent_at: string;
  received_at: string;
}

export interface ThreadStarter {
  content: string;
  sender_id: string;
  sender_name?: string;
}

export interface TenantHints {
  channel_account_id: string;
  channel_id?: string;
  email_domain?: string;
  email_subject?: string;
}

export interface Attachment {
  type: "file" | "image" | "audio" | "video";
  name: string;
  mime_type: string;
  size_bytes?: number;
  source_url: string;
  expires_at?: string;
}
```

### InteractionEvent Types

```typescript
// src/types/interaction.ts

export type InteractionActionType =
  | "button"
  | "static_select"
  | "multi_static_select"
  | "overflow";

export interface WorkflowSignalTarget {
  workflow_id: string;
  signal_name: string;
  signal_value?: string;
}

export interface InteractionEvent {
  schema: "budy.interaction_event.v1";
  interaction_id: string;          // UUIDv4 gateway-assigned

  channel: "slack";
  channel_account_id: string;      // Slack team_id

  source_message_ts: string;       // ts of the Block Kit message that was interacted with
  source_channel_id: string;       // Slack channel_id of the source message
  conversation_id: string;
  session_key: string;
  thread_id?: string;

  actor_id: string;                // Slack user_id of the person who clicked
  actor_name?: string;

  action_type: InteractionActionType;
  action_id: string;               // Raw Slack action_id
  block_id: string;
  value?: string;

  workflow_signal?: WorkflowSignalTarget;  // Decoded from action_id "wf:…" prefix, if present

  response_url: string;            // Slack response_url for interim ack
  response_url_expires_at: string; // ISO8601

  tenant_hints: TenantHints;
  // tenant_id not set at gateway time for Slack; Router resolves.

  interacted_at: string;
  received_at: string;
}

// Raw Slack interactive payload (for internal use in the adapter only)
export interface SlackInteractionPayload {
  type: "block_actions";
  team: { id: string; domain: string };
  user: { id: string; username: string; name: string };
  channel?: { id: string; name: string };
  message?: { ts: string; thread_ts?: string; blocks: unknown[] };
  actions: Array<{
    type: string;
    action_id: string;
    block_id: string;
    value?: string;
    selected_option?: { value: string; text: { text: string } };
  }>;
  response_url: string;
  trigger_id: string;
}
```

### action_id Parsing

```typescript
// src/adapters/slack/interactions.ts (excerpt)

const WF_PREFIX = "wf:";

function parseWorkflowSignal(actionId: string): WorkflowSignalTarget | undefined {
  if (!actionId.startsWith(WF_PREFIX)) return undefined;
  // Format: "wf:<workflow_id>:<signal_name>[:<value>]"
  const parts = actionId.slice(WF_PREFIX.length).split(":");
  if (parts.length < 2) return undefined;
  const [workflow_id, signal_name, signal_value] = parts;
  return { workflow_id, signal_name, signal_value };
}
```

### Outbound Types

```typescript
// src/types/outbound.ts
// SlackBlock follows the Slack Block Kit schema:
// https://api.slack.com/reference/block-kit/blocks
// Use @slack/types for full typing in production; Record<string,unknown> here for portability.
export type SlackBlock = Record<string, unknown>;

export type OutboundFormat = "plain" | "mrkdwn";

export interface SendResponseInput {
  // Target
  channel: Channel;
  channel_account_id: string;   // Which Slack workspace / Gmail account to send from
  conversation_id: string;      // Normalized conversation_id from AgentMessage
  thread_id?: string;           // Reply into this thread (Slack: thread_ts, Email: Gmail threadId)

  // Content
  content: string;              // Required plain-text. Used as email body and Slack fallback.
  format: OutboundFormat;       // Applies to content field. "mrkdwn" for Slack markdown.
  blocks?: SlackBlock[];        // Slack Block Kit. Required for Slack structured output.
                                // Must be valid Block Kit JSON. Email channel ignores this field.

  // Threading
  reply_to_message_id?: string; // Slack: creates threaded reply to this message ts.
                                // Email: sets In-Reply-To and References headers.

  // Idempotency
  idempotency_key: string;      // Caller-provided. Format: "<workflow_run_id>:<step_name>".
                                // Prevents duplicate sends on Temporal activity retry.

  // Multi-tenancy
  tenant_id: string;            // Set by router. Required for audit and cost attribution.
}

export interface SendResponseOutput {
  message_id: string;           // Slack: ts of sent message. Email: Gmail message ID.
  thread_id: string;            // Thread root ts (Slack) or Gmail threadId (Email).
  channel_id: string;           // Slack: channel or DM ID (C…/D…). Email: recipient address.
                                // Pass to UpdateMessageInput.channel_id to update this message later.
  sent_at: string;              // ISO8601
  channel: Channel;
  channel_account_id: string;
}

export interface UpdateMessageInput {
  channel: "slack";             // Phase 1: Slack only. Email messages cannot be updated in-place.
  channel_account_id: string;   // Slack team_id
  channel_id: string;           // Slack channel ID where the message lives
  message_ts: string;           // ts of the message to update (InteractionEvent.source_message_ts)
  content: string;              // New plain-text fallback
  blocks: SlackBlock[];         // New Block Kit blocks — replaces entire blocks array
  idempotency_key: string;
  tenant_id: string;
}

export interface UpdateMessageOutput {
  message_ts: string;           // ts of the updated message (same as input)
  updated_at: string;           // ISO8601
  channel: "slack";
  channel_account_id: string;
}
```

### Channel Adapter Interface

```typescript
// src/adapters/types.ts

import { FastifyRequest } from "fastify";
import { Redis } from "ioredis";
import { WebClient } from "@slack/web-api";
import { gmail_v1 } from "googleapis";
import { Logger } from "pino";
import { AgentMessage } from "../types/agent-message";
import { SendResponseInput, SendResponseOutput } from "../types/outbound";

export interface AdapterDeps {
  redis: Redis;
  logger: Logger;
  slackClients: Map<string, WebClient>;       // team_id → WebClient
  gmailClients: Map<string, gmail_v1.Gmail>;  // emailAddress → Gmail client
  tenantMap: Map<string, string>;             // emailAddress → tenant_id (from Vault)
}

export interface ChannelAdapter {
  readonly channelId: "slack" | "email";

  validateRequest(req: FastifyRequest): Promise<void>;
  shouldProcess(req: FastifyRequest): Promise<boolean>;
  normalize(req: FastifyRequest, deps: AdapterDeps): Promise<AgentMessage[]>;
  sendResponse(input: SendResponseInput, deps: AdapterDeps): Promise<SendResponseOutput>;
}
```

## Session Key & Conversation ID Construction

These are deterministic functions — given the same inputs they always produce the same output. They must be consistent across gateway and any service that reconstructs keys (e.g. memory service).

```typescript
// src/adapters/slack/normalize.ts (excerpt)

function buildSlackConversationId(
  teamId: string,
  channelType: "im" | "channel" | "group",
  channelId: string,
): string {
  const chatType = channelType === "im" ? "direct" : channelType;
  return `slack/${teamId}/${chatType}/${channelId}`;
}

function buildSlackSessionKey(conversationId: string, threadTs?: string): string {
  if (!threadTs) return conversationId;
  return `${conversationId}/thread/${threadTs}`;
}

// src/adapters/gmail/normalize.ts (excerpt)
function buildGmailConversationId(emailAddress: string, threadId: string): string {
  return `email/${emailAddress}/email/${threadId}`;
}
// Gmail has no sub-threading; session_key === conversation_id
```

## message_id Construction (Deduplication Key)

`message_id` is a deterministic UUIDv5 derived from the platform's native event identifier. This ensures the same event always produces the same workflow ID, making Temporal's `REJECT_DUPLICATE` policy the sole deduplication mechanism.

```typescript
import { v5 as uuidv5 } from "uuid";

// Fixed namespace UUID for de-v2 (generated once, stored as a constant)
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // UUID namespace OID

function buildMessageId(channel: Channel, platformEventId: string): string {
  return uuidv5(`${channel}:${platformEventId}`, NAMESPACE);
}

// Slack: platformEventId = event.event_id  (e.g. "Ev0XXXXXX")
// Gmail: platformEventId = Gmail message ID (e.g. "18ef123abc")
```

## API Endpoints

### POST /webhook/slack

```yaml
Content-Type:       application/json
X-Slack-Signature:  v0=<hmac-sha256-hex>
X-Slack-Request-Timestamp: <unix-epoch-seconds>

Body: Slack Events API payload (see https://api.slack.com/events/api)
```

### Processing:

1. Verify signature (reject if invalid or timestamp skew > 5 min → HTTP 400)
2. If `payload.type === "url_verification"` → return `{ challenge: payload.challenge }` (HTTP 200)
3. If event is from a bot user or is an unsupported event type → HTTP 200 no-op
4. HTTP 200 `{ ok: true }`
5. Async: normalize → dispatch RouterWorkflow

**Response on success:** `{ "ok": true }` HTTP 200
**Response on signature failure:** `{ "ok": false, "error": "invalid_signature" }` HTTP 400

---

### POST /webhook/slack/interactions

```yaml
Content-Type:       application/x-www-form-urlencoded
X-Slack-Signature:  v0=<hmac-sha256-hex>
X-Slack-Request-Timestamp: <unix-epoch-seconds>

Body: payload=<url-encoded JSON string>
```

The `payload` field decodes to a `SlackInteractionPayload` JSON object.

### Processing:

1. Verify HMAC-SHA256 signature (same as `/webhook/slack`)
2. URL-decode and JSON-parse the `payload` field
3. If `payload.type !== "block_actions"` → HTTP 200 no-op (unsupported interaction type)
4. Parse all `actions[]` entries; for each: decode `action_id` for `workflow_signal` target
5. Build `InteractionEvent` (one per action — typically one action per interaction)
6. Check Redis dedup key `cgw:interaction:{trigger_id}` → if hit, HTTP 200 no-op
7. **HTTP 200 `{}`** (Slack requires an empty body or `{ "response_action": "clear" }`)
8. Async — POST to `response_url` with the interim "Processing…" Block Kit payload:

   ```json
   {
     "replace_original": true,
     "text": "Processing your request…",
     "blocks": [
       {
         "type": "section",
         "text": {
           "type": "mrkdwn",
           "text": ":hourglass_flowing_sand: Processing your request…"
         }
       }
     ]
   }
   ```

1. Async — for each `InteractionEvent`:
   - If `workflow_signal` present: `temporalClient.signal(workflow_id, signal_name, payload)`
   - Otherwise: `temporalClient.start(RouterWorkflow, { event }, workflowId=interaction_id, REJECT_DUPLICATE)`

**Response on success:** HTTP 200 `{}`
**Response on signature failure:** HTTP 400

---

### POST /webhook/gmail

```text
Content-Type:    application/json
Authorization:   Bearer <GCP-OIDC-token>

Body: GCP Pub/Sub push message format
{
  "message": {
    "data": "<base64({ emailAddress, historyId })>",
    "messageId": "...",
    "publishTime": "..."
  },
  "subscription": "projects/.../subscriptions/..."
}
```

### Processing:

1. Verify OIDC JWT (`Authorization: Bearer`) against `accounts.google.com` — reject HTTP 401 if invalid
2. Decode base64 `message.data` → `{ emailAddress, historyId }`
3. If `emailAddress` not in `tenantMap` → HTTP 200 (acknowledge; log warning)
4. HTTP 200
5. Async: start `GmailIngestWorkflow(emailAddress, historyId, tenant_id)`

**Response on success:** HTTP 200 (no body required by GCP)
**Response on auth failure:** HTTP 401

---

### GET /health

```text
Response: { "status": "ok", "uptime_seconds": 1234 }
HTTP 200
```

Used by K8s liveness and readiness probes.

## Error Handling Matrix

### Inbound (webhook handlers)

| Scenario | Action | HTTP status |
|----------|--------|-------------|
| Invalid Slack signature | Log warning + return error | 400 |
| Timestamp skew > 5 min | Log warning + return error | 400 |
| Slack URL verification challenge | Return challenge | 200 |
| Message from bot user | No-op | 200 |
| Temporal client unavailable at dispatch time | Log error + emit metric; Slack/GCP will retry | 200 (already sent) |
| Normalization error (malformed payload) | Log error with raw payload; do not start workflow | 200 (already sent) |
| Slack interaction — invalid signature | Log warning + return error | 400 |
| Slack interaction — unsupported type (not block_actions) | No-op | 200 |
| Slack interaction — duplicate (`trigger_id` in Redis) | No-op | 200 |
| Slack interaction — `workflow_signal` target workflow not found | Log warning; no-op signal (Temporal returns error, caught and logged) | — |
| Slack interaction — `response_url` call fails | Log warning; interaction still routed to Temporal | — |
| Unknown Gmail emailAddress | Log warning; acknowledge to prevent redelivery loop | 200 |
| Invalid GCP OIDC token | Return 401 | 401 |
| Duplicate event (REJECT_DUPLICATE from Temporal) | Silently drop; log debug | — |

> **Why return 200 even on Temporal failure?** Slack and GCP Pub/Sub will retry if they don't receive 200. Since we're async (200 is returned before dispatch), failures after the 200 are logged for manual replay but do not cause redelivery storms.

### Outbound (gateway.sendResponse and gateway.updateMessage activities)

| Scenario | Error type | Retry? | Max attempts |
|----------|-----------|--------|--------------|
| Redis unavailable (pre-send idempotency check) | Retryable | Yes | unlimited — activity blocks until Redis recovers |
| Redis write failure after successful send | Log warning, return result | No | 1 — send succeeded; crashing would cause a re-send |
| idempotency_key already in Redis | No-op | No | 1 — return cached result immediately |
| Slack 429 (rate limited) | Retryable | Yes | 10 |
| Slack 500 / 502 / 503 | Retryable | Yes | 5 |
| Slack 400 (bad request, invalid channel) | Permanent | No | 1 |
| Slack 404 (channel not found) | Permanent | No | 1 |
| Gmail API 429 | Retryable | Yes | 10 |
| Gmail API 5xx | Retryable | Yes | 5 |
| Gmail API 4xx | Permanent | No | 1 |
| Invalid channel in input | Permanent | No | 1 |

Retry backoff: initial 1s, multiplier 2, max delay 30s (Temporal retry policy configured on the activity). The Redis unavailability case uses a separate, longer backoff — initial 5s, multiplier 1.5, max delay 60s — to avoid hammering a recovering Redis cluster.

## Temporal Configuration

### RouterWorkflow dispatch

```typescript
await temporalClient.start(RouterWorkflow, {
  taskQueue: "router.default",
  workflowId: `router:${message.channel}:${message.channel_message_id}`,
  args: [{ message }],
  workflowIdConflictPolicy: WorkflowIdConflictPolicy.REJECT_DUPLICATE,
  workflowExecutionTimeout: "10 minutes",
});
```

### GmailIngestWorkflow dispatch

```typescript
await temporalClient.start(GmailIngestWorkflow, {
  taskQueue: "gateway.gmail-ingest",
  workflowId: `gmail-ingest:${emailAddress}:${historyId}`,
  args: [{ emailAddress, historyId, tenantId }],
  workflowIdConflictPolicy: WorkflowIdConflictPolicy.SKIP,
  workflowExecutionTimeout: "5 minutes",
});
```

### Worker registration

Comms Gateway 1 runs **two Temporal workers** in the same process, on separate task queues with separate concerns:

**Worker 1 — Outbound activity worker** (`gateway.activities`)

Handles `sendResponse` and `updateMessage` calls from Agent Workers across all tenant namespaces via Nexus. No workflow registration — this worker only executes activities.

```typescript
const outboundWorker = await Worker.create({
  taskQueue: "gateway.activities",
  // No workflowsPath — this worker executes activities only.
  activities: {
    sendResponse,    // gateway.sendResponse — called by Agent Workers via Nexus
    updateMessage,   // gateway.updateMessage — called by Agent Workers via Nexus
  },
});
```

**Worker 2 — Gmail ingest worker** (`gateway.gmail-ingest`)

Runs `GmailIngestWorkflow` and its internal activities. This workflow is started by the HTTP handler when a Gmail Pub/Sub push arrives. Agent Workers never interact with this worker directly.

```typescript
const gmailIngestWorker = await Worker.create({
  taskQueue: "gateway.gmail-ingest",
  workflowsPath: require.resolve("./adapters/gmail/ingest-workflow"),
  // workflowsPath registers GmailIngestWorkflow as an executable workflow on this queue.
  activities: {
    listNewMessages,           // Gmail API: users.history.list
    fetchAndNormalizeMessage,  // Gmail API: users.messages.get + normalize to AgentMessage
  },
});
```

Both workers share the same process and the same `AdapterDeps` (Redis client, Gmail API clients, Vault secrets). Start both before the HTTP server accepts traffic:

```typescript
await Promise.all([
  outboundWorker.run(),
  gmailIngestWorker.run(),
  app.listen({ port: PORT }),
]);
```

## Configuration (Environment Variables)

All secrets are sourced from Vault at startup via the Vault client. Non-secret config is from environment variables.

| Variable | Source | Description |
|----------|--------|-------------|
| `TEMPORAL_FRONTEND_ADDR` | Env | `temporal-frontend:7233` |
| `TEMPORAL_NAMESPACE` | Env | `de-v2-platform` |
| `TEMPORAL_TLS_CERT_PATH` | Env | Path to mTLS cert (mounted from K8s secret) |
| `REDIS_ADDR` | Env | `redis:6379` |
| `VAULT_ADDR` | Env | `http://vault:8200` |
| `VAULT_ROLE` | Env | K8s auth role for Vault |
| `GCP_PUBSUB_AUDIENCE` | Env | Expected OIDC audience for Gmail push (e.g. `https://webhook.de-v2.budy.bot/webhook/gmail`) |
| `PORT` | Env | HTTP listen port (default `8080`) |
| `LOG_LEVEL` | Env | `debug` / `info` / `warn` / `error` (default `info`) |
| `SLACK_TEAM_IDS` | Env | Comma-separated list of registered Slack team_ids |
| `GMAIL_ACCOUNTS` | Env | Comma-separated list of registered Gmail accounts |
| Slack bot tokens | Vault | `secret/de-v2/slack/{team_id}/bot-token` (per workspace) |
| Slack signing secrets | Vault | `secret/de-v2/slack/{team_id}/signing-secret` (per workspace) |
| Gmail OAuth tokens | Vault | `secret/de-v2/gmail/{email}/oauth-token` (per account) |

At startup, the gateway iterates `SLACK_TEAM_IDS` and `GMAIL_ACCOUNTS`, loads all secrets from Vault, and builds the adapter registry. If any secret is unavailable at startup, the process exits (fail-fast; no partial initialization).

## Slack Outbound — Block Kit

Slack Block Kit is the primary format for all Slack messages sent by de-v2 agents. The `blocks` field in `SendResponseInput` carries the Block Kit payload. The `content` field is required as a fallback (used in Slack notifications and for screen readers).

```typescript
// Example: report-agent sending a structured report
const input: SendResponseInput = {
  channel: "slack",
  channel_account_id: "T01TEAM",
  conversation_id: "slack/T01TEAM/channel/C01CHAN",
  thread_id: "1700000000.000100",
  content: "Weekly report ready. See details below.",   // fallback
  format: "plain",
  blocks: [
    {
      type: "header",
      text: { type: "plain_text", text: "Weekly Report — W15 2026" }
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: "*Total leads:*\n142" },
        { type: "mrkdwn", text: "*Conversion rate:*\n18.3%" },
        { type: "mrkdwn", text: "*Open tasks:*\n7" },
        { type: "mrkdwn", text: "*Closed tasks:*\n23" }
      ]
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "Generated by report-agent · Mon 13 Apr 2026" }]
    }
  ],
  idempotency_key: "wf-run-abc123:send-weekly-report",
  tenant_id: "tenant-acme",
};
```

The gateway validates that `blocks` is a non-empty array when `channel === "slack"` and logs a warning (but does not fail) if only `content` is provided (graceful degradation to plain text).

## Redis Usage

```typescript
// Sender name cache (Slack users.info)
const SENDER_NAME_TTL = 3600; // 1 hour
const senderKey = (teamId: string, userId: string) =>
  `cgw:sender:${teamId}:${userId}`;

// Idempotency cache (outbound dedup — sendResponse and updateMessage)
const IDEMPOTENCY_TTL = 86400; // 24 hours
const idemKey = (key: string) => `cgw:idem:${key}`;

// Interaction dedup (Slack may deliver the same interaction twice on network blips)
const INTERACTION_DEDUP_TTL = 600; // 10 minutes
const interactionKey = (triggerId: string) => `cgw:interaction:${triggerId}`;
```

### Redis Availability Policy

Redis availability is treated differently depending on the context:

### Outbound Temporal activities (`sendResponse`, `updateMessage`) — fail-closed.

The idempotency check is load-bearing: skipping it on a Redis outage risks posting a duplicate Slack message or double-updating a Block Kit card when Temporal retries the activity. Since these are Temporal activities, a Redis connectivity failure should throw a retryable `RedisUnavailableError` and let Temporal back off and retry. The activity must not proceed to the Slack/Gmail API call without confirming the idempotency state.

```typescript
// src/activities/send-response.ts (excerpt)
async function sendResponse(input: SendResponseInput): Promise<SendResponseOutput> {
  // 1. Check idempotency — FAIL THE ACTIVITY if Redis is unavailable.
  //    Temporal will retry with exponential backoff; no message is sent until
  //    we can confirm this key has not been processed before.
  let cached: SendResponseOutput | null;
  try {
    cached = await redis.get(idemKey(input.idempotency_key));
  } catch (err) {
    // Redis is down — throw retryable error. Do NOT proceed to Slack API.
    throw ApplicationFailure.retryable(
      "Redis unavailable: cannot verify idempotency state before sending",
      "RedisUnavailableError",
    );
  }

  if (cached) return cached; // Already sent — return cached result, no duplicate.

  // 2. Send to Slack / Gmail API.
  const result = await slackClient.chat.postMessage({ ... });

  // 3. Persist result. Best-effort: if Redis write fails after a successful send,
  //    log a warning. A retry would re-enter step 2 but the Slack API call is
  //    idempotent enough that a duplicate message is still preferable to crashing
  //    the activity at this point (the message was already delivered).
  try {
    await redis.set(idemKey(input.idempotency_key), result, "EX", IDEMPOTENCY_TTL);
  } catch (err) {
    logger.warn({ err, idempotency_key: input.idempotency_key },
      "Redis write failed after successful send — idempotency not persisted");
  }

  return result;
}
```

The same pattern applies verbatim to `updateMessage`.

### Inbound sender name cache (HTTP webhook handler) — fail-open.

The name cache is a performance optimization, not a correctness requirement. If Redis is unavailable during inbound normalization, the gateway falls back to calling Slack's `users.info` API directly or leaves `sender_name` undefined. The `AgentMessage` is still valid and dispatched. Failing the HTTP handler here would cause Slack to retry the webhook, which is unnecessary.

### Interaction deduplication (HTTP webhook handler) — fail-open.

Also in the HTTP handler, so Temporal retries cannot be leveraged. More importantly: stateless interactions are already deduplicated by Temporal's `REJECT_DUPLICATE` workflow ID policy. Direct-signal interactions may produce a duplicate Temporal signal in a Redis-down window, but waiting workflows should be designed to be idempotent to duplicate signals (the `condition()` guard fires once regardless). Log and alert on Redis connectivity loss; proceed with the interaction.

## Performance Characteristics

| Metric | Target | Measurement approach |
|--------|--------|---------------------|
| Webhook acknowledgment | p50 < 100ms, p99 < 500ms | k6 load test with mock Temporal |
| Temporal workflow start (after ack) | p50 < 200ms | Temporal SDK metrics |
| `sendResponse` end-to-end | p50 < 1s, p99 < 2s | Activity duration histogram |
| Throughput per pod | 1,000+ req/s | k6 sustained load test |
| Memory per pod | < 300MB steady state | Container metrics |

## Testing Strategy

### Unit tests

- Slack signature validation (valid, invalid, expired timestamp)
- `buildMessageId` determinism (same input always yields same UUID)
- `buildSlackConversationId` / `buildSlackSessionKey` (all chat type variants)
- AgentMessage normalization for Slack (DM, channel message, threaded reply, with/without attachments)
- AgentMessage normalization for Gmail (with/without attachments, with/without In-Reply-To)
- `sendResponse` idempotency check logic (cache hit → return cached, cache miss → send)

### Integration tests

- Slack webhook handler with mocked Temporal client → verifies workflow started with correct workflowId
- Gmail webhook handler → verifies `GmailIngestWorkflow` started
- Outbound `sendResponse` with mocked Slack/Gmail client → verifies correct API calls made
- Duplicate event → verifies `REJECT_DUPLICATE` is handled silently

### E2E tests (manual / CI with test accounts)

- Send a Slack DM to the bot → observe RouterWorkflow start in Temporal UI
- Send a Slack channel message with file attachment → observe AgentMessage with attachment in workflow input
- Agent calls `sendResponse` with Block Kit → verify rendered message in Slack
- Send email to test Gmail account → observe GmailIngestWorkflow + RouterWorkflow in Temporal UI

### Load tests (k6)

- 1,000 req/s sustained for 5 minutes against `/webhook/slack` with mocked Temporal
- Target: 0 errors, p99 latency < 500ms, memory stable

## Observability

### Prometheus metrics

| Metric | Type | Labels |
|--------|------|--------|
| `cgw_inbound_requests_total` | Counter | `channel`, `status` (ok/error/duplicate/noop) |
| `cgw_inbound_duration_seconds` | Histogram | `channel` |
| `cgw_temporal_start_total` | Counter | `workflow`, `status` (started/duplicate/error) |
| `cgw_temporal_start_duration_seconds` | Histogram | `workflow` |
| `cgw_send_response_total` | Counter | `channel`, `status` (ok/retried/permanent_error) |
| `cgw_send_response_duration_seconds` | Histogram | `channel` |
| `cgw_interactions_total` | Counter | `action_type`, `routing_mode` (signal/router) |
| `cgw_interactions_duration_seconds` | Histogram | `routing_mode` |
| `cgw_interim_ack_total` | Counter | `status` (ok/failed) |
| `cgw_update_message_total` | Counter | `status` |
| `cgw_update_message_duration_seconds` | Histogram | — |
| `cgw_idempotency_hits_total` | Counter | `channel`, `operation` (send/update) |
| `cgw_redis_errors_total` | Counter | `operation` |

### Log fields (structured JSON via pino)

Every log line includes:

```json
{
  "timestamp": "2026-04-13T12:00:00.000Z",
  "level": "info",
  "message": "...",
  "request_id": "<uuid>",
  "channel": "slack",
  "channel_account_id": "T01TEAM",
  "message_id": "<uuid>",
  "tenant_id": "tenant-acme",
  "duration_ms": 42
}
```

Sensitive content (message body, sender email) is never logged. Attachments log only metadata (name, type, size), not URLs.

## Deployment Configuration

### Kubernetes Deployment (skeleton)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: comms-gateway-1
  namespace: de-v2-platform
  labels:
    app: comms-gateway-1
    version: "0.1.0"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: comms-gateway-1
  template:
    metadata:
      labels:
        app: comms-gateway-1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8081"
    spec:
      serviceAccountName: comms-gateway-1
      containers:
      - name: gateway
        image: de-v2/comms-gateway-1:latest
        ports:
        - containerPort: 8080
          name: webhook
        - containerPort: 8081
          name: metrics
        env:
        - name: TEMPORAL_FRONTEND_ADDR
          value: temporal-frontend:7233
        - name: TEMPORAL_NAMESPACE
          value: de-v2-platform
        - name: REDIS_ADDR
          value: redis:6379
        - name: VAULT_ADDR
          value: http://vault:8200
        - name: VAULT_ROLE
          value: comms-gateway-1
        - name: GCP_PUBSUB_AUDIENCE
          value: https://webhook.de-v2.budy.bot/webhook/gmail
        - name: PORT
          value: "8080"
        - name: LOG_LEVEL
          value: info
        - name: SLACK_TEAM_IDS
          valueFrom:
            configMapKeyRef:
              name: comms-gateway-1-config
              key: slack_team_ids
        - name: GMAIL_ACCOUNTS
          valueFrom:
            configMapKeyRef:
              name: comms-gateway-1-config
              key: gmail_accounts
        resources:
          requests:
            memory: 256Mi
            cpu: 200m
          limits:
            memory: 512Mi
            cpu: 500m
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 15
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - name: temporal-tls
          mountPath: /etc/temporal/tls
          readOnly: true
      volumes:
      - name: temporal-tls
        secret:
          secretName: temporal-client-tls

---
apiVersion: v1
kind: Service
metadata:
  name: comms-gateway-1
  namespace: de-v2-platform
spec:
  selector:
    app: comms-gateway-1
  ports:
  - name: webhook
    port: 8080
    targetPort: 8080
  - name: metrics
    port: 8081
    targetPort: 8081
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: comms-gateway-1-ingress
  namespace: de-v2-platform
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  rules:
  - host: webhook.de-v2.budy.bot
    http:
      paths:
      - path: /webhook
        pathType: Prefix
        backend:
          service:
            name: comms-gateway-1
            port:
              number: 8080

---
# KEDA ScaledObject for HTTP-based autoscaling
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: comms-gateway-1-scaler
  namespace: de-v2-platform
spec:
  scaleTargetRef:
    name: comms-gateway-1
  minReplicaCount: 2
  maxReplicaCount: 8
  triggers:
  - type: prometheus
    metadata:
      serverAddress: http://prometheus:9090
      metricName: cgw_inbound_requests_total
      threshold: "800"
      query: |
        sum(rate(cgw_inbound_requests_total[1m])) /
        count(kube_pod_info{pod=~"comms-gateway-1-.*"})

---
# RBAC: allow gateway service account to read Vault secrets via K8s auth
apiVersion: v1
kind: ServiceAccount
metadata:
  name: comms-gateway-1
  namespace: de-v2-platform
  annotations:
    vault.hashicorp.com/role: comms-gateway-1
```

## Security Considerations

- **Slack signatures:** Every inbound request validates HMAC-SHA256. Requests with invalid signatures or timestamp skew > 5 minutes are rejected with HTTP 400. This prevents webhook spoofing.
- **GCP OIDC:** Gmail Pub/Sub push endpoint verifies the Google-issued OIDC JWT in `Authorization: Bearer`. The `audience` claim is validated against the known webhook URL. Prevents unauthorized Pub/Sub messages.
- **No secrets in logs:** Bot tokens, OAuth tokens, and signing secrets are never logged. Message content is never logged (only metadata: channel, message_id, tenant_id).
- **Network policy:** The gateway pod accepts inbound traffic only on port 8080 from the ALB Ingress controller. Temporal mTLS secures the backend connection to `temporal-frontend:7233`. Redis connection is cluster-internal only.
- **Vault lease renewal:** A background goroutine (or the Vault sidecar) renews Vault leases before expiry. If a token fails to renew, the process alerts and eventually exits (fail-safe — better to stop sending than to use stale credentials).
- **Cross-tenant isolation:** `tenant_id` is always extracted from the channel's account identifier (Slack `team_id`, Gmail account address), never from user-supplied content. A user cannot spoof a different tenant by modifying message content.
