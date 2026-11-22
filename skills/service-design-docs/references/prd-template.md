# PRD Template

Replace `<ServiceName>` throughout. Remove all guidance comments before publishing.

---

```markdown
---
name: <ServiceName> — PRD
code: <service-name>-prd
version: 0.1
status: draft
last_updated: YYYY-MM-DD
---

# <ServiceName> — Product Requirements

## Why This Exists

<!-- 2–4 sentences. Business problem this solves. What breaks or degrades without this service?
     Write for a non-technical reader. No implementation language. -->

## What It Does

<!-- 2–3 sentences. Functional description — what the service does and for whom.
     Inbound: what does it receive, what does it produce?
     Outbound: what does it expose?
     No "how" language. -->

## Phase 1 Scope

### Supported <Channels / Integrations / Capabilities>

<!-- Table of what is included in Phase 1. Add columns relevant to your service. -->

| <Item> | <Property A> | <Property B> |
|--------|-------------|-------------|
| ...    | ...         | ...         |

### <Category> Responsibilities

<!-- Bullet list of WHAT the service does in this category.
     Language: "Accept and acknowledge", "Normalize X into Y", "Deliver Z to W"
     Not: "Calls Temporal startWorkflow", "Validates HMAC-SHA256" -->

- ...

<!-- Repeat for each category (Inbound, Outbound, etc.) -->

## What <ServiceName> Is NOT Responsible For

<!-- Each bullet names the thing NOT owned and who IS responsible. -->

- **<Concern>**: <which service owns it>
- **<Concern>**: <which service owns it>

## Success Criteria

<!-- Metrics with actual numbers. Include p50/p99 for latency, hard guarantees for correctness. -->

| Metric | Target |
|--------|--------|
| ...    | ...    |

## Phase 1 UAT Acceptance Criteria

<!-- Numbered scenarios. Pass condition = observable end-to-end outcome, not code behavior.
     A QA engineer with no code access should be able to run these. -->

| # | Scenario | Pass condition |
|---|----------|---------------|
| 1 | ...      | ...           |

<!-- Aim for 12–20 scenarios covering:
     - Happy paths (each channel/integration)
     - Deduplication guarantee
     - Error inputs (invalid auth, unknown sender)
     - Resilience (pod restart, dependency down)
     - Outbound (each format/channel combination) -->

## Phase 2 / Deferred Scope

<!-- What is explicitly out of scope for Phase 1, and why. -->

- **<Feature>**: <reason deferred>
```
