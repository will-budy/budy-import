---
name: Customer Reporting — PRD
code: customer-reporting-prd
version: 0.5
status: draft
last_updated: 2026-04-16
---

# Customer Reporting — Product Requirements

## Why This Exists

Consultants today build each client's reporting capability from scratch. Despite significant overlap across engagements — CRM data extraction, aggregation, visualization, narrative generation, and email delivery — there is no shared layer to build from. Each implementation is bespoke, costly to maintain, and impossible to improve across the board: when a better approach is discovered on one client, it cannot be propagated backward without rewriting every other client's workflow.

This compounds into four systemic problems. First, redundant work on every new engagement: the same data pipelines and rendering logic get rebuilt from scratch each time. Second, version drift: implementations diverge across clients as consultants make independent improvements, producing inconsistent quality and a growing maintenance burden. Third, consultants operating at the wrong level of abstraction — spending time on plumbing (data fetching, orchestration, formatting) rather than client-specific insight. Fourth, no platform leverage: each improvement stays local to the client it was built for rather than compounding across the ecosystem.

The Customer Reporting service introduces a shared, versioned reporting layer that consultants compose from standardized building blocks rather than building from scratch.

## What It Does

The Customer Reporting service exposes five versioned Temporal workflows via Nexus contracts: two for CRM data ingestion and three for report generation. Ingestion workflows pull raw task and activity records from Salesforce or WelcomeHome into CRM-specific structured memory tables. Report generation workflows are driven by a `ReportConfig` YAML document — supplied by the caller at trigger time — that fully specifies the time horizon, audience scope, section composition, and delivery target. The workflow compiles raw CRM data into a CRM-agnostic metrics table before producing and delivering an HTML email report. The compiled metrics table accumulates over time, enabling period-on-period trend comparisons on future runs without re-querying raw CRM data. Consultants wrap these Nexus operations inside their own parent workflows and schedule them independently. Because the report structure is expressed as config rather than code, consultants and AI agents can add sections, switch analysis modes, or attach custom templates without modifying service internals.

## Mark 1 Scope

### Supported CRM Integrations

| CRM          | Schema (database-services-l1) | Data Ingestion | Reporting | Notes                                               |
|--------------|-------------------------------|----------------|-----------|-----------------------------------------------------|
| Salesforce   | ✓                             | ✓              | ✓         | Primary target                                      |
| WelcomeHome  | ✓                             | ✓              | ✓         | Contingent on WH schema being available before UAT  |

### Nexus Contracts

| Nexus Workflow                  | Audience           | Description                                                                                          |
|---------------------------------|--------------------|------------------------------------------------------------------------------------------------------|
| `ingestSFCrmDataV1`             | —                  | Pulls Salesforce task and activity records matching a caller-supplied query config into the SF structured memory table |
| `ingestWMCrmDataV1`             | —                  | Pulls WelcomeHome task and activity records matching a caller-supplied query config into the WH structured memory table |
| `generateWeeklyUserEmailV1`     | Sales counselor    | Accepts a `ReportConfig` (scope: `user` or `community`); compiles metrics for the configured time horizon, generates a report from the configured section templates, and delivers it by email |
| `generateWeeklyManagerEmailV1`  | Regional manager   | Accepts a `ReportConfig` (scope: `regional`); compiles metrics with per-counselor breakdown for the configured time horizon, generates a report, and delivers it by email |
| `generateWeeklyGlobalEmailV1`   | Senior leadership  | Accepts a `ReportConfig` (scope: `global`); compiles org-wide metrics for the configured time horizon, generates a performance ranking report, and delivers it by email |

### Report Configuration Contract

Every `generate*` workflow accepts a `ReportConfig` as its primary input. This YAML document fully describes a report — its time horizon, audience scope, section composition, delivery target, and any custom section templates — without requiring service code changes. Consultants author configs by hand; AI agents generate or modify them programmatically. In both cases, the workflow interprets and executes the config unchanged.

**Why YAML over JSON.** YAML supports inline comments, which serve as self-documenting intent for both human readers and AI agents reading the file. Its indentation-based structure maps naturally to hierarchical report anatomy. It is the same format used in Helm values files and Kubernetes manifests — the platform's existing vocabulary — so there is no ramp-up cost. YAML is also a strict superset of JSON, so AI agents that prefer to emit JSON can do so without a separate parser.

