---
name: Customer Reporting — Nexus Contracts
code: customer-reporting-nexus-contracts
version: 0.1
status: draft
last_updated: 2026-04-16
---

# Customer Reporting — Nexus Contracts

Customer Reporting exposes five Nexus operations on Worker-2, grouped into two roles:

1. **CRM Ingestion** — pulls raw task and activity records from Salesforce or WelcomeHome into structured memory tables. Stateless: does not compile or aggregate.
2. **Report Generation** — compiles metrics from structured memory, renders a `ReportConfig`-driven HTML email, and delivers it. All three generate operations share the same input contract (`ReportConfig`) and output contract; they differ only in the `scope.level` they accept.

Callers are parent workflows authored by consultants. They are responsible for scheduling, supplying credentials references, and constructing `ReportConfig` documents. Customer Reporting owns everything from data retrieval through delivery.

---

## Operations Exposed

### `reporting.ingestSFCrmDataV1`

**Called by:** Consultant parent workflows.

**Purpose:** Fetches Salesforce task and activity records matching the supplied query config and writes them into `ob1_memory_structured_sf_task_v1` for the given tenant. Incremental: only new or updated records are written; existing records are not duplicated.

**Nexus service name:** `reporting`
**Operation name:** `ingestSFCrmDataV1`
**Task queue:** `reporting.activities`

#### Ingest SF CRM Data Input

```typescript
interface IngestSFCrmDataInput {
  // ── Tenant ───────────────────────────────────────────────────────────
  tenant_id: string;
  // Resolved tenant identifier. Required for storage isolation and audit logging.

  // ── Connection ───────────────────────────────────────────────────────
  connection: {
    org_instance_url: string;
    // Salesforce instance base URL. e.g. "https://myorg.salesforce.com"

    connection_ref: string;
    // Opaque reference to the Salesforce OAuth credentials stored in the
    // platform credentials service. Customer Reporting resolves this at
    // runtime; it never stores credentials directly.
  };

  // ── Query ────────────────────────────────────────────────────────────
  query: {
    task_types: string[];
    // Salesforce Task.Type values to include. Client-specific — consult the
    // Salesforce org's Task picklist. e.g. ["Call", "Email", "Tour Scheduled"]

    activity_types?: string[];
    // Salesforce Activity (Event) types to include. Optional; omit to skip
    // activity records. e.g. ["Tour", "In-Person Visit"]

    assigned_to_user_ids?: string[];
    // Restrict ingestion to tasks/activities assigned to these Salesforce User IDs.
    // Omit to ingest all users in the org (recommended for initial full loads).

    lookback_days?: number;
    // How far back to look for records relative to run time. Default: 90.
    // Increase for initial loads; reduce for scheduled incremental runs.
  };
}
```

#### Ingest SF CRM Data Output

```typescript
interface IngestSFCrmDataOutput {
  run_id: string;
  // Unique identifier for this ingestion run. Useful for tracing and audit.

  records_written: number;
  // New or updated records written to ob1_memory_structured_sf_task_v1.

  records_skipped: number;
  // Records already present and unchanged; not re-written.

  period_start: string;
  // ISO8601 timestamp of the earliest record ingested in this run.

  period_end: string;
  // ISO8601 timestamp of the latest record ingested in this run.
}
```

#### Ingest SF CRM Data Error Types

```typescript
// All errors thrown as Temporal ApplicationFailure.
// retryable=true  → Temporal retries per the configured retry policy.
// retryable=false → Temporal does not retry; error propagates to the calling workflow.

InvalidConnectionConfigError   // retryable=false — malformed connection_ref or missing org_instance_url
InvalidQueryConfigError        // retryable=false — task_types is empty or query is structurally invalid
CrmAuthError                   // retryable=false — Salesforce OAuth credentials invalid or revoked
CrmConnectionError             // retryable=true  — transient network failure reaching Salesforce
CrmQuotaError                  // retryable=true  — Salesforce API quota exceeded; Temporal respects backoff
CrmApiError                    // retryable=false — Salesforce 4xx response that is not auth or quota
```

#### Ingest SF CRM Data Retry Policy

