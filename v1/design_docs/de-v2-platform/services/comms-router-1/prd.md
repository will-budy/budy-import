---
name: Comms Router 1 — PRD
code: comms-router-1-prd
version: 0.1
status: draft
last_updated: 2026-04-11
---

# Comms Router 1 — Product Requirements

## Purpose

Central message-to-agent routing decision engine. When Comms Gateway 1 receives a message, it starts a Comms Router 1 in the shared Temporal namespace. The Router applies layered routing heuristics (explicit binding, thread continuity, intent classification) to determine which agent should handle the message. Once routed, it dispatches a task to the selected agent via Nexus. If no suitable agent is found, it sends a fallback response.

The Router's decisions benefit from Temporal's durability: if it crashes mid-routing, it replays and completes without reprocessing the message.

## Consumers / Users

### Callers:

- Comms Gateway 1 (starts the Comms Router 1 on every inbound message)

### Consumers of Router's decision:

- Agent Workers (receive task dispatch via Nexus `agent.executeTask`)

## Core Responsibilities

- **Explicit binding lookup**: Query PostgreSQL to check if the originating Slack channel or email address is explicitly assigned to a specific agent. If yes, route there immediately.
- **Thread continuity**: Check if this thread_id has an active agent assignment (agent handled it before). If yes, continue with the same agent (for consistency).
- **Intent classification**: If no explicit binding or thread continuity, call LLM (Haiku-class) with the message content and descriptions of available agents. LLM returns the best-fit agent.
- **Fallback routing**: If no suitable agent found, send a polite "I don't understand" response back to the channel via `gateway.sendResponse`.
- **Nexus dispatch**: Make a Nexus call from the shared namespace into the tenant's agent namespace, invoking `agent.executeTask(agentId, taskPayload)`.
- **Error handling**: If all routing fails, notify admin and route to default support agent if available.

## What It Is NOT Responsible For

- Message ingestion or channel communication (Comms Gateway 1's job)
- LLM reasoning or task execution (Digital Entity 2's job)
- Skill management or versioning (Skill Service's job)
- Memory consolidation or semantic search (Memory Service's job)
- Message persistence or logging (Temporal history handles that)

## Success Criteria

- Routing decision made within < 500ms (latency target)
- Correct agent selection: explicit binding routes to correct agent 99.9% of the time
- Thread continuity respected: same agent continues on follow-up messages in same thread > 95% of the time (pending agent availability)
- Intent classification accuracy: LLM selects appropriate agent for unbound messages > 90% of the time (measured via human feedback loop)
- Fallback routing: if no suitable agent found, user receives polite response instead of error or silence
- Zero message loss: failed routing decisions are retried via Temporal retry policy; no messages are silently dropped

## Open Questions

- What is the list of available agents at Router startup? Static from agent_registry table or dynamic lookup?
- Should Router cache agent descriptions and intent classifications, or fetch fresh on each decision?
- How should the fallback "I don't understand" response be customized per tenant?
- Should Router emit events/metrics for each routing decision for analytics/debugging? (Addressed in TRD)
- If intent LLM classification returns multiple candidates with similar scores, how should Router break ties? (Addressed in TRD)
