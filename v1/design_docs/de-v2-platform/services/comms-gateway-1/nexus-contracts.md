---
name: Comms Gateway 1 — Nexus Contracts
code: comms-gateway-1-nexus
version: 0.4
status: in-review
last_updated: 2026-04-13
---

# Comms Gateway 1 — Nexus Contracts

Comms Gateway 1 participates in the Temporal Nexus topology in two roles:

1. **Nexus service provider** — exposes `gateway.sendResponse` which Agent Workers in tenant namespaces call to deliver replies to Slack or Gmail.
2. **Workflow starter** — starts `RouterWorkflow` in the shared namespace (direct `temporalClient.start()`, not Nexus; covered in the HLD).

---

## Operations Exposed

### `gateway.sendResponse`

**Called by:** Digital Entity 2 workflows, running in any tenant namespace.

**Purpose:** The single outbound path for all agent-generated messages. Agents never call Slack or Gmail APIs directly — this activity owns all credentials, rate limiting, retry logic, Block Kit rendering, and idempotency.

**Nexus service name:** `gateway`
**Operation name:** `sendResponse`
**Task queue:** `gateway.activities` (shared namespace, Comms Gateway 1 activity worker)

#### Send Response Input

```typescript
interface SendResponseInput {
  // ── Target ──────────────────────────────────────────────────────────
  channel: "slack" | "email";

  channel_account_id: string;
  // Which registered Slack workspace or Gmail account to send through.
  // Slack:  workspace team_id (T…) — determines which bot token is used.
  // Email:  receiving Gmail account address (e.g. ops@acme.com) — determines
  //         which OAuth credential is used, and which account sends the reply.
  // This field is available on the AgentMessage that was dispatched to the agent.

  conversation_id: string;
  // Normalized conversation identifier from the originating AgentMessage.
  // Gateway uses this to derive the platform-specific channel/room/mailbox to send to.
  // Format: "<channel>/<channel_account_id>/<chat_type>/<native_id>"

  thread_id?: string;
  // Platform-native thread root. If provided:
  //   Slack  — reply is posted as a thread reply under this thread_ts.
  //   Email  — reply is sent in the same Gmail thread (sets In-Reply-To / References headers).
  // If omitted, message is posted to the top-level channel or as a new email.

  // ── Content ─────────────────────────────────────────────────────────
  content: string;
  // Plain-text message body. Always required.
  // Used as the email body (plain text) and as the Slack fallback text
  // (shown in notifications, accessibility tools, and when blocks fail to render).

  format: "plain" | "mrkdwn";
  // Applies to the `content` field.
  // "mrkdwn": Slack markdown (*bold*, _italic_, `code`, bullet lists).
  // "plain":  literal text, no markup interpretation.
  // Email channel always treats content as plain text regardless of format.
  // If format is "mrkdwn" and channel is "email", the gateway sends content as-is
  // (mrkdwn is human-readable as plain text — asterisks and underscores remain literal).
  // No error is thrown; the degradation is intentional. Agents targeting both channels
  // should author content that reads well as plain text even with mrkdwn syntax present.

  blocks?: SlackBlock[];
  // Slack Block Kit blocks array. Optional, but strongly recommended for all Slack messages.
  // Block Kit is the primary rendering format for de-v2 agents in Slack.
  // The gateway validates that blocks conform to the Slack Block Kit schema before sending.
  // Email channel ignores this field entirely.
  //
  // Agents SHOULD provide blocks for any structured output (reports, summaries,
  // status updates). Plain content alone is acceptable only for simple acknowledgments.
  //
  // See: https://api.slack.com/reference/block-kit/blocks

  // ── Reply threading ──────────────────────────────────────────────────
  reply_to_message_id?: string;
  // Platform message ID to reply to.
  // Slack:  sets `thread_ts` on chat.postMessage (creates / continues a thread).
  // Email:  sets In-Reply-To and References MIME headers (RFC 2822 thread continuity).
  // Usually the same as `thread_id`; may differ if replying to a specific message
  // within a thread rather than the thread root.

  // ── Idempotency ──────────────────────────────────────────────────────
  idempotency_key: string;
  // Prevents duplicate sends when Temporal retries the activity.
  // Caller constructs this as a stable key within the workflow run.
  // Recommended format: "<workflow_run_id>:<step_identifier>"
  // Example: "01J8KXYZ-abc123-def456:send-weekly-report"
  //
  // The gateway stores the result in Redis (TTL 24h) keyed by this value.
  // On a retry with the same key, the cached result is returned without re-sending.

  // ── Multi-tenancy ────────────────────────────────────────────────────
  tenant_id: string;
  // Resolved tenant identifier. Set by the Comms Router 1 before dispatching
  // the task to the agent. Required for audit logging, cost attribution, and
  // cross-tenant isolation enforcement.
}
```