#### Full Configuration Reference

```yaml
# report-config.yaml
# Customer Reporting v1 — Report Configuration
# Follows the Helm values pattern: structured YAML, inline comments describe intent.
# Consultants and AI agents can author or modify this file without touching service code.
version: "1"

# ── Time Horizon ──────────────────────────────────────────────────────────────
# weekly  : trailing 7 days ending at run time  [Mark 1]
#           window = [runTime − 7d, runTime)
# monthly : last full calendar month prior to the run date  [Mark 2 — not yet supported]
#           window = [first day of prior month, last day of prior month]
#           e.g. run on 2026-04-16 → window = 2026-03-01 to 2026-03-31
timeHorizon: weekly              # weekly | monthly (monthly: Mark 2)

# ── Scope ─────────────────────────────────────────────────────────────────────
# Controls aggregation granularity and which workflow this config targets:
#   user      → single counselor            (use with generateWeeklyUserEmailV1)
#   community → single community/facility   (use with generateWeeklyUserEmailV1)
#   regional  → communities under a manager (use with generateWeeklyManagerEmailV1)
#   global    → entire org; ranked views    (use with generateWeeklyGlobalEmailV1)
scope:
  level: user                    # user | community | regional | global
  entityId: "{{counselorId}}"    # runtime-bound; omit for global scope

# ── Delivery ──────────────────────────────────────────────────────────────────
delivery:
  email:
    to:
      - "{{recipientEmail}}"
    subject: "Your Week in Reflection — {{period.label}}"
    replyTo: ""                  # optional; leave empty to omit

# ── Sections ──────────────────────────────────────────────────────────────────
# Rendered in order. Each section references a built-in template (builtin/<name>)
# or a custom template (custom/<name>). Built-in templates live under
# templates/sections/ in the service repo as <name>.md.hbs files.
sections:
  - id: task-overview
    template: builtin/task-overview
    config:
      # analysisMode controls the primary task metric displayed:
      #   completion → completed vs assigned counts and rate
      #   speed      → how quickly tasks were actioned after assignment
      analysisMode: completion    # completion | speed

      # speedGranularity applies only when analysisMode = speed:
      #   tiered  → same-day / next-day / later
      #   weekly  → within week assigned / later
      speedGranularity: tiered    # tiered | weekly

      # Number of prior periods to include in the trailing trend table.
      trendWindowPeriods: 3

  - id: tours
    template: builtin/tours-overview
    config:
      showBreakdown: true         # include per-tour-type breakdown rows

  - id: progression
    template: builtin/sankey-progression
    # No config required; data comes from the pre-compiled Sankey text blob.

  - id: narrative
    template: builtin/ai-narrative
    config:
      # Reference to a prompt variant in the platform's prompt management system.
      # The workflow resolves this at runtime; prompt text is not authored here.
      promptRef: narrative-weekly-counselor-v2

# ── Extra Sections ────────────────────────────────────────────────────────────
# Custom sections extend the report without modifying built-in templates.
# Each entry requires:
#   template     : path under templates/sections/custom/ (omit .md.hbs extension)
#   description  : plain-language intent — used by AI agents when generating or
#                  linting the template; required even when humans author the template
#   dataBinding  : declares the data context the template expects at render time;
#                  the workflow assembles this before invoking the template
#
# extraSections are appended in order after the standard sections list.
extraSections:
  - id: coaching-spotlight
    template: custom/coaching-spotlight
    description: >
      Highlights 1–2 interactions from this period where the counselor acted on
      an AI suggestion. Pull from feedback entries with type = coaching. Reference
      the specific suggestion and the counselor's response. Avoid generic praise.
    dataBinding:
      source: feedback_entries
      filter:
        type: coaching
        period: current            # current | prior | all-time
      fields:
        - date
        - suggestionText
        - counselorNote
        - outcome
```

#### Time Horizon Definitions

