---
name: Design Document Standards
code: doc-standards
version: 0.1
status: active
owner: Budy Engineering
last_updated: 2026-04-13
---

# Design Document Standards

Every de-v2 service has four documents. They form a strict layer cake — each layer targets a different reader and a different set of questions.

## The Layer Model

| Document | Reader | Question answered |
|----------|--------|------------------|
| `prd.md` | Product, eng lead | *Why does this exist? What does it do? What's in scope?* |
| `hld.md` | Engineer (any) | *How does it work architecturally?* |
| `trd.md` | Engineer building it | *How do I implement it?* |
| `nexus-contracts.md` | Callers of this service | *How do I call it from my workflow?* |

**The golden rule:** if understanding the sentence requires knowing how the code works → it belongs in TRD, not HLD. If understanding the sentence requires knowing the architecture → it belongs in HLD, not PRD.

## What Goes Where

### PRD

Must contain: business motivation (why this exists), functional description (what it does, not how), Phase N scope table, explicit anti-scope ("not responsible for"), metric targets, UAT acceptance criteria (observable end-to-end scenarios), deferred scope.

Must NOT contain: implementation mechanisms, TypeScript interfaces, design principles, design decisions, tenant resolution details.

### HLD

Must contain: overview, architecture diagram, deployment model table, core interface/adapter contracts (annotated TypeScript), canonical schema definitions with field-level annotation, component breakdown with field mapping tables, key flows as Mermaid sequence diagrams, storage (reads/writes/TTLs), dependencies table, design principles (numbered, with rationale), design decisions log (all resolved), open questions.

Must NOT contain: full TypeScript type definitions with file paths, K8s YAML, function bodies, Block Kit JSON payloads, testing strategy, observability metric tables.

### TRD

Must contain: implementation stack table, annotated project file tree, TypeScript types (with file paths and export names; cross-reference HLD for field docs), deterministic key/ID construction functions, API endpoints (request format + numbered processing steps + response codes), inbound and outbound error handling matrices, Temporal workflow dispatch code, explicit worker registration per task queue, environment variable and Vault secret tables, Redis key patterns with availability policy (code), performance targets, testing strategy, Prometheus metrics table, structured log fields, K8s deployment skeleton.

Must NOT contain: field-level schema documentation (lives in HLD), architecture diagrams, business motivation, design rationale.

### nexus-contracts.md

Must contain: one section per operation — input/output types, error types with retry behavior, `nonRetryableErrorTypes` list, SLA targets, retry policy, caller guidance with code example.

## Design Decisions Log (HLD)

Every significant design choice must appear in the HLD's **Design Decisions Log** table as a resolved `Question | Resolution` row. This is the institutional memory of the design. Unresolved questions go in "Open Questions / TRD Scope" and are moved to the log when decided.

Do not document decisions only in Slack threads or meeting notes — they must land in the HLD.

## UAT Acceptance Criteria (PRD)

Each row in the UAT table must be:

- A specific, observable scenario
- Verifiable by a QA engineer without reading the code
- Written as a pass condition, not a test step

Cover: happy paths (each channel/integration), deduplication guarantee, error inputs (invalid auth, unknown sender), resilience (pod restart, dependency down), and all outbound format/channel combinations. Aim for 12–20 scenarios for a Phase 1 service.

## Tenant Resolution (de-v2 standard)

Use the **resolve-as-early-as-possible** rule:

- **Deterministic at service boundary (static config):** Set `tenant_id` directly. Example: per-tenant Gmail accounts loaded from Vault at startup.
- **Requires DB lookup:** Leave `tenant_id` unset; set `tenant_hints.channel_account_id`. Downstream Router resolves via `agent_bindings`. Example: Slack `team_id`.

Document which rule applies, and why, in the HLD Design Decisions Log.

## Redis Availability Policy (TRD standard)

Temporal activities that must maintain idempotency → **fail-closed**: throw `ApplicationFailure.retryable("RedisUnavailableError")` before calling the external API. Temporal backs off and retries.

HTTP handler caches → **fail-open**: degrade gracefully (fall back to direct API call or leave field undefined), log warning, proceed. Failing the HTTP handler causes the external system to retry unnecessarily.

## Frontmatter

Every document uses:

```yaml
---
name: <Service Name> — <PRD|HLD|TRD|Nexus Contracts>
code: <kebab-service-name>-<prd|hld|trd|nexus-contracts>
version: 0.N          # increment on every meaningful update
status: draft | in-review | stable | archived
last_updated: YYYY-MM-DD
---
```

Increment `version` whenever the document meaningfully changes. Update `last_updated` in every PR.

## Reference Implementation

The Comms Gateway 1 docs are the canonical reference implementation of these standards:

- `design_docs/de-v2-platform/services/comms-gateway-1/prd.md`
- `design_docs/de-v2-platform/services/comms-gateway-1/hld.md`
- `design_docs/de-v2-platform/services/comms-gateway-1/trd.md`
- `design_docs/de-v2-platform/services/comms-gateway-1/nexus-contracts.md`

## Cowork Skill

The `service-design-docs` skill encodes these standards for AI-assisted document creation and review. It includes full section templates for each layer. Install from `skills/service-design-docs.skill` in this repo.