#### Send Response Output

```typescript
interface SendResponseOutput {
  message_id: string;
  // Platform-specific ID of the sent message.
  // Slack: `ts` of the posted message (e.g. "1713000000.000200").
  // Email: Gmail message ID (e.g. "18ef123abc456def").
  // Use this as `reply_to_message_id` in subsequent calls to thread replies correctly.

  thread_id: string;
  // Thread root ID for subsequent replies.
  // Slack: the `thread_ts` of the thread this message belongs to.
  //        If this was a top-level message, equals `message_id`.
  // Email: the Gmail `threadId` of the sent message's thread.
  // Pass as `thread_id` on future sendResponse calls to post into the same thread.

  channel_id: string;
  // Slack: the channel or DM ID where the message was posted (e.g. "C01CHAN", "D01DM").
  // Email: the recipient address.
  // Required when calling gateway.updateMessage — pass as UpdateMessageInput.channel_id.

  sent_at: string;
  // ISO8601 timestamp of when the message was delivered to the platform API.

  channel: "slack" | "email";
  channel_account_id: string;
}
```

#### Send Response Error Types

```typescript
// All errors are thrown as Temporal ApplicationFailure.
// retryable=true  → Temporal retries per the configured retry policy.
// retryable=false → Temporal does not retry; error propagates to the calling workflow.

RedisUnavailableError  // retryable=true  — Redis is down; activity will not proceed until Redis
                       // recovers (fail-closed to prevent duplicate delivery on retry).
SlackPermanentError    // retryable=false — Slack 4xx response (bad channel, invalid token, etc.)
GmailPermanentError    // retryable=false — Gmail 4xx response
SlackTransientError    // retryable=true  — Slack 5xx or network error
GmailTransientError    // retryable=true  — Gmail 5xx or network error
InvalidChannelError    // retryable=false — unsupported channel value in input
TargetNotFoundError    // retryable=false — conversation_id does not resolve to a known channel/DM/mailbox
RateLimitError         // retryable=true  — 429 from Slack or Gmail; Temporal respects backoff
```

#### Retry Policy

```typescript
// Applied by Temporal on the activity execution:
{
  initialInterval:    "1s",
  backoffCoefficient: 2.0,
  maximumInterval:    "30s",
  maximumAttempts:    10,       // for retryable errors
  nonRetryableErrorTypes: [
    // Input errors — bad caller data, no point retrying
    "InvalidChannelError",          // unsupported channel value
    "TargetNotFoundError",          // conversation_id resolves to unknown channel/DM/mailbox
    // Slack/Gmail permanent failures — 4xx responses that will not change on retry
    "SlackPermanentError",          // wraps Slack 4xx (except 429); set retryable=false by gateway
    "GmailPermanentError",          // wraps Gmail 4xx (except 429); set retryable=false by gateway
  ],
}
```

#### Send Response SLA

| Metric | Target |
|--------|--------|
| p50 latency (first attempt) | < 1s |
| p99 latency (first attempt) | < 2s |
| Delivery success rate (with retries) | > 99.5% |

---

### `gateway.updateMessage`

**Called by:** Digital Entity 2 workflows, after handling a Slack interaction event.

**Purpose:** Replaces the Block Kit blocks of an existing Slack message in-place. The primary use case is replacing the gateway's interim "Processing…" loading state with the agent's final result after a button click or select action. Also used for any scenario where the agent wants to update an earlier message it sent (e.g., marking a report as "Reviewed" after an action).

**Nexus service name:** `gateway`
**Operation name:** `updateMessage`
**Task queue:** `gateway.activities`

#### Update Message Input

