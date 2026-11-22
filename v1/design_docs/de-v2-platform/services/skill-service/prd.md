---
name: Skill Service — PRD
code: skill-service-prd
version: 0.1
status: draft
last_updated: 2026-04-11
---

# Skill Service — Product Requirements

## Purpose

Manages versioned agent skills (instructions and tools). Skills are stored as SKILL.md format documents in PostgreSQL (not Git). Each skill has a lifecycle: draft → pending approval → approved → deprecated. Implemented as a Temporal worker in the shared namespace that exposes Nexus operations.

Skill Service is the source of truth for agent capabilities and extensibility.

## Consumers / Users

### Read operations:

- Agent Workers (load assigned skills at bootstrap and runtime)
- Admin operators (view skill catalog)

### Write operations:

- Developers/agents (propose new skills via API or admin UI)
- Admin operators (approve/reject skill proposals)

## Core Responsibilities

- **Skill storage**: Versioned SKILL.md documents stored in PostgreSQL (not Git)
- **Skill assignment**: Manage agent_skills mapping (which agents have access to which skills)
- **Approval workflow**: Temporal workflow for admin approval of new/modified skills via Slack
- **Hot caching**: Cache approved skills in Redis (agent-prefixed keys, 1h TTL)
- **Large resource handling**: Store skill resources (scripts, templates) in S3; reference in skill metadata
- **Versioning**: Track skill versions; agents can be pinned to specific versions or latest

## What It Is NOT Responsible For

- Skill execution (Agent Workers run skills)
- Agent reasoning or task logic (Agent Workers' job)
- Memory consolidation (Memory Service's job)
- Channel communication (Comms Gateway 1's job)

## Success Criteria

- Skill retrieval latency: < 100ms (from Redis cache)
- Skill deployment SLA: new skill from creation to active use within 1 hour (after approval)
- Skill assignment correctness: agents have access only to assigned skills
- Approval accuracy: false negatives (rejecting valid skills) < 5%, false positives (approving unsafe skills) < 1%
- Zero data loss: approved skills never lost; rejected skills logged for audit
- Tenant isolation: skills from one tenant never visible to another
- Efficient approval workflow: admin notified within 5 minutes of skill proposal, approval processed within 24h during business hours

## Open Questions

- Should agents be able to propose skills directly, or only admins?
- What is the versioning scheme? (Semantic versioning, timestamps, simple integer counter?)
- Should skill resources (scripts, templates) be versioned separately from metadata?
- How do we prevent skill drift? (e.g., a skill that was approved becomes unsafe over time)
- What's the policy for deprecated skills? (Immediately unavailable, or grace period?)
