---
name: Observability Backend — PRD
code: observability-backend-prd
version: 0.1
status: stub — Phase 3 scope
last_updated: 2026-04-11
---

# Observability Backend — Product Requirements

> **Phase**: Phase 3 (not Phase 1 or 2). Prometheus + Grafana cover technical metrics from day 1. This service covers business metrics that Prometheus cannot cleanly provide.

## The Gap Prometheus Doesn't Fill

Prometheus gives you: request rates, latency distributions, LLM token counts, error rates, worker queue depths. It does not give you: "what percentage of support requests were autonomously resolved this week?", "what is the average time-to-resolution per agent?", "which skill was invoked most and led to the best outcomes?", "how many escalations happened and what was their approval rate?".

These are the KPIs in the Platform PRD. They require event-level data about agent interactions, not infrastructure metrics.

## Purpose

Aggregate, store, and surface business-level metrics from agent activity events. Acts as the data layer for the de-v2 performance dashboard — the primary tool for Budy operators to answer "is this working?" and for demonstrating value to clients.

## Core Responsibilities

- Consume agent interaction events from Temporal workflow completions (or a dedicated event stream) and write to an analytics schema in PostgreSQL
- Compute and cache key KPIs on a regular schedule (hourly): autonomous resolution rate, mean time to resolution, escalation rate, skill adoption rate, LLM cost per resolution
- Expose computed metrics via a Nexus operation (or lightweight internal HTTP) for dashboard queries
- Support per-tenant slicing of all metrics (each client sees only their agents' data)
- Write a weekly digest (summary of KPIs) to the admin Slack channel and optionally email to client contacts

## Events Tracked

| Event | Source | Key fields |
|-------|--------|-----------|
| `request_received` | Comms Gateway 1 / Comms Router 1 | agent_id, tenant_id, channel, timestamp |
| `request_resolved_autonomous` | Digital Entity 2 (workflow complete, no escalation) | agent_id, tenant_id, duration_ms, skills_used, llm_cost |
| `request_escalated` | Digital Entity 2 (human escalation triggered) | agent_id, tenant_id, reason |
| `request_resolved_human` | After escalation signal received | agent_id, tenant_id, total_duration_ms |
| `skill_proposed` | Skill Service | agent_id, tenant_id, skill_name |
| `skill_approved` / `skill_rejected` | Skill Service approval workflow | skill_id, decided_by, duration_to_decision |
| `memory_promoted` | Memory Service consolidation | agent_id, tenant_id, memory_type |
| `permission_escalated` | Auth Service | agent_id, tenant_id, permission, outcome |
| `sandbox_execution` | Sandbox Service 1 | agent_id, tenant_id, type, success, duration_ms |

## What It Is NOT Responsible For

- Infrastructure metrics (Prometheus owns those — wire Grafana to Prometheus for infra dashboards)
- Real-time alerting (Prometheus Alertmanager handles infra alerts; Temporal handles approval/escalation notifications)
- Raw log storage (that is S3 + whatever log aggregation Budy already uses)

## Success Criteria

- Every agent interaction is tracked end-to-end from receipt to resolution within 60 seconds of completion
- All KPIs from the Platform PRD are computable from stored events
- Dashboard query latency < 500ms for 30-day rolling window queries
- Per-tenant data isolation: a query for tenant A cannot return data for tenant B

## Open Questions

1. Event delivery mechanism: Temporal activity at end of each workflow (simplest, some coupling) vs. a dedicated event topic (decoupled, more infra)? Lean toward Temporal activity to start.
2. Data retention: how long do we keep raw events? 90 days? 1 year?
3. Should computed KPI cache be in PostgreSQL materialized views or Redis? Materialized views are simpler.
4. Client-facing dashboard: in scope for v2.0 or operator-only? Operator-only to start.

---

## HLD Stub

- **Type**: Temporal worker (event ingestion) + PostgreSQL materialized views (KPI computation) + lightweight query activity
- **Language**: TypeScript
- **Schema**: `analytics_events` (raw events), `analytics_kpis_daily` (pre-computed), `analytics_agent_summaries` (per-agent rolling stats)
- **KPI computation**: Temporal cron workflow runs hourly → queries raw events → updates materialized views
- **Weekly digest**: Temporal cron workflow → compute weekly KPIs → generate summary via LLM (Haiku) → post to Slack + email

## TRD Stub

[TODO: detailed design needed in dedicated thread]

## Nexus Contracts Stub

### Exposes:

- `analytics.recordEvent(event)` — called by other services at workflow completion
- `analytics.getKPIs(tenantId, timeRange)` — return computed KPIs for dashboard

**Consumes:** Nothing — it's a sink for events from other services