```typescript
interface UpdateMessageInput {
  // ── Target ──────────────────────────────────────────────────────────
  channel: "slack";
  // Phase 1: Slack only. Email does not support in-place message editing.

  channel_account_id: string;
  // Slack team_id — determines which bot token is used.

  channel_id: string;
  // Slack channel ID where the message to update lives.
  // For interactions: use InteractionEvent.source_channel_id.

  message_ts: string;
  // Slack ts of the message to update (Slack's unique message identifier).
  // For interactions: use InteractionEvent.source_message_ts.
  // For updating a previously sent message: use SendResponseOutput.message_id.

  // ── Content ─────────────────────────────────────────────────────────
  content: string;
  // New plain-text fallback. Always required. Replaces the previous text field.

  blocks: SlackBlock[];
  // New Block Kit blocks. Replaces the entire blocks array of the original message.
  // The agent is responsible for including any content from the original message
  // that should be preserved (the update is a full replacement, not a patch).

  // ── Idempotency ──────────────────────────────────────────────────────
  idempotency_key: string;
  // Same convention as sendResponse: "<workflow_run_id>:<step_name>"

  // ── Multi-tenancy ────────────────────────────────────────────────────
  tenant_id: string;
}
```

#### Update Message Output

```typescript
interface UpdateMessageOutput {
  message_ts: string;    // Same as input message_ts (Slack returns this on chat.update)
  updated_at: string;    // ISO8601
  channel: "slack";
  channel_account_id: string;
}
```

#### Update Message Error Types

```typescript
RedisUnavailableError  // retryable=true  — same fail-closed policy as sendResponse
MessageNotFoundError   // retryable=false — message_ts does not exist or was deleted
TargetNotFoundError    // retryable=false — channel_id is invalid or inaccessible
SlackPermanentError    // retryable=false — Slack 4xx
SlackTransientError    // retryable=true  — Slack 5xx
RateLimitError         // retryable=true  — 429 from Slack
```

#### Update Message SLA

| Metric | Target |
|--------|--------|
| p50 latency | < 1s |
| p99 latency | < 2s |

---

### `gateway.sendReaction` _(Future — Phase 2)_

Not implemented in Phase 1. Placeholder for adding a Slack emoji reaction to a message (e.g., ✅ when a task is complete, ⏳ while processing).

```typescript
// Future contract (indicative):
interface SendReactionInput {
  channel: "slack";
  channel_account_id: string;
  conversation_id: string;
  message_ts: string;       // The message to react to
  emoji: string;            // e.g. "white_check_mark", "hourglass_flowing_sand"
  tenant_id: string;
}
```

---

## Operations Consumed

**None.** Comms Gateway 1 does not call Nexus operations on other services. Its outbound interactions are:

- Starting `RouterWorkflow` via direct `temporalClient.start()` (not Nexus)
- Starting `GmailIngestWorkflow` via direct `temporalClient.start()` (not Nexus)

---

## Versioning Policy

If the `SendResponseInput` or `SendResponseOutput` schema changes incompatibly (field removed, type narrowed, semantics changed), a new operation version is introduced:

```text
gateway.sendResponse    → current
gateway.sendResponse.v2 → future breaking change
```

The old version continues to be served until all callers (Agent Workers) have migrated. Both versions can coexist on the same activity worker by dispatching on a version tag. Additive changes (new optional fields) do not require a version bump.

---

## Caller Guidance for Agent Workers

### Boundary note: AgentTask is defined by the Comms Router 1

The gateway sends `{ message: AgentMessage }` or `{ event: InteractionEvent }` to `RouterWorkflow`. The Router transforms this into an `AgentTask` before dispatching to agents via Nexus. The exact shape of `AgentTask` is defined in the **comms-router-1 nexus contracts**, not here. The examples below use `task.message` and `task.interaction` as representative field names — confirm the actual field names in the Comms Router 1's nexus contract before implementing.

---

When calling `gateway.sendResponse` from a workflow or activity:

```typescript
// Example: support-agent workflow replying to a Slack thread

import { proxyActivities } from "@temporalio/workflow";
import type { SendResponseInput, SendResponseOutput } from "@de-v2/gateway-types";

const { sendResponse } = proxyActivities<{
  sendResponse(input: SendResponseInput): Promise<SendResponseOutput>;
}>({
  startToCloseTimeout: "30s",
  retry: {
    // Use the gateway's declared retry policy; do not override unless intentional.
    maximumAttempts: 10,
  },
});

// Inside the workflow:
const result = await sendResponse({
  channel: task.message.channel,
  channel_account_id: task.message.channel_account_id,
  conversation_id: task.message.conversation_id,
  thread_id: task.message.thread_id,
  content: "I've reviewed your request. Here's what I found:",
  format: "mrkdwn",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Summary:* Your onboarding for John Smith is complete.",
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: "*Status:*\n✅ Complete" },
        { type: "mrkdwn", text: "*Completed by:*\nsupport-agent" },
      ],
    },
  ],
  reply_to_message_id: task.message.channel_message_id,
  idempotency_key: `${workflowInfo().runId}:send-final-reply`,
  tenant_id: task.tenant_id,
});
```

