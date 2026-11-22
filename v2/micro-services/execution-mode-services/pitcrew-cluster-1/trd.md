---
name: Pit Crew Cluster — TRD
code: pitcrew-cluster-1-trd
version: 0.1
status: draft
last_updated: 2026-11-10
---

# Pit Crew Cluster — TRD

Technical requirements for Phase 1 of `pitcrew-cluster-1`: what to build, with the exact shapes. Product intent is in the [PRD](prd.md), architecture in the [HLD](hld.md), the caller contract in [nexus-contracts](nexus-contracts.md), and how it was built in the "As built" section at the end.

Names below follow the existing cluster conventions and are checked against the reference repositories (studio-services-cluster-1, the nainai console and the platform console standard). Where a name is derived from a pattern rather than copied, it is marked *derive*, and the implementer confirms it against the repository before use.

## Technology Stack

| Concern | Choice |
| --- | --- |
| Worker language | Go (version from `go.mod` of the sibling cluster repos), module `github.com/budybot/pitcrew-cluster-1/ticket-engine-1` *derive* |
| Temporal | Go SDK, Worker Deployment Versioning (Pinned), one task queue `pitcrew-ticket-engine-1` |
| Database | PostgreSQL `ob1-pitcrew-db-1` (provisioned), `pgx/v5` pool, `goose` migrations with advisory lock |
| Console | React 19, Vite, Node 26, Fastify BFF on `@budybot/console-kit` 0.3.x, Zod 4 (versions as pinned in `nainai-cluster-1` `console-1`) |
| Kubernetes access | `client-go` dynamic informer on the PTSOP resource, namespace-scoped |
| Authorization | `go/authz` against OpenFGA through the auth cluster |
| Exporter | `sql_exporter` (burningalchemist) as a separate Deployment, image mirrored to the platform registry |
| Packaging | Umbrella Helm chart `pitcrew-cluster-1`; one sub-chart per component |
| Observability | Prometheus operator `ServiceMonitor` and `PrometheusRule` |
| Docs checks | `markdownlint-cli2` and `mkdocs build --strict` |

## Project Structure

Repository `pitcrew-cluster-1_repo-1`:

```text
charts/
  pitcrew-cluster-1/            umbrella (Chart.yaml, values.yaml, values-<env>.yaml)
  gateway-1/                    exists; add files/capabilities/ticket-engine-1.yaml
  ticket-engine-1/              worker Deployment, migrate Job, VaultAuth and secrets, SA, RBAC for PTSOP read
  console-1/                    SPA + BFF Deployment, Service, VaultAuth and secrets, HTTPRoute inputs
  sql-exporter-1/               exporter Deployment, ConfigMap (collectors), Service, ServiceMonitor
  ptsop-crd/                    the PTSOP CRD and the two sample PTSOP resources
  pitcrew-seed-1/               dev-only CronJob that seeds sample tickets (disabled by default)
shared/contract/                Go types for Execute, capability names, error reasons, manifests
ticket-engine-1/
  cmd/worker/main.go            modes: worker (default), migrate
  internal/
    capabilities/               manifest YAML (embedded) and the conformance test
    sop/                        PTSOP types, cache, informer, validator
    store/                      pool.go, migrate.go, store.go, migrations/*.sql
    workflow/                   entrypoint.go, ticket.go (TicketWorkflowV1), updates.go
    activities/                 register, loadsop, runai, assignhuman, transition, notify, expire
    worker/                     Register (Pinned entry workflow and lifecycle workflow)
    authz/                      FGA checks
    seed/                       seed generator used by the seed CronJob (cmd/seed)
  cmd/seed/main.go
console-1/
  src/server/                   main.ts, db.ts, nexus.ts, routes.ts, actions.ts, content.ts
  src/ui/                       the approved mock, split into components
  Dockerfile
```

## Data Model (PostgreSQL)

Two schemas separate what the console may read from what only the worker and the user's own session may read.

| Schema | Holds | Readable by |
| --- | --- | --- |
| `meta` | Envelope data: no tenant content, nothing a requester typed | worker role, `meta_read` role (console BFF, exporter) |
| `content` | Subject content, comments, event payloads | worker role only |

### DDL (migration `0001_init.sql`)

