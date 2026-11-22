---
name: Digital Entity 2 — PRD
code: digital-entity-2-prd
version: 0.1
status: draft
last_updated: 2026-04-11
---

# Digital Entity 2 — Product Requirements

## Purpose

The core reasoning engine and task execution runtime for de-v2. Each agent is a Temporal worker deployed as a K8s Deployment that polls a task queue for work. The digital entity 2 runs the LLM-driven reasoning loop: receive task, load context (memories and skills), call Claude, execute tools, generate response, save memories, and complete. Multiple replicas on the same task queue enable horizontal scaling.

Agent workers are stateless pods; all state lives in PostgreSQL, Redis, S3, and Temporal history.

## Consumers / Users

### Task dispatch:

- Comms Router 1 (sends tasks via Nexus `agent.executeTask`)
- End users (indirectly via Slack/email, routed by Router)

### Dependencies:

- Memory Service (load/save episodic and core memories)
- Skill Service (fetch assigned skills)
- Comms Gateway 1 (send responses back to users)
- LiteLLM Proxy (call Claude for reasoning)

## Core Responsibilities

- **Bootstrap**: At pod startup, read agent config, fetch skills and core memories, initialize Temporal worker
- **Task polling**: Poll assigned task queue for work dispatches from Router
- **Context loading**: Fetch memories (episodic + core) and skills relevant to the task
- **LLM reasoning loop**: Call Claude with task + context, process tool calls (skills), iterate until final response
- **Response posting**: Send final response back to user via `gateway.sendResponse` activity
- **Memory persistence**: Save episodic memory of conversation turn after each task completion
- **State management**: All state lives in PostgreSQL, Redis, or S3 (no local state between tasks except emptyDir scratch)
- **Graceful shutdown**: Complete in-flight tasks before terminating; Temporal handles rebalancing

## What It Is NOT Responsible For

- Message routing or intent classification (Comms Router 1's job)
- Skill versioning or approval (Skill Service's job)
- Memory consolidation or semantic search (Memory Service's job)
- Channel ingestion or message normalization (Comms Gateway 1's job)
- LLM model selection or rate limiting (LiteLLM's job; calling service decides model tier)

## Success Criteria

- Agent task completion within < 30s p50, < 2m p99 (depending on complexity and tool calls)
- Reasoning accuracy: responses are relevant to user message > 90% of the time (human feedback)
- Memory recall: agent recalls relevant past context > 85% of the time when available
- Skill execution: tool calls execute correctly and agent adapts to results > 95% of the time
- Responsiveness: agent responds to every message (no silent timeouts)
- Horizontal scaling: adding replicas increases throughput linearly (up to task queue depth saturation)
- Zero message loss: failed tasks are retried by Temporal; no messages are silently dropped

## Open Questions

- Should agents store conversation history locally in thread_context (Redis), or fetch fresh from PostgreSQL each turn?
- How should agents handle tool failures or skill errors? Retry, escalate, or report back to user?
- Should agents proactively suggest skills or just execute explicitly requested ones?
- What is the policy for continue-as-new? (e.g., after 10 turns or 2MB of history)
- How should agents handle multi-modal input (text + images + files)? (Addressed in TRD)