Key rules for callers:

1. **Always provide `blocks` for Slack structured output.** Plain `content` alone is acceptable only for simple one-line acknowledgments.
2. **Always set `idempotency_key` using `workflowInfo().runId` + a stable step name.** Do not use random values — they defeat deduplication on retry.
3. **Propagate `channel_account_id`, `conversation_id`, and `thread_id` directly from the `AgentTask` input.** Do not reconstruct them — they were normalized by the gateway and must be round-tripped unchanged.
4. **Do not catch and swallow non-retryable errors silently.** Surface them to the workflow so the Router can trigger a fallback response.

---

## Caller Guidance for Interaction Flows

### Direct-signal mode (approval / multi-step wizard)

The agent workflow sends a Block Kit message with action-encoded routing, then waits for a Temporal signal:

```typescript
// Step 1: Agent sends a Block Kit message with action_ids encoding the workflow ID
const sent = await sendResponse({
  channel: "slack",
  channel_account_id: task.message.channel_account_id,
  conversation_id: task.message.conversation_id,
  thread_id: task.message.thread_id,
  content: "Please approve or reject the onboarding for John Smith.",
  format: "plain",
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Approve onboarding for John Smith?*" }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "Approve" },
          // "wf:" prefix tells the gateway to signal this workflow
          action_id: `wf:${workflowInfo().workflowId}:user_approval:approve`,
          value: "approve"
        },
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "Reject" },
          action_id: `wf:${workflowInfo().workflowId}:user_approval:reject`,
          value: "reject"
        }
      ]
    }
  ],
  idempotency_key: `${workflowInfo().runId}:send-approval-request`,
  tenant_id: task.tenant_id,
});

// Step 2: Workflow waits for the signal (gateway delivers it when user clicks)
const approval = await condition(() => approvalSignalReceived, "7 days");

// Step 3: Update the original message to reflect the decision
await updateMessage({
  channel: "slack",
  channel_account_id: task.message.channel_account_id,
  channel_id: sent.channel_id,         // available from SendResponseOutput
  message_ts: sent.message_id,          // the ts of the message we sent in Step 1
  content: `Onboarding ${approval.value === "approve" ? "approved" : "rejected"} by ${approval.actor_name}`,
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: approval.value === "approve"
          ? "✅ *Approved* by " + approval.actor_name
          : "❌ *Rejected* by " + approval.actor_name
      }
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Decided ${new Date().toISOString()}` }]
    }
  ],
  idempotency_key: `${workflowInfo().runId}:update-approval-result`,
  tenant_id: task.tenant_id,
});
```

### Stateless mode (lookup, navigation)

When the user clicks a button with no `wf:` prefix, the gateway starts a new `RouterWorkflow` with the `InteractionEvent`. The agent receives this as a new task and calls `updateMessage` (not `sendResponse`) to replace the interim loading state with its result:

```typescript
// The agent task will have task.interaction set (populated by Router from InteractionEvent)
// Agent generates result, then replaces the loading state:
await updateMessage({
  channel: "slack",
  channel_account_id: task.interaction.channel_account_id,
  channel_id: task.interaction.source_channel_id,
  message_ts: task.interaction.source_message_ts,   // the original message with the button
  content: "Q1 2026 Report",
  blocks: reportBlocks,                              // agent-generated Block Kit
  idempotency_key: `${workflowInfo().runId}:update-with-report`,
  tenant_id: task.tenant_id,
});
```

Key rules for interaction callers:

1. **Always use `updateMessage` (not `sendResponse`) to replace the interim loading state.** The gateway already called `response_url` with "Processing…"; calling `sendResponse` would post a new message instead of replacing the existing one.
2. **Encode routing in `action_id` using the `wf:` prefix** for any flow that requires a waiting workflow to be signaled. Do not use ephemeral workflow IDs or run IDs that may change on retry — use the deterministic `workflowInfo().workflowId`.
3. **Do not rely on `response_url` from within the agent.** It is consumed by the gateway for the interim ack. Agents interact with Slack exclusively through `gateway.updateMessage` and `gateway.sendResponse`.
4. **`UpdateMessageInput.blocks` is a full replacement.** If the original message had context the agent wants to preserve (e.g., the original request text), re-include it in the new blocks array explicitly.