```typescript
{
  initialInterval:    "5s",
  backoffCoefficient: 2.0,
  maximumInterval:    "5m",
  maximumAttempts:    5,
  nonRetryableErrorTypes: [
    "InvalidConnectionConfigError",
    "InvalidQueryConfigError",
    "CrmAuthError",
    "CrmApiError",
  ],
}
```

#### Ingest SF CRM Data SLA

| Metric | Target |
|--------|--------|
| p50 completion time (incremental, < 500 records) | < 2 min |
| p99 completion time (full load, < 5 000 records) | < 30 min |

---

### `reporting.ingestWMCrmDataV1`

**Called by:** Consultant parent workflows.

**Purpose:** Identical role to `ingestSFCrmDataV1` but targets WelcomeHome. Writes records into the WelcomeHome structured memory table.

**Nexus service name:** `reporting`
**Operation name:** `ingestWMCrmDataV1`
**Task queue:** `reporting.activities`

#### Ingest WM CRM Data Input

```typescript
interface IngestWMCrmDataInput {
  // ── Tenant ───────────────────────────────────────────────────────────
  tenant_id: string;

  // ── Connection ───────────────────────────────────────────────────────
  connection: {
    org_instance_url: string;
    // WelcomeHome instance base URL.

    connection_ref: string;
    // Opaque reference to WelcomeHome API credentials in the platform
    // credentials service.
  };

  // ── Query ────────────────────────────────────────────────────────────
  query: {
    task_types: string[];
    // WelcomeHome task type identifiers to include. Client-specific —
    // consult the WelcomeHome org's task type configuration.

    assigned_to_user_ids?: string[];
    // Restrict ingestion to tasks assigned to these WelcomeHome user IDs.
    // Omit to ingest all users.

    lookback_days?: number;
    // Default: 90.
  };
}
```

#### Ingest WM CRM Data Output

```typescript
interface IngestWMCrmDataOutput {
  run_id: string;
  records_written: number;
  records_skipped: number;
  period_start: string;   // ISO8601
  period_end: string;     // ISO8601
}
```

#### Ingest WM CRM Data Error Types

```typescript
// Same pattern as ingestSFCrmData; error names are CRM-agnostic.
InvalidConnectionConfigError   // retryable=false
InvalidQueryConfigError        // retryable=false
CrmAuthError                   // retryable=false
CrmConnectionError             // retryable=true
CrmQuotaError                  // retryable=true
CrmApiError                    // retryable=false
```

#### Ingest WM CRM Data Retry Policy

Same as `ingestSFCrmData`.

---

### `reporting.generateWeeklyUserEmailV1`

**Called by:** Consultant parent workflows.

**Purpose:** Compiles metrics for a single counselor or community, renders the configured report sections, and delivers an HTML email. Accepted `scope.level` values: `user`, `community`.

**Nexus service name:** `reporting`
**Operation name:** `generateWeeklyUserEmailV1`
**Task queue:** `reporting.workflows`

---

### `reporting.generateWeeklyManagerEmailV1`

**Called by:** Consultant parent workflows.

**Purpose:** Compiles metrics for a region with a per-counselor breakdown, renders the configured report sections, and delivers an HTML email. Accepted `scope.level` value: `regional`.

**Nexus service name:** `reporting`
**Operation name:** `generateWeeklyManagerEmailV1`
**Task queue:** `reporting.workflows`

---

### `reporting.generateWeeklyGlobalEmailV1`

**Called by:** Consultant parent workflows.

**Purpose:** Compiles org-wide metrics across all regions and communities, renders the configured report sections including performance rankings, and delivers an HTML email. Accepted `scope.level` value: `global`.

**Nexus service name:** `reporting`
**Operation name:** `generateWeeklyGlobalEmailV1`
**Task queue:** `reporting.workflows`

---

### Generate Report — Shared Input, Output, and Error Contract

All three generate operations share the same input and output types. Only the accepted `scope.level` values differ, as noted above.

#### Report Config Type

`ReportConfig` is the primary input. Consultants typically author it as YAML and parse it before calling. The parsed object is passed directly as the `report_config` field.