```sql
CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS content;

CREATE TABLE meta.tickets (
  ticket_id        text PRIMARY KEY,                      -- tkt_<ULID>
  tenant_id        text NOT NULL,
  requester        text NOT NULL,                         -- identity from token
  idempotency_key  text NOT NULL,
  sop_name         text NOT NULL,
  sop_version      int  NOT NULL,
  sop_digest       text NOT NULL,
  state            text NOT NULL CHECK (state IN
                   ('accepted','in_progress','waiting','resolved','rejected','cancelled','expired')),
  step             text NOT NULL,
  attempt          int  NOT NULL DEFAULT 0,
  owner_kind       text NOT NULL CHECK (owner_kind IN ('agent','human','system','requester')),
  owner_queue      text,
  assignee         text,
  priority         text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  summary          text,                                  -- up to 140 chars, visible to all staff
  due_at           timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  result_state     text,                                  -- final state label only; result body is in content
  UNIQUE (tenant_id, requester, idempotency_key)
);
CREATE INDEX tickets_open_idx ON meta.tickets (owner_queue, due_at) WHERE state IN ('accepted','in_progress','waiting');
CREATE INDEX tickets_tenant_idx ON meta.tickets (tenant_id, created_at DESC);

CREATE TABLE meta.ticket_events (
  ticket_id   text NOT NULL REFERENCES meta.tickets(ticket_id),
  seq         int  NOT NULL,
  type        text NOT NULL,                              -- accepted, step_started, ai_decision, human_action,
                                                          -- content_opened, sla_breached, escalated, transitioned, comment, resolved
  actor_kind  text NOT NULL,                              -- user, service, agent, system
  actor_id    text NOT NULL,
  assumed_tenant text,                                    -- set when the actor acted in an assumed tenant session
  step        text,
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, seq)
);

CREATE TABLE meta.queue_entries (
  ticket_id    text PRIMARY KEY REFERENCES meta.tickets(ticket_id),
  queue        text NOT NULL,
  step         text NOT NULL,
  claimed_by   text,
  claimed_at   timestamptz,
  due_at       timestamptz NOT NULL,
  breached_at  timestamptz,                               -- set once by the worker timer; exporter counts these
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queue_due_idx ON meta.queue_entries (due_at) WHERE breached_at IS NULL;

CREATE TABLE content.ticket_content (
  ticket_id   text PRIMARY KEY REFERENCES meta.tickets(ticket_id),
  tenant_id   text NOT NULL,
  input       jsonb NOT NULL,                             -- requester's validated input
  subject     jsonb,                                      -- material under review, or an artifact reference
  result      jsonb                                       -- SOP result body when final
);

CREATE TABLE content.event_payloads (
  ticket_id   text NOT NULL,
  seq         int  NOT NULL,
  payload     jsonb NOT NULL,                             -- AI reasoning, human edits, comment text
  PRIMARY KEY (ticket_id, seq),
  FOREIGN KEY (ticket_id, seq) REFERENCES meta.ticket_events(ticket_id, seq)
);

CREATE VIEW meta.ticket_queue_v AS
  SELECT t.ticket_id, t.tenant_id, t.sop_name, t.sop_version, t.state, t.step, t.owner_kind,
         t.owner_queue, t.assignee, t.priority, t.summary, t.due_at, t.created_at, t.updated_at,
         q.claimed_by, q.breached_at
    FROM meta.tickets t LEFT JOIN meta.queue_entries q USING (ticket_id);
```

`summary` is requester-written and is shown to every staff member who can see the queue. The capability contract tells requesters to keep sensitive material in `input`.

### Roles

Standard roles (`-admin`, `-user`, `-read-role`) and standard grants on `public` come from the existing database provisioning and are not changed. Migration objects live in `meta` and `content`, so the standard `-read-role` does not apply to them. The custom grants file `ob1-pitcrew-db-1.sql` in the EKS stack's postgres-objs jobs (the per-database custom grants location) adds:

```sql
-- Console metadata read role: the BFF and the exporter use this and nothing else.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pitcrew_meta_read') THEN
    CREATE ROLE pitcrew_meta_read NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA meta TO pitcrew_meta_read;
GRANT SELECT ON ALL TABLES IN SCHEMA meta TO pitcrew_meta_read;
ALTER DEFAULT PRIVILEGES IN SCHEMA meta GRANT SELECT ON TABLES TO pitcrew_meta_read;
REVOKE ALL ON SCHEMA content FROM pitcrew_meta_read;

-- Worker role: full DML on both schemas.
GRANT USAGE ON SCHEMA meta, content TO "ob1-pitcrew-db-1-user";    -- role name: derive from the standard
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA meta, content TO "ob1-pitcrew-db-1-user";
ALTER DEFAULT PRIVILEGES IN SCHEMA meta, content GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "ob1-pitcrew-db-1-user";
GRANT USAGE ON ALL SEQUENCES IN SCHEMA meta, content TO "ob1-pitcrew-db-1-user";
```

The Vault database engine (`db-eng-1`) gets a precreated role for the console, with creation statements that `GRANT pitcrew_meta_read TO "{{name}}"`. Its name follows `<service>_<suffix>_vault_pg_role_1` with suffix `meta_read` (*derive*). The worker's dynamic role uses the standard `-user` suffix. The migration Job uses the static admin role, as in the other clusters.

