---
name: service-design-docs
description: >
  Use this skill whenever you are creating or substantially updating design documents
  for a de-v2 platform service — PRD, HLD, TRD, or nexus-contracts.md.
  Trigger when the user says things like "write a PRD for X", "design the HLD for Y",
  "we need a TRD for Z", "update the comms gateway 1 docs", "start docs for a new service",
  "review and refactor our design docs", or any similar request that involves writing
  or improving structured service documentation for the Budy platform.
  Also trigger when the user asks to review whether content is in the right layer
  (e.g. "is this too implementation-detail for a PRD?").
---

# Service Design Docs Skill

This skill captures the documentation standards for de-v2 platform services at Budy.
The system uses a three-layer model — PRD / HLD / TRD — with an optional nexus-contracts file
for inter-service API contracts.

## Quick orientation

- **PRD** — *why* and *what*, written for a product audience. No implementation language.
- **HLD** — *how it works architecturally*, written for engineers. The primary technical design artifact.
- **TRD** — *how to implement it*, written for the engineer building the service. Code-level detail.
- **nexus-contracts.md** — *cross-service activity/Nexus contracts*, written for callers. Optional.

The golden rule: **if a reader needs to know how the code works to understand the sentence, it belongs in TRD, not HLD or PRD**. If a reader needs to know the architecture to understand the sentence, it belongs in HLD, not PRD.

---

## Step 1 — Understand what you're writing

Before touching a file, establish:

1. **Which documents are needed?** New service → all four. Update → identify the affected layer.
2. **What stage is the design in?** Draft (exploring) → stub each section, flag open questions. In-review → fill sections fully, resolve open questions. Stable → update incrementally.
3. **What service platform context applies?** For de-v2: Temporal-first, TypeScript or Go (Nexus-first clusters are Go), AWS EKS, no inter-service REST, no Python in production. Incorporate this into every technical decision.

Read the reference templates before writing:
- `references/prd-template.md` — full PRD structure with section guidance
- `references/hld-template.md` — full HLD structure with section guidance
- `references/trd-template.md` — full TRD structure with section guidance

---

## Step 2 — Frontmatter

Every document must start with:

```yaml
---
name: <Service Name> — <PRD|HLD|TRD|Nexus Contracts>
code: <kebab-service-name>-<prd|hld|trd|nexus-contracts>
version: 0.1          # increment on every meaningful update
status: draft         # draft | in-review | stable | archived
last_updated: YYYY-MM-DD
---
```

---

## Step 3 — Layer content rules

### PRD — product layer

**Must contain:**
- **Why this exists** — 2–4 sentences of business motivation. What problem does this solve? What breaks without it?
- **What it does** — 2–3 sentences of functional description. Say *what*, never *how*.
- **Phase N scope** — what channels/integrations/capabilities are included in this phase, as a table.
- **What it is NOT responsible for** — explicit anti-scope. Prevents scope creep and misrouting of implementation discussions.
- **Success criteria** — metric targets with actual numbers (latency p50/p99, error rates, throughput).
- **UAT acceptance criteria** — numbered table of scenarios. Each row: `# | Scenario | Pass condition`. Pass conditions must be observable end-to-end outcomes, not implementation checks.
- **Deferred scope** — what is explicitly out of scope for this phase, with a brief *why deferred*.

**Must NOT contain:**
- Implementation mechanisms ("validates HMAC-SHA256", "calls Temporal startWorkflow")
- Schema definitions or TypeScript interfaces
- Design principles or design decisions
- Tenant resolution logic details
- Anything a non-engineer couldn't understand

**UAT criteria tips:**
- Each scenario covers one observable user or system behavior
- Pass condition is verifiable by a QA engineer without reading the code
- Cover: happy path, deduplication, error handling, resilience (pod restart, Redis down)
- Aim for 12–20 scenarios for a Phase 1 service

---

### HLD — architecture layer

**Must contain:**
- **Overview** — 2–3 paragraphs: what the service is, how it fits the platform, what pattern it uses
- **Architecture diagram** — ASCII or Mermaid showing components and data flow
- **Deployment model** — table: type, language, framework, replicas, scaling, resources, ports
- **Core interfaces** — TypeScript interfaces for the primary adapter/plugin pattern (with JSDoc-style inline comments, not full type definitions). These are *architectural contracts*, not implementation types.
- **Schema definitions** — annotated field-by-field documentation for canonical message schemas (AgentMessage, etc.). These annotations are the primary documentation; TRD has the bare TypeScript types.
- **Component breakdown** — prose + tables for each major component, field mapping tables for normalization
- **Key flows** — Mermaid sequence diagrams for the main happy paths and failure paths
- **Storage** — what is read/written to each store (Redis, PostgreSQL, Vault); key patterns and TTLs
- **Dependencies** — table of external services and how they're used
- **Design Principles** — numbered list of architectural rules with brief rationale (typically 5–8)
- **Design Decisions Log** — table of `Question | Resolution`. All rows must be resolved. Open questions go in the next section.
- **Open Questions / TRD Scope** — questions that are deferred to TRD or a future design session