```typescript
interface ReportConfig {
  version: "1";

  timeHorizon: "weekly";
  // "monthly" is reserved in the schema for Mark 2 but rejected at validation in Mark 1.
  // Passing timeHorizon: "monthly" returns UnsupportedTimeHorizonError immediately.

  scope: {
    level: "user" | "community" | "regional" | "global";
    entityId?: string;
    // Required for user, community, and regional scope.
    // Omit for global scope.
    // user      : counselor's platform user ID
    // community : community/facility ID
    // regional  : regional manager's platform user ID (report covers their communities)
  };

  delivery: {
    email: {
      to: string[];           // one or more recipient addresses
      subject: string;        // supports {{period.label}} and {{scope.entityName}} tokens
      replyTo?: string;       // optional reply-to address
    };
  };

  sections: ReportSection[];
  // Standard sections, rendered in order.

  extraSections?: ExtraSection[];
  // Custom sections appended after standard sections.
}

interface ReportSection {
  id: string;
  // Unique identifier for this section within the report. Used in logs and error messages.

  template: string;
  // Built-in template reference: "builtin/<name>"
  // See Built-in Templates below for supported values.

  config?: {
    // task-overview config (used when template = "builtin/task-overview"):
    analysisMode?: "completion" | "speed";
    // completion (default): completed vs assigned counts and rate
    // speed: how quickly tasks were actioned after assignment

    speedGranularity?: "tiered" | "weekly";
    // Applies only when analysisMode = "speed".
    // tiered: same-day / next-day / later
    // weekly: within week assigned / later

    trendWindowPeriods?: number;
    // Number of prior periods in the trailing trend table. Default: 3.

    // tours-overview config (used when template = "builtin/tours-overview"):
    showBreakdown?: boolean;
    // Include per-tour-type breakdown rows. Default: true.

    // ai-narrative config (used when template = "builtin/ai-narrative"):
    promptRef?: string;
    // Reference to a prompt variant in the platform's prompt management system.
  };
}

interface ExtraSection {
  id: string;
  // Unique identifier. Must not collide with any id in sections[].

  template: string;
  // Custom template reference: "custom/<name>"
  // Resolves to a .md.hbs file in the tenant's custom template store.
  // Workflow fails at validation if the referenced file does not exist.

  description: string;
  // Plain-language description of the section's intent. Used by AI agents when
  // generating or linting the template. Required even for human-authored templates.

  dataBinding: {
    source: string;
    // Named data source the template expects. Supported values: "feedback_entries",
    // "task_records", "tour_records". TRD will define the full supported list.

    filter?: Record<string, string>;
    // Key-value filters applied to the data source before rendering.
    // Supported filter keys depend on the source; see TRD for field reference.
    // "period" filter accepts: "current" | "prior" | "all-time"

    fields: string[];
    // Fields from the data source made available to the Handlebars template context.
  };
}
```

#### Built-in Templates

| Template id | Accepted scope levels | Required config keys |
|-------------|----------------------|----------------------|
| `builtin/task-overview` | all | none (all keys have defaults) |
| `builtin/tours-overview` | all | none |
| `builtin/sankey-progression` | all | none |
| `builtin/ai-narrative` | all | `promptRef` |
| `builtin/counselor-snapshot` | `regional`, `global` | none |

#### Generate Report Input

```typescript
interface GenerateReportInput {
  tenant_id: string;
  // Resolved tenant identifier. Required for data access, idempotency checks,
  // storage writes, and audit logging.

  report_config: ReportConfig;
  // Fully constructed ReportConfig object. Consultants typically parse their
  // YAML config file and pass the resulting object here.
}
```

#### Generate Report Output

```typescript
interface GenerateReportOutput {
  report_id: string;
  // Row ID in ob1_memory_report_generated_v1. Stable across retries for the
  // same tenant + scope + period (the record is written before delivery is attempted).

  already_delivered: boolean;
  // true  → this tenant + scope + period was already delivered on a prior run;
  //         no email was sent; report_id references the original delivered record.
  // false → report was compiled and delivered in this run.

  period_start: string;
  // ISO8601 timestamp of the actual period start used (derived from timeHorizon at run time).

  period_end: string;
  // ISO8601 timestamp of the actual period end used.

  sections_rendered: string[];
  // IDs of sections successfully rendered, in order. A section is omitted here
  // (and from the email) only if its required data was entirely absent; the workflow
  // logs the skip with a reason rather than failing.
}
```

