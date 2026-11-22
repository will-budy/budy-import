---
name: Comms Gateway 1 — PRD
code: comms-gateway-1-prd
version: 0.5
status: in-review
last_updated: 2026-04-13
---

# Comms Gateway 1 — Product Requirements

## Why This Exists

Budy agents receive messages from multiple external surfaces — Slack workspaces and Gmail inboxes in Phase 1, with more channels to follow. Without a dedicated ingress layer, every agent would need to speak Slack's event format, Gmail's Pub/Sub protocol, and each channel's authentication scheme. That coupling multiplies coordination overhead and makes adding a new channel a platform-wide refactor.

Comms Gateway 1 solves this by owning the boundary. It is the only component in de-v2 that ever speaks Slack or Gmail's native protocol. Everything inside the platform speaks `AgentMessage` — a single canonical envelope regardless of where the message originated.

On the outbound side, agents need to reply to users without knowing which channel or thread to target, and without managing API credentials or rate limits per channel. Comms Gateway 1 exposes Temporal activities that let agents post replies with a single call — Comms Gateway 1 handles the rest.

## What It Does

**Inbound:** Comms Gateway 1 receives external event notifications (webhooks, Pub/Sub pushes), validates their authenticity, normalizes each event into a canonical `AgentMessage` envelope, and hands it off to a Comms Router 1 in Temporal for further processing.

**Outbound:** Comms Gateway 1 exposes Temporal activities (`gateway.sendResponse`, `gateway.updateMessage`) that Agent Workers call to deliver replies back to the correct Slack channel or Gmail thread — including structured Slack Block Kit messages.

Comms Gateway 1 does not route, classify, execute, or store anything. It normalizes and dispatches inbound; it delivers outbound.

## Phase 1 Scope

### Supported Channels

| Channel | Inbound | Outbound |
|---------|---------|----------|
| Slack messages | Events API webhook | `chat.postMessage` / `chat.update` |
| Slack interactive components | Interactive Components endpoint | `response_url` + `chat.update` |
| Gmail | GCP Pub/Sub push | Gmail API `users.messages.send` |

### Inbound Responsibilities

- Accept and immediately acknowledge Slack and Gmail webhook deliveries within their hard time windows (Slack: 3 s; Gmail Pub/Sub: ack deadline)
- Reject events with invalid signatures or unrecognized senders
- Normalize Slack messages, Slack interactive component payloads, and Gmail messages into `AgentMessage` / `InteractionEvent` envelopes
- Guarantee at-most-once dispatch into Temporal (no duplicate agent executions for the same external event)
- For Slack interactions: give the user immediate feedback ("Processing…") before the agent finishes — within the Slack 3-second UX window
- Pass file attachment CDN URLs through without downloading or storing content

### Outbound Responsibilities

- Deliver agent replies to the correct Slack channel or Gmail thread
- Support plain text, Slack mrkdwn, and Slack Block Kit structured messages
- Replace a previously sent Block Kit message in-place (used after an interaction is handled)
- Handle API retries and rate limits transparently — calling agents are unaware
- Enforce idempotency on every outbound call using a caller-provided key

## What Comms Gateway 1 Is NOT Responsible For

- **Routing**: which agent handles a message (Comms Router 1)
- **Intent classification**: what the user wants (Comms Router 1 + LLM)
- **Skill execution**: running tools or workflows (Agent Workers)
- **Message storage or history**: persisting conversation content (Temporal history + Memory Service)
- **Memory consolidation**: summarising past context (Memory Service)
- **End-user authentication**: verifying who a human user is (Auth Service)
- **File downloads**: fetching Slack attachment content (agents or a dedicated media pipeline)
- **Tenant resolution for Slack**: mapping a Slack workspace to a Budy tenant (Comms Router 1, via `agent_bindings` table)

## Success Criteria

| Metric | Target |
|--------|--------|
| Slack webhook acknowledgment latency | p50 < 100 ms, p99 < 500 ms |
| Gmail Pub/Sub acknowledgment latency | p50 < 100 ms, p99 < 500 ms |
| Temporal workflow dispatch latency (after ack) | p50 < 200 ms |
| Interaction interim ack ("Processing…") | < 1 s after receiving interaction |
| `gateway.sendResponse` end-to-end latency | p50 < 1 s, p99 < 2 s |
| `gateway.updateMessage` end-to-end latency | p50 < 1 s, p99 < 2 s |
| Duplicate message processing rate | 0 % (hard guarantee via Temporal workflow ID collision policy) |
| Cross-tenant message contamination | 0 incidents |
| Message loss on gateway crash | 0 (Slack and Pub/Sub retry; Temporal guarantees at-most-once) |
| Throughput per replica | 1,000 + req/s |

