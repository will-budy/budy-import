---
name: Memory Service — PRD
code: memory-service-prd
version: 0.1
status: draft
last_updated: 2026-04-11
---

# Memory Service — Product Requirements

## Purpose

The platform's memory engine. Handles storage of episodic memories (every conversation turn), semantic search over past interactions, management of core memories (human-approved facts), and automated consolidation of episodic data into semantic memories. Implemented as a Temporal worker in the shared namespace that exposes Nexus operations (not REST).

Memory Service is the source of truth for agent context and long-term learning across conversations.

## Consumers / Users

### Read operations:

- Agent Workers (load core memories at bootstrap, search episodic memories during tasks)
- Comms Router 1 (optional: retrieve thread context)

### Write operations:

- Agent Workers (save episodic memory after each task)
- Memory Consolidation Workflow (upsert semantic memories)
- Memory Core Approval Workflow (persist human-approved core memories)

## Core Responsibilities

- **Episodic storage**: Append-only log of every conversation turn (message, agent response, tools used, outcome)
- **Semantic search**: Query vector database to find relevant past interactions by semantic similarity
- **Core memory management**: Store human-approved facts and long-term learnings. Retrieve at agent bootstrap.
- **Session context**: Fetch recent thread history (last N messages, < 50KB) for context loading
- **Consolidation**: Run scheduled workflows to extract salient facts from episodic log, deduplicate against existing semantic memories, and upsert to vector DB
- **Core memory approval**: Workflow to notify admins of high-importance facts, await approval, and persist to core memory table
- **Caching**: Hot-cache core memories and frequently accessed skills in shared Redis (TTL 1h for core, 1h for skills)

## What It Is NOT Responsible For

- Skill storage or versioning (Skill Service's job)
- Intent routing or message handling (Comms Router 1's job)
- Channel communication (Comms Gateway 1's job)
- Agent reasoning loop execution (Digital Entity 2's job)

## Success Criteria

- Episodic memory retrieval latency: < 500ms for top-K semantic search
- Core memory recall: agent recalls relevant past context > 85% of the time when available
- Consolidation accuracy: extracted facts are accurate and non-redundant > 90% of the time (human feedback)
- Core memory approval SLA: admin approvals processed within 24h during business hours
- Zero data loss: failed writes retried; no memories are silently dropped
- Tenant isolation: memories from different tenants never cross-contaminate
- Efficient consolidation: runs on cron schedule (every 4h during active use, 1h off-hours) without blocking agent operations

## Open Questions

- What is the minimum "importance" threshold for a fact to trigger core memory approval workflow?
- How should we deduplicate semantic memories? (e.g., vector similarity threshold)
- Should agents have direct control over core memories, or only admins?
- What is the retention policy for episodic memories? (Forever, or archive after 90 days?)
- How should we handle conflicting memories or facts that become outdated?