#### Generate Report Error Types

```typescript
// retryable=false errors are returned before any data access or storage writes.
// retryable=true errors may be thrown after a metrics row has been written
// (the row is idempotent; re-attempts do not duplicate it).

InvalidReportConfigError       // retryable=false — config is structurally invalid or missing required fields
UnsupportedTimeHorizonError    // retryable=false — timeHorizon value is not yet supported (e.g. "monthly" in Mark 1)
ScopeMismatchError             // retryable=false — scope.level is not accepted by the called workflow
MissingTemplateError           // retryable=false — extraSections references a custom template that does not exist
NoDataAvailableError           // retryable=false — no ingested CRM records exist for this tenant + scope + period
NarrativeGenerationError       // retryable=true  — prompt service unavailable or returned an empty result
EmailDeliveryTransientError    // retryable=true  — Mailgun 5xx or network error
EmailDeliveryPermanentError    // retryable=false — Mailgun 4xx (invalid address, domain not verified, etc.)
```

#### Generate Report Retry Policy

```typescript
{
  initialInterval:    "2s",
  backoffCoefficient: 2.0,
  maximumInterval:    "60s",
  maximumAttempts:    10,
  nonRetryableErrorTypes: [
    "InvalidReportConfigError",
    "UnsupportedTimeHorizonError",
    "ScopeMismatchError",
    "MissingTemplateError",
    "NoDataAvailableError",
    "EmailDeliveryPermanentError",
  ],
}
```

#### Generate Report SLA

| Metric | Target |
|--------|--------|
| p50 end-to-end (trigger → inbox) | < 2 min |
| p99 end-to-end (trigger → inbox) | < 5 min |
| Delivery success rate (with retries) | ≥ 99% |

---

## Operations Consumed

**None.** Customer Reporting does not call Nexus operations on other services. Its outbound interactions are:

- Reading from and writing to platform database tables directly via `database-services-l1` provisioned schemas
- Calling Salesforce and WelcomeHome APIs directly for CRM ingestion
- Calling Mailgun directly for email delivery (migration to a centralized notification service is deferred to Mark 2)
- Invoking prompt variants via the platform's prompt management system (activity-level call, not Nexus)

---

## Versioning Policy

Operation names carry a major version suffix (`V1`, `V2`, …). The suffix increments only on **breaking changes**. Non-breaking changes are delivered in-place on the existing version with no rename and no caller migration required.

**Non-breaking (no version bump):**
- New optional fields added to an input type
- New fields added to an output type (callers must tolerate unknown fields)
- New built-in template IDs
- New accepted `scope.level` values
- New non-retryable error types added to the error set
- Performance or SLA improvements

**Breaking (requires new major version):**
- Removing or renaming a field
- Narrowing a type (e.g. `string` → `"a" | "b"`)
- Changing the semantics of an existing field
- Removing a previously accepted `scope.level` or error type

When a breaking change is needed, a new operation is introduced alongside the old one:

```text
reporting.generateWeeklyUserEmailV1  → current; served until all callers migrate
reporting.generateWeeklyUserEmailV2  → new contract
```

Both versions coexist on the same worker until migration is complete. The old version is decommissioned only after all known callers have cut over.

---

## Caller Guidance

### Authoring a ReportConfig

Consultants typically maintain a YAML file per tenant and parse it at workflow start. The parsed object is passed directly to the generate operation. Keeping the YAML file in source control allows AI agents to read, modify, and regenerate it without touching workflow code.

```yaml
# fairhaven-counselor-weekly.yaml
version: "1"
timeHorizon: weekly
scope:
  level: user
  entityId: "{{counselorId}}"   # bind at runtime in the parent workflow
delivery:
  email:
    to: ["{{recipientEmail}}"]
    subject: "Your Week in Reflection — {{period.label}}"
sections:
  - id: task-overview
    template: builtin/task-overview
    config:
      analysisMode: completion
      trendWindowPeriods: 3
  - id: tours
    template: builtin/tours-overview
  - id: progression
    template: builtin/sankey-progression
  - id: narrative
    template: builtin/ai-narrative
    config:
      promptRef: narrative-weekly-counselor-v2
```