`ALTER DEFAULT PRIVILEGES` applies to objects created by the role that runs it. The migration runs as the static admin, so the grants job must run `ALTER DEFAULT PRIVILEGES FOR ROLE <admin>` (*derive*), or the migration must re-grant at its end. The implementer verifies with a test that a new table created by migration is readable by `pitcrew_meta_read` and, for `content`, is not.

## PTSOP Custom Resource

| Property | Value |
| --- | --- |
| Group, version | `pitcrew.budy.bot/v1alpha1` |
| Kind, plural, short name | `PTSOP`, `ptsops`, `ptsop` |
| Scope | Namespaced (the Pit Crew namespace) |
| Immutability | `spec` equals its old value, except `spec.lifecycle`, enforced by a CEL transition rule |
| Prompts | Inline in the step; there is no separate prompt kind in Phase 1 |

CRD validation rules (CEL): every value in a step's `outcomes` is a step name or one of `resolved`, `rejected`; `start` is a step name; a step has exactly one of `type: agent|human|system|wait`; `uses` is one of the shipped templates; `sla` and `timeout` match a duration pattern.

Schema (abridged to the fields the worker reads):

```yaml
spec:
  sop: string                    # name, e.g. content-approval
  version: int                   # >= 1
  lifecycle: active|deprecated|retired
  maxRuntime: 72h
  input:  { schema: <JSON Schema> }
  result: { schema: <JSON Schema> }
  start: string
  steps:
    <name>:
      type: agent|human|system|wait
      uses: human-approval       # human steps only
      queue: string              # human steps
      session: viewer|editor     # tenant session boundary to act
      sla: duration
      onSlaBreach: { escalateTo: string }
      maxAttempts: int           # agent steps
      prompt:                    # agent steps
        model: string            # hint passed to the LLM router
        system: string
        template: string         # Go text/template over {input, subject}
        outputSchema: <JSON Schema>   # must include `outcome` (enum of the step's outcome keys)
      action: { capability: string }  # system steps
      wait: { for: duration }         # wait steps
      outcomes: { <outcome>: <step|resolved|rejected> }
```

### Sample 1: `content-approval-v1`

An AI reviewer approves or rejects a draft message; unsure or invalid output goes to a person.

```yaml
apiVersion: pitcrew.budy.bot/v1alpha1
kind: PTSOP
metadata:
  name: content-approval-v1
spec:
  sop: content-approval
  version: 1
  lifecycle: active
  maxRuntime: 72h
  input:
    schema:
      type: object
      required: [channel, draft]
      properties:
        channel: { type: string, enum: [email, sms, whatsapp] }
        draft:   { type: string, minLength: 1, maxLength: 4000 }
        context: { type: string }
  result:
    schema:
      type: object
      required: [decision]
      properties:
        decision: { type: string, enum: [approved, rejected] }
        editedDraft: { type: string }
        reason: { type: string }
  start: auto_review
  steps:
    auto_review:
      type: agent
      maxAttempts: 2
      sla: 2m
      prompt:
        model: default-reasoning
        system: >-
          You review outbound customer messages for policy, tone and accuracy.
          Return approve only when the message is safe to send unchanged.
        template: |
          Channel: {{.input.channel}}
          Draft: {{.input.draft}}
          Context: {{.input.context}}
        outputSchema:
          type: object
          required: [outcome, reasoning]
          properties:
            outcome: { type: string, enum: [approve, reject, unsure] }
            reasoning: { type: string }
      outcomes: { approve: resolved, reject: rejected, unsure: human_review, failed: human_review }
    human_review:
      type: human
      uses: human-approval
      queue: agent-success
      session: editor
      sla: 4h
      onSlaBreach: { escalateTo: agent-success-lead }
      outcomes: { approve: resolved, edit_approve: resolved, reject: rejected, send_back: auto_review }
```

### Sample 2: `skill-publish-review-v1`

A person always reviews; a system step then publishes. Shows a system actor and a non-AI path.

```yaml
apiVersion: pitcrew.budy.bot/v1alpha1
kind: PTSOP
metadata:
  name: skill-publish-review-v1
spec:
  sop: skill-publish-review
  version: 1
  lifecycle: active
  maxRuntime: 72h
  input:
    schema:
      type: object
      required: [skillId, skillVersion]
      properties:
        skillId: { type: string }
        skillVersion: { type: string }
        changeNote: { type: string }
  result:
    schema:
      type: object
      required: [decision]
      properties:
        decision: { type: string, enum: [published, rejected] }
        reason: { type: string }
  start: triage
  steps:
    triage:
      type: human
      uses: human-approval
      queue: agent-success
      session: editor
      sla: 8h
      onSlaBreach: { escalateTo: agent-success-lead }
      outcomes: { approve: publish, reject: rejected, send_back: triage }
    publish:
      type: system
      sla: 5m
      action: { capability: publishSkill }
      outcomes: { done: resolved, failed: triage }
```