| Value | Window | Mark 1 |
|-------|--------|--------|
| `weekly` | `[runTime − 7d, runTime)` — trailing 7 days ending at the exact moment the workflow is triggered | ✓ |
| `monthly` | `[first day of prior month, last day of prior month]` — full calendar month; 28, 29, 30, or 31 days depending on the month | Deferred (Mark 2) |

The config schema defines both values so the contract is stable for Mark 2 adoption. In Mark 1, a `ReportConfig` with `timeHorizon: monthly` is rejected at validation with a clear unsupported-cadence error. The compiled metrics table (`ob1_memory_weekly_task_reports_v1`) stores rows keyed by period start and end date, so trend comparisons will work across both cadences once monthly is implemented.

#### Section Scope Levels

| Level | Aggregation | Target workflow |
|-------|-------------|-----------------|
| `user` | Single counselor | `generateWeeklyUserEmailV1` |
| `community` | All counselors at a single facility | `generateWeeklyUserEmailV1` |
| `regional` | All counselors across communities in a region; includes per-counselor breakdown | `generateWeeklyManagerEmailV1` |
| `global` | Entire org; ranked across all regions and communities | `generateWeeklyGlobalEmailV1` |

#### Built-in Sections

| Template id | Purpose | Key config options |
|-------------|---------|-------------------|
| `builtin/task-overview` | Task completion summary with trailing trend | `analysisMode`, `speedGranularity`, `trendWindowPeriods` |
| `builtin/tours-overview` | Tour activity summary | `showBreakdown` |
| `builtin/sankey-progression` | All-time stage transition Sankey chart | — |
| `builtin/ai-narrative` | "What I Learned" narrative section | `promptRef` |
| `builtin/counselor-snapshot` | Per-counselor breakdown rows (regional and global only) | — |

#### Template System

Section templates are **Handlebars-flavored Markdown** files (`.md.hbs`). Handlebars is chosen because it is logic-minimal by design, has mature TypeScript support, supports named partials for shared sub-components, and keeps template files readable as plain Markdown without embedded rendering logic.

Rendering is a two-stage pipeline modeled on the same pattern used by static site generators (Jekyll, Hugo, Eleventy) but applied to dynamic data-driven content:

**Stage 1 — Section rendering.** For each section in the config, the workflow locates the template file (`builtin/<name>` resolves to `templates/sections/<name>.md.hbs`; `custom/<name>` resolves from the tenant's config store), assembles a typed data context from the compiled metrics row and config bindings, and invokes Handlebars to produce a rendered Markdown string. Each section is rendered independently; sections have no knowledge of each other at this stage.

**Stage 2 — Document assembly.** All rendered Markdown strings are converted to HTML using `unified` + `remark-parse` + `remark-rehype` + `rehype-stringify`, then stitched into the outer email HTML layout template (`templates/layouts/email.html.hbs`). The layout receives the ordered array of section HTML fragments plus report-level metadata (recipient name, period label, scope description).

Key implications:

- **Section templates are plain Markdown.** They can be edited, previewed, and linted with `markdownlint` without any HTML or email rendering knowledge. Diffs are clean and human-readable.
- **AI agents author at the Markdown layer.** The `description` and `dataBinding` fields in `extraSections` give an agent everything it needs to generate a correct new section template: plain-language intent, the available data fields, and the expected Markdown output. The agent never touches HTML.
- **Built-in partials handle repeated sub-components.** Common elements — metric summary cards, trend tables, counselor snapshot rows — are registered as Handlebars partials (`{{> metric-card value=metrics.completed label="LW Completed"}}`). Updating a partial propagates automatically to every section that uses it without touching the section templates themselves.
- **Custom templates are tenant-scoped.** Built-in templates are versioned in the service repo and shared across all tenants. Custom templates declared via `extraSections` are stored in a per-tenant config store and loaded at runtime, so they can be iterated without a service deployment.

### Responsibilities

#### Schema and Storage Setup (database-services-l1)
- Define and provision the Salesforce task structured memory schema (`ob1_memory_structured_sf_task_v1`) as a Mark 1 platform task
- Define and provision the WelcomeHome task structured memory schema as a Mark 1 platform task
- Define and provision the compiled weekly metrics table (`ob1_memory_weekly_task_reports_v1`) with columns supporting user, community, region, and global aggregation, including a text blob column for pre-formatted Sankey stage transition data
- Define and provision the generated report storage table (`ob1_memory_report_generated_v1`)

#### Data Ingestion (per CRM)
- Accept a connection config specifying the CRM type and target org instance to poll
- Accept a query config specifying which task and activity types to fetch, accommodating client-specific field naming and filter differences across orgs
- Fetch raw task and activity trail records from the target CRM and write them to the CRM-specific structured memory table
- Ingestion does not compile or aggregate data; compilation is the responsibility of the report generation workflows

#### Report Generation
- Validate the incoming `ReportConfig` at workflow start; reject with a descriptive error and take no further action if the config is malformed, references a missing custom template, specifies a `scope.level` that does not match the called workflow, or uses a `timeHorizon` value not yet supported in Mark 1
- Resolve the time horizon window from `timeHorizon` before any data access: in Mark 1, only `weekly` is supported, producing a trailing 7-day window ending at run time
- Read raw task records from the CRM-specific structured memory table for the requested tenant and scope
- Compile focus-point metrics (completion rate, or same-day / next-day speed, or within-week speed depending on the `task-overview` section config) at the requested aggregation level — user, community, region, or global — and write the results into `ob1_memory_weekly_task_reports_v1`
- Compute and store pre-formatted Sankey stage transition text in the compiled row, ready for direct consumption by the chart renderer without further CRM queries
- Apply normalization ceiling when configured to prevent any single counselor from distorting community or regional rates
- Check idempotency before generating: if a delivered report record already exists for the same tenant, scope, focus point, and period, return the existing report ID without re-generating or re-sending
- Read trend comparison data from previously compiled rows in `ob1_memory_weekly_task_reports_v1`; do not re-query raw CRM tables for historical periods
- Render each section declared in `ReportConfig.sections` and `ReportConfig.extraSections` in order, using the two-stage Handlebars-Markdown pipeline described in the Report Configuration Contract; skip a section only if its required data is entirely absent and log the skip with a reason
- For global reports: include ranked views of best and worst performing regions, communities, and individual users for the reporting period
- Persist each generated report — section HTML, source data, and the `ReportConfig` used — to `ob1_memory_report_generated_v1` before any delivery attempt
- Assemble section HTML fragments into a complete HTML email using the layout template and deliver to the `delivery.email.to` list from the config

### New Platform Infrastructure

| Component                                | Owner / Type                    | Description                                                                                       |
|------------------------------------------|---------------------------------|---------------------------------------------------------------------------------------------------|
| `ob1_memory_structured_sf_task_v1`       | database-services-l1 migration  | Raw Salesforce task and activity trail records, per tenant                                        |
| WelcomeHome task structured memory       | database-services-l1 migration  | Raw WelcomeHome task records, per tenant                                                          |
| `ob1_memory_weekly_task_reports_v1`      | database-services-l1 migration  | Compiled weekly metrics with user, community, region, and global columns; includes Sankey text blob; CRM-agnostic |
| `ob1_memory_report_generated_v1`         | database-services-l1 migration  | One row per generated report — section HTML and raw data, keyed by scope and period              |
| Built-in section templates               | Service repo (`templates/`)     | Handlebars-flavored Markdown section templates and the outer email HTML layout template; versioned with the service |
| Tenant custom template store             | Platform config store           | Per-tenant custom section templates declared via `extraSections`; loaded at workflow runtime      |
| Shared Consultant Worker-2               | New Temporal worker             | Hosts all reporting workflows and activities; separate from Worker-1                              |
| `ingestSFCrmDataV1` (Nexus)             | Nexus operation on Worker-2     | SF ingestion workflow; parameterized by connection config and query config                        |
| `ingestWMCrmDataV1` (Nexus)             | Nexus operation on Worker-2     | WelcomeHome ingestion workflow; parameterized by connection config and query config               |
| `generateWeeklyUserEmailV1` (Nexus)     | Nexus operation on Worker-2     | Weekly counselor-level report: compiles, generates, and delivers                                  |
| `generateWeeklyManagerEmailV1` (Nexus)  | Nexus operation on Worker-2     | Weekly manager-level report: compiles with counselor breakdown, generates, and delivers           |
| `generateWeeklyGlobalEmailV1` (Nexus)   | Nexus operation on Worker-2     | Weekly org-wide report: compiles across all regions and communities, ranks performance, and delivers |

## What Customer Reporting Is NOT Responsible For

- **CRM API credentials storage and rotation**: Owned by the platform's connection and credentials service. Ingestion workflows receive a connection reference at runtime; they do not store or manage credentials directly.
- **Prompt authoring and versioning**: Narrative section prompts are authored via the existing prompt management system. Customer Reporting invokes them by reference only.
- **Consultant workflow scheduling**: Consultants create and schedule their own parent workflows that call Customer Reporting's Nexus operations. Scheduling cadence is not owned by this service.
- **Recipient list persistence**: In Mark 1, recipients are supplied as explicit input at trigger time. Stored per-tenant recipient configuration is deferred.
- **Report history retrieval surface**: Generated reports are persisted for audit and future comparison but there is no consultant-facing retrieval API or UI in Mark 1.
- **Non-weekly report cadences**: Monthly, daily, or on-demand ad-hoc formats are not executed in Mark 1. The `ReportConfig` schema reserves `timeHorizon: monthly` as a stable contract but the workflow rejects it until Mark 2.
- **Per-tenant built-in template overrides**: All tenants share the same versioned built-in template set. The ability for a specific tenant to override a built-in section template independently of other tenants — without shipping a service change — is deferred.
- **Notification service abstraction**: Email delivery is built directly into Worker-2 for Mark 1. Migration to a centralized notification layer is deferred.
- **Non-weekly report cadences**: Daily, monthly, or ad-hoc report formats are out of scope for Mark 1.

## Success Criteria

| Metric | Target |
|--------|--------|
| Consultant time to implement a new client's weekly reporting using existing Nexus contracts | < 1 day (directional; vs. weeks from scratch) |
| Section completeness | All expected sections present in every delivered report |
| Sankey progression correctness | Chart accurately reflects all-time stage transitions with correct node ordering and flow weights |
| Narrative generation success | "What I Learned" section non-empty and grounded in period feedback data when feedback exists |
| Storage-before-delivery guarantee | Report record written to `ob1_memory_report_generated_v1` before delivery is attempted, without exception |
| Idempotency | Same tenant + scope + focus point + reporting period never delivered twice |
| Email delivery success rate | ≥ 99% of triggered reports delivered within 5 minutes of workflow start |
| Compiled metrics availability | `ob1_memory_weekly_task_reports_v1` row written for the reporting period before any section generation begins |

## Mark 1 UAT Acceptance Criteria

| # | Scenario | Pass condition |
|---|----------|----------------|
| 1 | Consultant triggers `generateWeeklyUserEmailV1` for a Salesforce counselor for the prior week | A correctly formatted HTML email arrives in the recipient inbox within 5 minutes |
| 2 | Consultant triggers `generateWeeklyUserEmailV1` with focus point set to speed (same-day / next-day) | Email arrives with correct speed metrics; the completion rate section is absent |
| 3 | Consultant triggers `generateWeeklyManagerEmailV1` for a regional manager | Email includes per-counselor breakdown and community aggregate alongside the standard sections |
| 4 | Consultant triggers `generateWeeklyGlobalEmailV1` for an org with multiple regions and communities | Email arrives with an org-wide summary including ranked best and worst performing regions, communities, and individual users |
| 5 | Consultant triggers `generateWeeklyUserEmailV1` for a scope with no ingested data for the reporting period | No email is sent; the workflow returns a clear failure indicating no data was available for that scope and period |
| 6 | Consultant triggers the same report twice (same tenant, scope, focus point, and period) | Second trigger produces no additional email; the workflow returns confirmation that the report was already delivered |
| 7 | Consultant's parent workflow schedules `generateWeeklyManagerEmailV1` to run weekly for a given tenant | Reports are generated and delivered automatically on the configured cadence without further manual intervention |
| 8 | Consultant triggers `ingestSFCrmDataV1` for a Salesforce org with active task and activity records | Task records appear in `ob1_memory_structured_sf_task_v1` within 30 minutes; no compiled rows are written at this stage |
| 9 | After `ingestSFCrmDataV1` completes, consultant triggers `generateWeeklyUserEmailV1` for the same tenant | A compiled row appears in `ob1_memory_weekly_task_reports_v1` for the reporting period; report is generated and delivered |
| 10 | Consultant triggers `ingestSFCrmDataV1` a second time for a tenant with existing ingested data (incremental run) | Only new or updated records are written; no duplicates appear in `ob1_memory_structured_sf_task_v1` |
| 11 | Consultant triggers `ingestSFCrmDataV1` with a custom query config filtering to a specific Salesforce activity type | Only records matching the query config appear in structured memory; records of other types are excluded |
| 12 | Consultant triggers `ingestWMCrmDataV1` for a WelcomeHome org with active task records | Task records appear in the WelcomeHome structured memory table; no compiled rows are written at this stage |
| 13 | A report is triggered for a second time for the same tenant and period after the first report ran successfully | The trend section in the second report's equivalent (e.g., the following week's report) draws week-on-week data from `ob1_memory_weekly_task_reports_v1`; no raw CRM queries are issued for the prior week |
| 14 | A new tenant is onboarded from scratch: schemas provisioned in database-services-l1, ingestion run, first report triggered | Report is generated and delivered successfully with no manual schema setup beyond the initial onboarding step |
| 15 | A report is triggered for a counselor with no feedback entries in the reporting period | Report is delivered with all other sections intact; the narrative section contains a placeholder indicating no feedback was recorded, not an error |
| 16 | The Mailgun API is unavailable when delivery is attempted | No report data is lost; the workflow retries delivery automatically and succeeds once Mailgun recovers |
| 17 | The Worker-2 pod restarts mid-workflow during section generation | Workflow resumes from the last completed activity checkpoint; the report is delivered once the pod is back |
| 18 | Consultant triggers `generateWeeklyUserEmailV1` with `timeHorizon: monthly` | Workflow rejects the config at validation with a clear unsupported-cadence error; no data is read and no email is sent |
| 19 | Consultant triggers `generateWeeklyUserEmailV1` with `analysisMode: speed` and `speedGranularity: tiered` | Email contains same-day / next-day / later breakdown; the completion rate section is absent from the delivered report |
| 20 | Consultant triggers `generateWeeklyUserEmailV1` with `analysisMode: speed` and `speedGranularity: weekly` | Email contains within-week-assigned / later breakdown; same-day / next-day breakdown is absent |
| 21 | Consultant passes a ReportConfig with a valid `extraSections` entry referencing an existing custom template and a correct `dataBinding` | Custom section appears in the delivered email at the correct position; section content reflects the bound data fields |
| 22 | Consultant passes a ReportConfig with an `extraSections` entry referencing a template file that does not exist in the tenant config store | Workflow fails at config validation before any data access; returns a clear error identifying the missing template; no partial email is sent |
| 23 | Consultant passes a ReportConfig where `scope.level: regional` is used with `generateWeeklyUserEmailV1` | Workflow rejects the config at validation; returns a descriptive error indicating scope/workflow mismatch; no report is generated |

## Deferred Scope (Mark 2+)

Mark 2 will be defined in a separate PRD / HLD / TRD once Mark 1 is live and operating.

- **Stored recipient configuration**: Per-tenant recipient lists stored in platform config rather than supplied at trigger time.
- **Report history and retrieval**: A surface for consultants to view and compare previously generated reports over time.
- **Per-tenant built-in template overrides**: A structured, operator-safe process for a single tenant to diverge from the shared built-in template set without a service deployment.
- **Self-service tenant configuration**: Consultants configure Sankey mappings, normalization ceilings, and ingestion schedules without Budy engineering involvement.
- **Additional report cadences**: Monthly, daily, or on-demand ad-hoc report formats. The `ReportConfig` schema reserves `timeHorizon: monthly` as a stable contract for Mark 2; Mark 1 rejects it at validation.
- **Additional report types and focus points**: New report dimensions composed from the same primitive layer.
- **Non-email delivery channels**: Slack, in-app, or other delivery surfaces.