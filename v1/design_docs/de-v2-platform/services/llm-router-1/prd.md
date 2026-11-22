---
name: LLM Router 1 — PRD
code: llm-router-1-prd
version: 0.1
status: draft
last_updated: 2026-04-11
---

# LLM Router 1 — Product Requirements

## Purpose

Multi-model LLM proxy and budget controller. This is LiteLLM Proxy — an open-source Python service — deployed as-is with no custom code. It acts as the single HTTP gateway for all LLM calls in de-v2. The service routes requests to the correct provider and model tier, enforces per-agent monthly budget caps, emits OpenTelemetry metrics, and provides fallback routing when providers are unavailable.

LLM Router 1 is the ONLY internal HTTP API in de-v2. All other inter-service communication is via Temporal Nexus.

## Consumers / Users

### HTTP clients:

- Agent Workers (LLM reasoning calls)
- Comms Router 1 (intent classification calls)
- Memory Service (consolidation extraction calls)
- Skill Service (approval summary generation calls)

### Providers:

- Anthropic API (Claude models)
- OpenAI API (GPT fallback models)

## Core Responsibilities

- **Multi-provider routing**: Route requests to Anthropic, OpenAI, or other LLM providers based on configuration
- **Model tier abstraction**: Expose semantic model tiers (agent-reasoning, agent-coding, agent-fast) that map to actual models
- **Per-agent budget enforcement**: Track monthly API spend per agent; reject requests when budget exceeded
- **Fallback routing**: If primary provider unavailable, route to secondary provider (e.g., GPT-4o-mini fallback for Claude Haiku)
- **Credential management**: Store and rotate API keys securely via Vault integration
- **Observability**: Emit OpenTelemetry metrics (cost, latency, error rates) to Prometheus
- **Request logging**: Log all LLM calls for audit and debugging (PII-safe logging)

## What It Is NOT Responsible For

- Model selection logic (calling service decides which tier to use)
- Agent orchestration or task management
- Response post-processing or tool execution
- Cost attribution beyond per-agent tracking (billing logic lives in business layer)

## Success Criteria

- Request latency: < 500ms p50 for proxy + provider call (depending on model)
- Budget enforcement: 100% accuracy on monthly cap enforcement; no overages
- Fallback reliability: Provider failover < 5s, < 1% additional latency on fallback
- Cost visibility: Accurate per-agent cost tracking (< 1% error margin)
- Zero data loss: All LLM requests logged; no silent failures
- High availability: 99.9% uptime for proxy itself (excluding provider outages)
- API key rotation: Seamless key rotation with zero downtime

## Open Questions

- What model should be the fallback for each tier? (e.g., Haiku → GPT-4o-mini?)
- Should rate limiting be enforced at proxy level, or delegated to providers?
- How should we handle long-running LLM calls that exceed proxy timeout? (Streaming vs polling)
- What's the cost model for budget enforcement? Real-time or end-of-month billed?
- Should budget overages trigger alerts, or auto-reject requests?