## Phase 1 UAT Acceptance Criteria

These scenarios must pass before Phase 1 ships. Each maps to an observable end-to-end outcome; they do not prescribe implementation detail.

| # | Scenario | Pass condition |
|---|----------|---------------|
| 1 | Slack DM sent to the bot | Agent receives `AgentMessage` with correct `conversation_id`, `session_key`, and `sender_id` |
| 2 | Slack channel message mentioning the bot | Agent receives `AgentMessage` with `chat_type: "channel"` and `channel_account_id` matching the workspace `team_id` |
| 3 | Threaded reply in Slack | `session_key` includes the parent thread timestamp; Router correctly scopes conversation continuity |
| 4 | `@app_mention` event | Normalized and dispatched identically to a regular channel message; no special-case path leaks into agents |
| 5 | Slack message with file attachment | `AgentMessage.attachments` contains the CDN URL; gateway does not fetch or store the file |
| 6 | Identical Slack event delivered twice (Slack retry) | Second event triggers no new Comms Router 1 execution; Temporal dedup guarantee verified by checking workflow history |
| 7 | Slack button click with `action_id` prefixed `wf:<wf_id>:<signal>` | Gateway sends a Temporal signal directly to the referenced workflow; no new Comms Router 1 started |
| 8 | Slack button click with unprefixed `action_id` | Gateway starts a new Comms Router 1 with `InteractionEvent`; interim "Processing…" ack sent to user within 1 s |
| 9 | Gmail message arrives for a watched account | Agent receives `AgentMessage` with `channel: "email"`, correct `tenant_id` (resolved at gateway), and correct threading identifiers |
| 10 | Gmail message with attachment | `AgentMessage.attachments` contains MIME part metadata; gateway does not download attachment content |
| 11 | Agent sends plain-text reply via `gateway.sendResponse` | Message delivered to correct Slack channel or Gmail thread; delivery confirmed by presence in channel |
| 12 | Agent sends Block Kit reply via `gateway.sendResponse` | Structured message rendered in Slack; Gmail degrades gracefully to plain-text content |
| 13 | Agent replies to Gmail thread | Sent message includes correct `In-Reply-To` and `References` headers; reply appears inside the original thread |
| 14 | Gateway pod restarts mid-ingest | No messages lost; Slack/Pub/Sub retry delivers event; Temporal dedup prevents double-processing |
| 15 | Redis unavailable during `sendResponse` | Activity throws a retryable error; Temporal backs off and retries; message eventually delivered when Redis recovers |
| 16 | Slack webhook with invalid HMAC signature | Gateway returns HTTP 400; event discarded; no workflow started |
| 17 | Gmail Pub/Sub push for unknown account | Gateway acknowledges Pub/Sub (to prevent redelivery loop) and records an alert; no workflow started |

## Phase 2 / Deferred Scope

The following items are explicitly out of scope for Phase 1 and will be addressed in a later phase:

- **Slack slash commands and modals** (`/command`, `views.open`): Slack's `trigger_id` TTL (3 s) is incompatible with async Temporal dispatch without synchronous gateway-side pre-opening logic. Deferred to Phase 2.
- **WhatsApp, Microsoft Teams, SMS**: Channels accommodated by the adapter pattern but not implemented. Adding a new channel requires only a new adapter and does not change core gateway logic.
- **Webhook-level rate limiting per caller**: Per-`channel_account_id` rate limiting at the HTTP layer (currently handled implicitly by Slack/Gmail retry behaviour and Temporal concurrency).
- **Outbound reactions** (`gateway.sendReaction`): Slack emoji reactions. Activity stub defined in nexus contracts; implementation deferred.
- **Tenant-provided fallback message templates**: Outbound error messages sent by Comms Router 1 when no agent is available are currently hardcoded. Tenant customization is a Phase 2 UX item.
- **Analytics event emission from gateway**: Per-event routing telemetry (e.g., to Kafka or a data warehouse) beyond structured logs and OTEL metrics.