**Must NOT contain:**
- Full TypeScript type definitions with file paths (those go in TRD)
- K8s YAML or deployment configs (TRD)
- Function bodies or code implementations (TRD)
- Block Kit JSON templates or protocol-level payloads (TRD)
- Testing strategy or observability metric tables (TRD)

**Tips:**
- Schema annotations in HLD are the *primary documentation*. TRD's types are the implementation.
- Design Decisions Log is the memory of the design. Every significant choice should be here, not buried in Slack or a meeting note.
- Sequence diagrams should show system behavior, not code execution order.

---

### TRD — implementation layer

**Must contain:**
- **Implementation stack** — table: concern / choice / rationale
- **Project structure** — annotated file tree
- **TypeScript type definitions** — full types with file paths and export names. Cross-reference HLD for field docs.
- **Session key & ID construction** — the deterministic functions that build `conversation_id`, `session_key`, `message_id`. Must be consistent across all services.
- **API endpoints** — request format, processing steps (numbered), response codes
- **Error handling matrix** — inbound (HTTP codes) and outbound (error type, retry behavior, max attempts)
- **Temporal configuration** — workflow dispatch code, worker registration (split workers if multiple task queues)
- **Configuration** — environment variables table and Vault secret paths
- **Channel-specific format details** — Block Kit examples, RFC 2822 threading, etc.
- **Redis usage** — key patterns, TTLs, Redis availability policy with code (fail-closed vs. fail-open, with rationale)
- **Performance characteristics** — metric targets and how to measure them
- **Testing strategy** — unit, integration, E2E, load test descriptions
- **Observability** — Prometheus metrics table + structured log fields
- **Deployment configuration** — K8s Deployment/Service YAML skeleton

**Must NOT contain:**
- Field-level schema documentation (in HLD)
- Architecture diagrams
- Business motivation
- Design decision rationale (captured in HLD)

**Redis availability policy (standard pattern):**
```
Temporal activities — FAIL-CLOSED: throw retryable ApplicationFailure before calling external API.
HTTP handlers (caches) — FAIL-OPEN: degrade gracefully, log warning, proceed.
```
Always explain WHY each direction is chosen — the asymmetry is intentional and non-obvious.

---

### nexus-contracts.md — inter-service contracts

Include this file when other services call into this service's Temporal activities or Nexus operations.

**Must contain:**
- One section per operation: input type, output type, error types, retry policy, SLA
- `nonRetryableErrorTypes` list — permanent errors that callers should not retry
- Caller guidance with code example (how to call it, what to do with errors)
- Versioning policy

**Standard nonRetryableErrorTypes pattern:**
```typescript
nonRetryableErrorTypes: [
  "InvalidChannelError",
  "TargetNotFoundError",
  "<Channel>PermanentError",  // e.g. SlackPermanentError, GmailPermanentError
]
```

---

## Step 4 — Cross-referencing rules

When content lives in one layer but is referenced by another, add a cross-reference rather than duplicating.

| Pattern | Example |
|---------|---------|
| TRD types → HLD for docs | `// Field docs in HLD "AgentMessage Schema" section` |
| HLD code fragment → TRD for impl | "Exact Block Kit JSON is specified in the TRD." |
| PRD → HLD for design decisions | PRD does not reference HLD; HLD is the canonical decisions home |
| nexus-contracts → TRD for types | OK to define types in nexus-contracts if they're the authoritative source |

---

## Step 5 — Tenant resolution (de-v2 standard)

The platform uses a **resolve-as-early-as-possible** rule:

- **Deterministic at gateway (static config):** Set `tenant_id` in `AgentMessage` directly. Example: per-tenant Gmail accounts loaded from Vault at startup.
- **Requires DB lookup:** Leave `tenant_id` unset; populate `tenant_hints.channel_account_id`. Router resolves via `agent_bindings` table. Example: Slack `team_id`.
- **Future channels:** Follow the same rule. If mapping is in static config → resolve at gateway. If it needs a DB round-trip → defer to Router.

Always document which strategy applies and why in the HLD Design Decisions Log.

---

## Step 6 — Common pitfalls to avoid

- **PRD with "how" language** — if you find yourself writing "validates HMAC-SHA256" or "calls `startWorkflow`", move it to HLD.
- **HLD with implementation code** — function bodies, full TypeScript files with paths, K8s YAML: all TRD.
- **Missing anti-scope in PRD** — without explicit "NOT responsible for" sections, scope creep is inevitable.
- **Design Decisions Log left as "pending"** — all rows must be resolved. Unresolved questions go in "Open Questions / TRD Scope".
- **Duplicate schema docs** — schema field annotations live in HLD; bare TypeScript types live in TRD. Don't write full annotated schemas in both.
- **Single Temporal worker for multiple task queues** — always register separate workers for separate task queues. Document the split in TRD with explicit worker creation blocks.
- **Idempotency only in TRD** — idempotency guarantees and their mechanism are a design decision; put the rationale in HLD Design Decisions, the code in TRD.

---

## Reference files

Read these before writing. They contain full section-by-section templates.

- `references/prd-template.md` — PRD template
- `references/hld-template.md` — HLD template  
- `references/trd-template.md` — TRD template

The Comms Gateway 1 docs (`design_docs/de-v2-platform/services/comms-gateway-1/`) are the canonical reference implementation of these standards.