In Phase 1 the `publishSkill` system action is a stub that records an event and returns `done`, because the target capability belongs to another cluster. The real binding is a later change to the SOP version.

## Capabilities

The contract is in [nexus-contracts](nexus-contracts.md). The component manifest `charts/gateway-1/files/capabilities/ticket-engine-1.yaml` has this shape (one entry shown; the others follow the contract table):

```yaml
apiVersion: capabilities.budy.bot/v1
kind: ComponentCapabilities
component: ticket-engine-1
taskQueue: pitcrew-ticket-engine-1
workflowType: TicketEngineEntryV1
defaults: { timeout: 10s }
capabilities:
  - name: submitTicket
    mutating: true
    scope: tenant
    schema:
      type: object
      required: [sop, input]
      additionalProperties: false
      properties:
        sop:      { type: object, required: [name, version], properties: { name: {type: string}, version: {type: integer, minimum: 1} } }
        input:    { type: object }
        summary:  { type: string, maxLength: 140 }
        priority: { type: string, enum: [low, normal, high, urgent] }
```

The `capabilitytest.Verify` conformance test runs against the manifest and the registered handlers, as in `engagement-manager-1`.

## Workflows and Activities

| Workflow | Registered as | Notes |
| --- | --- | --- |
| `TicketEngineEntryV1` | Pinned entry workflow, switch on capability | Short path for `submitTicket`, `getTicket`, `cancelTicket`, `describeSops`, `awaitTicket`; envelope and content capabilities query the database or send an Update |
| `TicketWorkflowV1` | Pinned, workflow ID = ticket ID, started as an independent run | Interpreter; carries only ticket ID, SOP reference and digest, step, attempt |
| Lifecycle workflow | AutoUpgrade, as in `engagement-manager-1` | Per the standard |

| Activity | Retries | Notes |
| --- | --- | --- |
| `RegisterTicket` | Default | One transaction: insert ticket, `accepted` event, content row; unique on (tenant, requester, key); a repeat returns the same ticket |
| `LoadSOP` | Default | Reads the pinned name, version and digest from the cache; result recorded in history |
| `RunAIStep` | 2 attempts plus the step's `maxAttempts`; non-retryable on schema failure after the last attempt | Renders the template, calls the LLM router, validates against `outputSchema`; `failed` outcome on exhaustion |
| `AssignHuman` | Default | Inserts the `queue_entries` row, sets owner |
| `Transition` | Default | Applies an outcome in one transaction (ticket, event, queue entry); idempotent on (ticket, seq) |
| `NotifyBreach` | Limited | Phase 1 writes an event and logs; provider integration is later |
| `ExpireTicket` | Default | Ends the ticket as `expired` at `maxRuntime` |

Updates on `TicketWorkflowV1`: `HumanAction{action, expectedStep, edits, comment, actor}`, with a validator that rejects when the ticket is not at a human step, the step differs from `expectedStep`, or the action is not allowed. Queries: none; state is read from PostgreSQL.

Search attributes: `TicketId`, `TenantId`, `SopName`, `SopVersion`, `Step`, `TicketState`.

## BFF API

The BFF runs on `@budybot/console-kit` with a user adapter (the signed-in staff member) and a pod adapter limited to system scope. All routes require a valid session cookie. All write routes are same-origin JSON with a CSRF guard, as in the reference console.

| Route | Source | Behaviour |
| --- | --- | --- |
| `GET /api/queue` | `meta.ticket_queue_v` via `meta_read` | Filters: `queue`, `state`, `sop`, `owner`; keyset pagination on (`due_at`, `ticket_id`); no tenant filter beyond the token (see below) |
| `GET /api/stats` | `meta` aggregates | Open, breached, due within 1 hour, resolved today |
| `GET /api/tickets/:id` | `meta.tickets`, `meta.ticket_events` via `meta_read` | Envelope and event list without payloads |
| `GET /api/tickets/:id/content` | Gateway `getTicketContent` | Needs a tenant session (below); records `content_opened` |
| `POST /api/tickets/:id/claim` | Gateway `claimTicket` | System-scope user token |
| `POST /api/tickets/:id/release` | Gateway `releaseTicket` | |
| `POST /api/tickets/:id/resolve` | Gateway `resolveTicket` | Body `{action, expectedStep, comment?, edits?}`; tenant session |
| `POST /api/tickets/:id/comment` | Gateway `addComment` | Tenant session |
| `GET /healthz`, `GET /readyz` | | Readiness checks the pool |

### Read access

The BFF holds a Vault-issued credential for `pitcrew_meta_read`. This is an own-store read of envelope data, behind a verified system-scope user token whose session carries the agent success role. The BFF checks the role before every query and refuses (fail closed) on a missing or unverifiable token. The queue is a platform-wide view by design for this role.

### Content access

Opening or acting on content needs a session for the ticket's tenant. Phase 1 behaviour:

1. The BFF calls `getTicketContent` or `resolveTicket` through the gateway with the staff member's token.
2. The component authorizes with the Pit Crew OpenFGA model: the caller must hold the agent success role on the platform **and** the ticket must be open at a step whose `session` boundary the caller's role grants.
3. The component records `content_opened` with the caller and, where present, the assumed tenant.

A true tenant assume (the STS exchanging a system session for a tenant session for a chosen tenant) is the intended end state. The portal performs it at launch through the auth-code flow, and the BFF cannot mint it. Until the platform provides a console-callable exchange, Phase 1 uses the check above and fails closed if the Pit Crew model denies. It is a platform dependency, not a Pit Crew change.

## Exporter Metrics and Alerts

`sql_exporter` runs with the `meta_read` credential (the same Vault role the BFF uses, a separate `VaultDynamicSecret` in the exporter's own chart). Collector queries:

| Metric | Type | Query |
| --- | --- | --- |
| `pitcrew_sla_breached_open` | gauge | `SELECT count(*) FROM meta.queue_entries q JOIN meta.tickets t USING (ticket_id) WHERE q.breached_at IS NOT NULL AND t.state IN ('accepted','in_progress','waiting')` |
| `pitcrew_queue_depth` | gauge, labels `queue`, `sop` | open entries grouped by queue and SOP |
| `pitcrew_oldest_open_age_seconds` | gauge, label `queue` | `max(extract(epoch from now() - created_at))` per queue |
| `pitcrew_due_unbreached_overdue` | gauge | entries with `due_at < now()` and `breached_at IS NULL` (the worker timer is late) |
| `pitcrew_tickets_by_state` | gauge, label `state` | counts by state |

Rules (`PrometheusRule`, in the EKS stack under the `agent-success/` rules directory, evaluator label `thanos-ruler`, Alertmanager label `team: agent-success`):

| Alert | Condition | For | Severity |
| --- | --- | --- | --- |
| `PitcrewSlaBreached` | `pitcrew_sla_breached_open > 0` | 5m | warning |
| `PitcrewSlaBreachedMany` | `pitcrew_sla_breached_open > 10` | 10m | critical |
| `PitcrewWorkerTimerLate` | `pitcrew_due_unbreached_overdue > 0` | 10m | warning |
| `PitcrewExporterDown` | `up{job="pitcrew-sql-exporter"} == 0` | 5m | critical |

The `ServiceMonitor` lives in the exporter's chart so `prometheus-obs-1` scrapes it, and carries the labels that instance selects on (*derive* from an existing ServiceMonitor in the EKS stack).

## Seed Job (dev only)

`pitcrew-seed-1` is a `CronJob` (suspended by default, enabled only in the dev values file through GitOps). It runs `cmd/seed`, which uses the worker role to insert tickets through the same `RegisterTicket` path and starts workflows, so seeded tickets behave like real ones.

| Property | Value |
| --- | --- |
| Schedule | `*/30 * * * *`, `concurrencyPolicy: Forbid` |
| Tenant | A fixed dev seed tenant ID from values (`seedTenantId`) |
| Tickets | Up to 12: a mix across both sample SOPs, priorities and states, a few with `dueAt` in the past to exercise SLA breach |
| Idempotency | Keys are deterministic (`seed-<n>`), so re-runs do not duplicate |
| Guard | The binary refuses to run unless `PITCREW_ENV=dev` |

## Configuration

### Environment variables

| Variable | Component | Meaning |
| --- | --- | --- |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSSLMODE` | worker, console, exporter | Connection target |
| `PGUSER_FILE`, `PGPASSWORD_FILE` | worker, console, exporter | Vault-rendered credential files; the pool re-reads on rotation |
| `PGMAXCONNS`, `PGMAXCONNLIFETIME` | worker, console | Pool sizing |
| `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE` | worker | Cluster connection |
| `PITCREW_NAMESPACE` | worker | Namespace the informer watches |
| `PITCREW_ENV` | worker, seed | `dev`, `stage`, `prod` |
| `GATEWAY_NEXUS_ENDPOINT`, `NEXUS_HTTP_URL` | console | `ob1-nexus-pitcrew-cluster-1-endpoint-1` and the Temporal Nexus HTTP address (port 7243) |
| `STS_URL`, `STS_AUDIENCE` | console | Token verification and the audience for this cluster |
| `SESSION_KEY_FILE` | console | Cookie signing key from Vault KV |
| `PUBLIC_HOST` | console | `pitcrew.<environment>.orangebox.ai` |

### Vault paths

| Secret | Path or role | Consumer |
| --- | --- | --- |
| Worker database credential | DB engine `db-eng-1`, role `pitcrew_user_vault_pg_role_1` (*derive*) | worker |
| Console and exporter database credential | DB engine `db-eng-1`, role `pitcrew_meta_read_vault_pg_role_1` (*derive*) | console, exporter |
| Migration credential | static admin role | migrate Job |
| Console session key | KV `app-kv-secrets-1`, path `pitcrew/console-1/session-key` (*derive*), manual write | console |

Each chart carries a `VaultAuth` and `VaultDynamicSecret` or `VaultStaticSecret`, with the namespace added to `VaultAuthGlobal.allowedNamespaces`.

## Error Matrix

| Condition | Code | Reason token | Retryable |
| --- | --- | --- | --- |
| SOP not found | `NOT_FOUND` | `SOP_UNKNOWN` | No |
| SOP deprecated or retired | `INVALID_ARGUMENT` | `SOP_DEPRECATED`, `SOP_RETIRED` | No |
| Input fails the SOP input schema | `INVALID_ARGUMENT` | `INPUT_INVALID` | No |
| Ticket not found, or not the caller's | `NOT_FOUND` | `TICKET_NOT_FOUND` | No |
| Step moved, held by another, action not allowed | `INVALID_ARGUMENT` | `CONFLICT` | After re-read |
| FGA denies, or boundary too low | `PERMISSION_DENIED` | `NOT_PERMITTED` | No |
| FGA unreachable | `UNAVAILABLE` | `AUTHZ_UNAVAILABLE` | Yes (fail closed meanwhile) |
| Database unreachable | `UNAVAILABLE` | `STORE_UNAVAILABLE` | Yes |
| LLM router failure after retries | Step outcome `failed` | | Handled by the SOP |
| Token missing, expired, wrong audience | `UNAUTHORIZED` | | No |

## Observability

| Signal | Detail |
| --- | --- |
| Metrics | Worker: Temporal SDK metrics plus `pitcrew_transition_total{sop,outcome}`, `pitcrew_ai_step_duration_seconds`, `pitcrew_sop_cache_age_seconds`. Exporter metrics as above. |
| Logs | Structured JSON with `ticketId`, `tenantId`, `sop`, `step`, never subject content |
| Traces | Propagated from the gateway through activities |
| Dashboards | Queue depth, breaches, oldest age, transition rate (Grafana in the EKS stack, as a follow-up) |

## Testing Strategy

| Level | What |
| --- | --- |
| Unit | SOP validator (reachability, dead ends, every outcome target), template rendering, state transitions, idempotency key handling |
| Workflow | Temporal test environment: accept path, AI approve, AI unsure to human, SLA breach timer, Update rejected at wrong step, `maxRuntime` expiry, replay of recorded histories |
| Store | Against a real PostgreSQL (container): migration applies; `pitcrew_meta_read` can select `meta.*` and cannot select `content.*`; idempotent register; transition atomicity |
| Contract | `capabilitytest.Verify` for the manifest; golden JSON for each capability's schema |
| BFF | Route tests with a fake gateway and a test database; role check refuses without the agent success role; same-origin guard; content routes fail closed |
| Chart | `helm lint` and `helm template` for each env values file; CRD and sample CRs applied against a kind cluster; `kubeconform` on rendered output |
| End to end (dev) | Seed job populates tickets; UI lists them; claim, resolve and breach alert fire in a dev cluster |

## Deployment Skeleton

| Item | Detail |
| --- | --- |
| Release | One Argo CD application from the umbrella chart, per environment values file; everything disabled by default outside dev |
| Migration | `Job` with the static admin role, run as a PreSync hook; the worker starts after |
| Rollout | Worker Pinned versioning: new build gets a new deployment version, old builds drain until their tickets finish |
| Ingress | `HTTPRoute` for `pitcrew.<environment>.orangebox.ai` on the platform gateway, TLS from the existing wildcard |
| Network policy | Pod labels `pitcrew-<component>`; allow console to gateway-1, DB, STS; worker to DB, Temporal, Kubernetes API, LLM router, auth cluster; exporter to DB; Prometheus to exporter |
| RBAC | Worker ServiceAccount: `get`, `list`, `watch` on `ptsops` in its namespace |
| Images | ECR repositories for `ticket-engine-1`, `console-1`, and the mirrored exporter image |

## As built (Phase 1)

The sections above are the design. This section records where the build differs from them, and why. Nothing here is released or deployed, and nothing has been run against a real Temporal, OpenFGA, Vault or cluster.

### Layout and names

| Design | Built | Why |
| --- | --- | --- |
| `ticket-engine-1/` at the repository root | `components/ticket-engine-1/`, module `github.com/Budybot/pitcrew-cluster-1_repo-1/components/ticket-engine-1` | The repository standard puts every component under `components/`, and the catalog, `go.work` and the shared Dockerfile expect it. |
| `cmd/seed` in its own binary and chart `pitcrew-seed-1` | A `seed` mode of the worker binary (`worker seed`, like `migrate`) and a CronJob template in the `ticket-engine-1` chart | The shared Dockerfile builds one binary per image, and the seed must run the same build as the worker. The job has its own service account `pitcrew-seed-1`, its own Vault role and the netpol label `pitcrew-seed-1`. |
| Two sample SOPs | Three: `content-approval`, `skill-publish-review` and `demo-triage` | `demo-triage` has a two-minute time limit, so the dev seed can exercise a breach and its alert within minutes; a step's due time is set when the ticket enters it, so a seed cannot back-date it. |
| Task queue `pitcrew-ticket-engine-1` | `pitcrew-cluster-1-ticket-engine-1-tq` | The standard derives `<cluster>-<component>-tq`; the chart's shared task-queue ConfigMap sets it. |
| `console-1` and `sql-exporter-1` charts | Both are standalone charts like the reference consoles, off by default | They are not Temporal workers. The exporter stays off until the `sql_exporter` image is mirrored into the platform registry. |

### Database and Vault

- **No `pitcrew_meta_read` role.** The Vault catalog only grants the standard group roles, so the console and the exporter use `ob1-pitcrew-db-1-read-role`, limited to the `meta` schema by the custom grants file in the EKS stack. The worker uses `ob1-pitcrew-db-1-user-role` and the migration Job `ob1-pitcrew-db-1-admin-role`.
- **The migration role cannot `CREATE SCHEMA`** (the standard grants give it no `CREATE` on the database, even for `IF NOT EXISTS`). The grants file creates `meta` and `content`, owned by the admin role, and sets default privileges `FOR ROLE` the admin. `0001_init.sql` creates a schema only when it is missing (local and test databases) and re-grants at its end as a safety net.
- **Events carry a `dedupe_key`.** `meta.ticket_events` has a `dedupe_key` column with a unique index per ticket, so a retried activity writes its event once. The design's "idempotent on (ticket, seq)" could not do that, because the sequence number is allocated by the database.
- **Vault names** are the platform catalog's, not `pitcrew_<suffix>_vault_pg_role_1`: auth roles `ob1_tf_vault_pitcrew-cluster-1-<service>_role_1`, database paths `creds/pitcrew-cluster-1-<service>_readwrite_vault_pg_role_1` (worker, seed) and `..._readonly_...` (console, exporter), and the migration's static credentials. The console session key is `sessionSecret` at `v1/de-v2/ob1-tf-eks-de-v2-pitcrew-1-ns-1/pitcrew-cluster-1-console-1/session`. Service accounts are fixed in the chart defaults (`ticket-engine-1`, `ticket-engine-1-migrate`, `pitcrew-seed-1`, `console-1`, `sql-exporter-1`) because the Vault roles bind to exact names.

### PTSOP

- **`results` per step.** The design never said how an outcome becomes the result the requester receives. A step now declares `results: {<outcome>: <JSON object>}` for every outcome whose target is `resolved` or `rejected`. Each body must satisfy the SOP's result schema (validated when the resource is loaded). When a person resolves a ticket, their `edits` (a JSON object) are merged over the body key by key and their `comment` is added as `reason` if the result schema has that property; the merged result is checked against the schema, and an edit that breaks it is refused before the Update is accepted.
- **Admission.** The CRD's CEL rules (start names a step, every outcome leads to a step, `resolved` or `rejected`, step shape per type, spec immutable except `lifecycle`) are checked in the repository's tests with the API server's own CRD validation and admission code, so the CEL compiles and stays inside the cost budget. The worker's validator adds what CEL cannot: reachability, dead ends, the model's `outcome` enum against the step's outcomes, and the results. A resource that fails the validator is kept out of the cache and counted, and does not affect other SOPs.
- **Scope of the CRD whitelist.** A CRD is cluster-scoped, so the AppProject whitelist is by CRD name (`ptsops.pitcrew.budy.bot`), not by namespace.

### Capabilities and the gateway manifest

- The manifest format is a map keyed by capability name with a description, an optional `timeout` and a schema. It has no `scope` or `mutating` field, so the scope of a capability (tenant for requesters, platform for staff) is asserted by `ticket-engine-1` as the first thing every call does, before any authorization call. `awaitTicket` has a one-hour-one-minute timeout; every other capability inherits 15 seconds.
- `listTicketEvents` returns event payloads (AI reasoning, edits, comments), so it is content access: it needs the same permission as `getTicketContent` and records a `content_opened` event. With the Phase 1 fail-closed check this means history with payloads is readable only while a ticket waits at a human step; the console shows event metadata for every ticket from the database.

### Workflows

- **Human actions are Updates sent from an activity.** A workflow cannot send an Update to another workflow, so `resolveTicket` runs in the `Execute` activity, which checks authorization and the ticket's state, then sends the Update through the worker's own client (`activity.GetClient`). The validator refuses an action at once when the ticket is not at a human step, the step moved, the action is not offered, an action is already being applied, or the result it would produce breaks the schema. The handler applies the transition, so the caller learns the outcome and the first of two concurrent actions wins.
- **`awaitTicket` is a polling activity** with heartbeats, bounded by `waitUpTo` (default 1800 seconds, maximum 3600); when it ends first the answer is `final: false`.
- **A ticket never stays silently open.** If the workflow fails for any reason except cancellation or a conflict, it ends the ticket as `expired` and escalated, then reports the failure.
- **Search attributes are off by default** (`engine.searchAttributes`), because upserting an attribute that is not registered on the Temporal namespace fails every workflow task. Registering `TicketId`, `TenantId`, `SopName`, `SopVersion`, `Step` and `TicketState` is a platform step; then the flag is turned on.
- **The AI step is behind an interface with a refusing default.** Until the router's structured-output operation is confirmed, the default runner is not configured, so an agent step ends in its `failed` outcome after its attempts, which the sample SOPs route to a person. It never approves anything. System steps are labelled stubs (`publishSkill` records the call and succeeds).
- A time limit that passes escalates (an `sla_breached` and an `escalated` event, a log line) and keeps waiting; Phase 1 has no notification provider.

### Authorization

The model is `models/pitcrew.fga` in the authorization config. `ticket-engine-1` supplies the contextual edges from its own record of the ticket and the verified token: the ticket's tenant (`owning_tenant`), its requester, its SOP, the platform (`owning_platform`) and, only while the ticket waits at a human step, the boundary that step declares (`viewer_step_platform` or `editor_step_platform`). A ticket that is not at a human step has neither edge, so no content permission holds. The platform object is `platform:budy`; the live session is stated as `user session_<boundary> platform:budy` for staff and `... tenant:<t>` for requesters. `agent_success` is eligible for the viewer and editor boundaries only, through a new `assumable_platform_editor` union in the platform model; the STS needed no new Go mapping beyond using it.

### Console

- **Results through Nexus callbacks.** The console fires `Execute` and `getTicketContent`, `resolveTicket` and the other gateway calls need their result, so the backend passes `?callback=<in-cluster URL>` to Temporal's Nexus HTTP endpoint and resolves a pending promise when Temporal posts the completion (a `200` is a synchronous result, a `201` waits for the callback). This is the context-cluster control plane's pattern. Consequences: the chart runs **one replica** and refuses any other value (a callback lands on one pod, and a rollout loses in-flight results); the callback is served on a second port (3001) with its own Service, not on the public app; its only protection is a random one-time id in the path plus network isolation; and two platform changes are needed outside this repository: Temporal's callback allow-list must include `console-1-callback.ob1-tf-eks-de-v2-pitcrew-1-ns-1.svc.cluster.local:3001`, and a network policy must admit Temporal's history pods to that port.
- **How the backend knows the caller is staff.** A platform-scope token does not by itself prove the `agent_success` role, and no repository shows how other system-scope consoles authorize staff. The backend asks the OpenFGA read-only proxy before every query and gateway call (`may_view_pitcrew_queue` for reads, `may_work_pitcrew_queue` with an editor or admin session for actions), using the wire format of `go/authz`, failing closed (deny is 403, an outage is 503) with a short cache. This is an assumption the platform owners must confirm.
- **Reads** are the three pod adapters (queue, stats, ticket) over `meta` as the read role; the content route also needs an `x-pitcrew-intent: open-content` header and a same-origin request, because it has a recorded side effect. The content gate has no "assume tenant and reason" step, because Phase 1 has no tenant assume and `getTicketContent` takes no reason.
- **Kit version and npm setup.** The console pins `@budybot/console-kit` 0.4.0. Because `console-1` is a root workspace, npm uses the **root** `.npmrc` (the `@budybot` scope mapping and the supply-chain settings) and the root lockfile; the image build uses the component's own `.npmrc` and lockfile. Both lockfiles must be committed.
- **Not verified.** The typecheck and an end-to-end read test ran against a build of kit 0.4.0 made from its source, not the published package. The Docker image, a live callback and a browser or accessibility audit were not run.

### Observability and alerts

The exporter's Service is named `pitcrew-sql-exporter`, because the Prometheus job label is the Service name and `PitcrewExporterDown` matches `job="pitcrew-sql-exporter"`. `prometheus-obs-1` selects every ServiceMonitor, so none needs a selector label. The `agent-success` rules directory is included in the prod profile only, so the Pit Crew alerts do not evaluate in dev until the directory is added to the dev profile.

### Not verified

No Docker daemon, so the images were never built. `golangci-lint` was not run (its binary was built with an older Go than the modules). The `helm` checks used the library charts resolved from `file://` in the helm charts repository. The OpenFGA model was not validated with `fga model validate`. Nothing was exercised against Temporal's Nexus endpoint, the STS, Vault or a cluster.