### Calling a Generate Operation

```typescript
import { proxyActivities } from "@temporalio/workflow";
import type {
  GenerateReportInput,
  GenerateReportOutput,
} from "@de-v1/customer-reporting-types";
import * as yaml from "js-yaml";
import * as fs from "fs";

const { generateWeeklyUserEmailV1 } = proxyActivities<{
  generateWeeklyUserEmailV1(input: GenerateReportInput): Promise<GenerateReportOutput>;
}>({
  startToCloseTimeout: "10m",
  retry: {
    maximumAttempts: 10,
    nonRetryableErrorTypes: [
      "InvalidReportConfigError",
      "UnsupportedTimeHorizonError",
      "ScopeMismatchError",
      "MissingTemplateError",
      "NoDataAvailableError",
      "EmailDeliveryPermanentError",
    ],
  },
});

// Inside the parent workflow:
const rawConfig = yaml.load(fs.readFileSync("fairhaven-counselor-weekly.yaml", "utf8"));

// Bind runtime values into the config (replace {{tokens}} before passing)
const reportConfig = bindConfig(rawConfig, {
  counselorId: counselor.platformUserId,
  recipientEmail: counselor.email,
});

const result = await generateWeeklyUserEmailV1({
  tenant_id: tenantId,
  report_config: reportConfig,
});

if (result.already_delivered) {
  // Idempotency hit — safe to log and continue; no duplicate email was sent
  log.info("report already delivered", { report_id: result.report_id });
} else {
  log.info("report delivered", {
    report_id: result.report_id,
    period_start: result.period_start,
    period_end: result.period_end,
    sections: result.sections_rendered,
  });
}
```

### Calling an Ingest Operation

```typescript
const { ingestSFCrmDataV1 } = proxyActivities<{
  ingestSFCrmDataV1(input: IngestSFCrmDataInput): Promise<IngestSFCrmDataOutput>;
}>({
  startToCloseTimeout: "60m",   // full loads can be slow
  retry: {
    maximumAttempts: 5,
    nonRetryableErrorTypes: [
      "InvalidConnectionConfigError",
      "InvalidQueryConfigError",
      "CrmAuthError",
      "CrmApiError",
    ],
  },
});

const ingestResult = await ingestSFCrmDataV1({
  tenant_id: tenantId,
  connection: {
    org_instance_url: "https://fairhaven.salesforce.com",
    connection_ref: "cred:fairhaven:salesforce:oauth",
  },
  query: {
    task_types: ["Call", "Email", "Tour Scheduled", "Follow-Up"],
    activity_types: ["Tour"],
    lookback_days: 90,
  },
});

log.info("ingestion complete", {
  run_id: ingestResult.run_id,
  records_written: ingestResult.records_written,
  records_skipped: ingestResult.records_skipped,
});
```

### Key Rules for Callers

1. **Run ingestion before generation.** Generate operations read from structured memory tables populated by the ingest operations. Calling a generate operation for a period with no ingested data returns `NoDataAvailableError` immediately.
2. **Always handle `already_delivered: true`.** The generate operations are idempotent by design — re-triggering the same report for the same tenant, scope, and period is safe and expected on Temporal retries. Treat `already_delivered: true` as a success, not an error.
3. **Do not pass `timeHorizon: "monthly"` in Mark 1.** The schema accepts the field (it is the stable Mark 2 contract), but the workflow rejects it with `UnsupportedTimeHorizonError` before any data access.
4. **Bind runtime values before passing `ReportConfig`.** The config object must have all `{{token}}` placeholders resolved to concrete values before being passed to the operation. The workflow does not perform template substitution on the config itself.
5. **Do not swallow non-retryable errors.** Surface `NoDataAvailableError` and `InvalidReportConfigError` to the parent workflow so they can be reported to the consultant or trigger a remediation path.
