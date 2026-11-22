---
name: Customer Reporting — TRD

code: customer-reporting-trd
version: 0.4
status: draft
last_updated: 2026-04-15
---

# Customer Reporting — Technical Reference Document

## Implementation Stack

| Concern         | Choice                              | Rationale                                           |
| --------------- | ----------------------------------- | --------------------------------------------------- |
| Runtime         | TypeScript / Node 22+               | Consistent with Worker-1 and platform standard      |
| Framework       | NestJS                              | Consistent with Worker-1                            |
| Workflow engine | Temporal SDK (`@temporalio/worker`) | Platform standard                                   |
| ORM             | TypeORM                             | Consistent with existing database-services entities |
| Sankey layout   | `d3-sankey` (npm)                   | Proven layout algorithm; same as SankeyMatic uses   |
| Chart rendering | `node-canvas` (npm)                 | Pure Node PNG rendering; no browser dependency      |
| Email delivery  | Mailgun Messages API (`mailgun.js`) | Chosen in HLD Design Decisions                      |
| Secrets         | Vault (Mailgun API key)             | Platform standard for external API credentials      |

## Project Structure

```text
shared-consultant-worker-2/
├── src/
│   ├── worker/
│   │   ├── worker.service.ts
│   │   │
│   │   ├── allWorkflow/
│   │   │   ├── reporting/
│   │   │   │   ├── generateWeeklyUserEmail.workflow.ts       # Parent (user audience)
│   │   │   │   ├── generateWeeklyManagerEmail.workflow.ts    # Parent (manager audience)
│   │   │   │   ├── generateWeeklyGlobalEmail.workflow.ts     # Parent (global audience)
│   │   │   │   ├── shared/
│   │   │   │   │   └── reportOrchestration.ts                # Shared helpers used by all three parents
│   │   │   │   │                                             # (CRM dispatch, section assembly, persist, deliver)
│   │   │   │   ├── salesforce/
│   │   │   │   │   ├── sfCompletionData.workflow.ts          # Weekly completion metrics
│   │   │   │   │   ├── sfSpeedData.workflow.ts               # Same-day/next-day speed metrics
│   │   │   │   │   ├── sfSankeyProgressionData.workflow.ts   # All-time Sankey progression
│   │   │   │   │   ├── sfCounselorSnapshot.workflow.ts       # Per-counselor breakdown (manager)
│   │   │   │   │   └── sfGlobalRanking.workflow.ts           # Best/worst performers (global)
│   │   │   │   ├── welcomehome/
│   │   │   │   │   └── [TBD — pending WH task table creation; file parity with salesforce/]
│   │   │   │   ├── trend/
│   │   │   │   │   └── trendComparison.workflow.ts           # CRM-agnostic — reads compiled table
│   │   │   │   └── interfaces/
│   │   │   │       ├── weeklyReportInputBase.ts
│   │   │   │       ├── weeklyUserEmailInput.ts
│   │   │   │       ├── weeklyManagerEmailInput.ts
│   │   │   │       ├── weeklyGlobalEmailInput.ts
│   │   │   │       ├── sankeyStageConfig.ts
│   │   │   │       ├── completionMetrics.ts
│   │   │   │       ├── speedMetrics.ts
│   │   │   │       ├── sankeyProgression.ts
│   │   │   │       ├── trendComparison.ts
│   │   │   │       ├── counselorSnapshot.ts
│   │   │   │       └── globalRanking.ts
│   │   │   ├── ingestion/                                    # TBD — structure mirrors reporting/
│   │   │   │   ├── ingestSfCrmData.workflow.ts               # TBD
│   │   │   │   └── ingestWmCrmData.workflow.ts               # TBD
│   │   │   └── all.workflow.ts                               # Barrel export
│   │   │
│   │   ├── allActivity/
│   │   │   ├── reporting/
│   │   │   │   ├── data/
│   │   │   │   │   ├── querySfTaskCompletionMetrics.activity.ts
│   │   │   │   │   ├── querySfTaskSpeedMetrics.activity.ts
│   │   │   │   │   ├── querySfSankeyProgression.activity.ts
│   │   │   │   │   ├── querySfCounselorSnapshot.activity.ts
│   │   │   │   │   └── querySfGlobalRanking.activity.ts
│   │   │   │   ├── compile/
│   │   │   │   │   └── compileWeeklyTaskReport.activity.ts
│   │   │   │   ├── trend/
│   │   │   │   │   └── queryCompiledTrend.activity.ts        # Reads weekly_task_reports_v1
│   │   │   │   ├── sections/
│   │   │   │   │   ├── renderWeeklySummarySection.activity.ts
│   │   │   │   │   ├── renderSankeyChartSection.activity.ts
│   │   │   │   │   ├── renderWhatILearnedSection.activity.ts
│   │   │   │   │   ├── renderTrendSection.activity.ts
│   │   │   │   │   ├── renderCounselorBreakdownSection.activity.ts
│   │   │   │   │   └── renderPerformanceRankingSection.activity.ts
│   │   │   │   ├── persistReport.activity.ts
│   │   │   │   ├── sendReportEmail.activity.ts
│   │   │   │   └── checkIdempotency.activity.ts
│   │   │   ├── ingestion/                                    # TBD
│   │   │   │   └── [TBD — ingestion activities]
│   │   │   └── all.activity.ts                               # Barrel export
│   │   │
│   │   ├── nexus/
│   │   │   └── reporting/
│   │   │       ├── reporting.service.contract.ts             # 5 operations
│   │   │       └── reporting.service.impl.ts
│   │   │
│   │   └── interceptors/
│   │       └── [inherited from Worker-1 patterns]
│   │
│   ├── ab-shared/
│   │   ├── entities/
│   │   │   └── reporting/
│   │   │       ├── ob1-memory-weekly-task-reports-v1.entity.ts
│   │   │       └── ob1-memory-report-generated-v1.entity.ts
│   │   ├── repository_services/
│   │   │   ├── weeklyTaskReport.repository.ts
│   │   │   └── reportGenerated.repository.ts
│   │   └── utils/
│   │       └── sankey/
│   │           ├── sankeyParser.ts                           # Parses "Source [count] Target" text
│   │           ├── sankeyLayout.ts                           # d3-sankey wrapper for node/flow positioning
│   │           └── sankeyRenderer.ts                         # node-canvas PNG rendering + base64
│   │
│   └── bb-globalServices/
│       └── [inherited from Worker-1 patterns]
```

## TypeScript Type Definitions

> Field-level documentation for all types is in the HLD "Core Interfaces" section.
> Cross-reference there for semantics; this section contains bare types only.

### `WeeklyReportInputBase` and per-workflow inputs

```typescript
// src/worker/allWorkflow/reporting/interfaces/weeklyReportInputBase.ts

export interface WeeklyReportInputBase {
  tenantId: string;
  crmType: 'salesforce' | 'welcomehome';
  focusPoint: 'completion' | 'speed';
  reportingPeriod: { startDate: string; endDate: string };
  recipients: string[];
  memoryInstanceId: string;
  agentUserIds: string[];
  sankeyConfig: SankeyStageConfig;
  trailingWeeks: number;
  normalizationCeiling?: number;
}
```

```typescript
// src/worker/allWorkflow/reporting/interfaces/weeklyUserEmailInput.ts

export interface WeeklyUserEmailInput extends WeeklyReportInputBase {
  counselorId: string;      // REQUIRED
  region?: string;          // Optional header context
}
```

```typescript
// src/worker/allWorkflow/reporting/interfaces/weeklyManagerEmailInput.ts

export interface WeeklyManagerEmailInput extends WeeklyReportInputBase {
  region: string;           // REQUIRED
  communityIds?: string[];  // Optional narrowing
}
```

```typescript
// src/worker/allWorkflow/reporting/interfaces/weeklyGlobalEmailInput.ts

export interface WeeklyGlobalEmailInput extends WeeklyReportInputBase {
  rankingDepth?: number;    // Top-N / bottom-N depth for ranking section. Default: 5.
}
```

### `SankeyStageConfig`

```typescript
// src/worker/allWorkflow/reporting/interfaces/sankeyStageConfig.ts

export interface SankeyChannelDef {
  name: string;
  wrapUpValues: string[];
  subjectKeywords: string[];
}

export interface SankeyTopicFinalDef {
  stageName: string;
  topicValues: string[];
  requiresAttendance?: boolean;
}

export interface SankeyResultOnlyFinalDef {
  stageName: string;
  resultKeywords: string[];
}

export interface SankeyStageConfig {
  rootNodeName: string;
  pendingNodeName: string;
  completedNodeName: string;
  notConnectedNoFollowName: string;
  notConnectedFollowOnName: string;
  connectedNodeName: string;
  inProgressNodeName: string;
  channels: SankeyChannelDef[];
  topicFinals: SankeyTopicFinalDef[];
  resultOnlyFinals: SankeyResultOnlyFinalDef[];
  openTaskActivityOverrideMinRows: number;
}
```

### Data Processing Output Types

```typescript
// src/worker/allWorkflow/reporting/interfaces/completionMetrics.ts

export interface CompletionMetricsOutput {
  totalAssigned: number;
  totalCompleted: number;
  totalOpen: number;
  completionRate: number;
  effectiveAssigned: number;
  extraAssigned: number;
  feedbackSamples: string[];
}
```

```typescript
// src/worker/allWorkflow/reporting/interfaces/speedMetrics.ts

export interface SpeedMetricsOutput {
  totalAssigned: number;
  totalCompleted: number;
  sameDayCount: number;
  nextDayCount: number;
  sameDayRate: number;
  nextDayRate: number;
  feedbackSamples: string[];
}
```

```typescript
// src/worker/allWorkflow/reporting/interfaces/sankeyProgression.ts

export interface StageTransition {
  from: string;
  to: string;
  count: number;
}

export interface SankeyProgressionOutput {
  stageTransitions: StageTransition[];
  sankeyTextInput: string;
  accountTotals: {
    picked: number;
    pending: number;
    completed: number;
    completedByOverride: number;
  };
  debugCounts: Record<string, number>;
}
```

```typescript
// src/worker/allWorkflow/reporting/interfaces/trendComparison.ts

export interface WeeklyBucket {
  label: string;
  assigned: number;
  completed: number;
  open: number;
  effectiveAssigned: number;
  extraAssigned: number;
  focusPointRate: number;
  displayCounts: string;
}

export interface TrendComparisonOutput {
  weeklyBuckets: WeeklyBucket[];
  previousWindowAvg: number;
  currentWindowAvg: number;
  deltaPp: number;
  trendDirection: 'up' | 'down' | 'flat' | 'insufficient';
}
```

```typescript
// src/worker/allWorkflow/reporting/interfaces/counselorSnapshot.ts

export interface CounselorRow {
  counselorName: string;
  counselorId: string;
  weekAssigned: number;
  weekCompleted: number;
  weekOpen: number;
  allTimeOpen: number;
  focusPointRate?: number;
}

export interface CommunityAggregateRow {
  communityId: string;
  communityName: string;
  weekAssigned: number;
  weekCompleted: number;
  focusPointRate: number;
}

export interface CounselorSnapshotOutput {
  counselors: CounselorRow[];
  communityAggregates: CommunityAggregateRow[];
}
```

```typescript
// src/worker/allWorkflow/reporting/interfaces/globalRanking.ts

export interface RankedRow {
  scopeId: string;
  scopeName: string;
  focusPointRate: number;
  weekAssigned: number;
  weekCompleted: number;
}

export interface GlobalRankingOutput {
  period: { startDate: string; endDate: string };
  bestRegions: RankedRow[];
  worstRegions: RankedRow[];
  bestCommunities: RankedRow[];
  worstCommunities: RankedRow[];
  bestUsers: RankedRow[];
  worstUsers: RankedRow[];
  orgWide: {
    weekAssigned: number;
    weekCompleted: number;
    focusPointRate: number;
  };
}
```

### `SectionOutput`

```typescript
// src/worker/allWorkflow/reporting/interfaces/sectionOutput.ts

export interface SectionOutput {
  sectionNumber: number;   // Ordinal slot: 1, 2, 3, … Maps to section_N columns in report record.
  html: string;
  rawData: unknown;
}
```

## ID & Key Construction

```typescript
// Report record ID: prefixed with 'rpt'
// Generated by database function: ob1_gen_prefixed_id_v2('rpt')
// Example: rpt_v2_a1b2c3d4e5f6g7h8

// Compiled weekly task report ID: prefixed with 'wtr'
// Generated by: ob1_gen_prefixed_id_v2('wtr')

// Workflow ID: deterministic for idempotency.
// `audience` is the short discriminator 'user' | 'manager' | 'global',
// set per parent workflow — it is NOT an input field, it's implicit in the op.
function buildReportWorkflowId(
  tenantId: string,
  crmType: string,
  focusPoint: string,
  audience: 'user' | 'manager' | 'global',
  periodStart: string,
  periodEnd: string,
  scope: string, // counselorId (user), region (manager), or 'global' (global)
): string {
  return `rpt:${tenantId}:${crmType}:${focusPoint}:${audience}:${periodStart}:${periodEnd}:${scope}`;
}

// Child workflow IDs: derived from parent
function buildChildWorkflowId(
  parentWorkflowId: string,
  childType: string,
): string {
  return `${parentWorkflowId}:${childType}`;
}
```

## TypeORM Entity: `ob1_memory_weekly_task_reports_v1`

CRM-agnostic compiled metrics table. One row per (tenant, crm, focus, period, aggregation level, scope).

```typescript
// src/ab-shared/entities/reporting/ob1-memory-weekly-task-reports-v1.entity.ts

import {
  Entity, Column, PrimaryColumn, Index, Unique, CreateDateColumn,
} from 'typeorm';
import { OB1BaseConsultantEntity } from '@/aa-common/global_entity_ref';

@Entity('ob1_memory_weekly_task_reports_v1')
@Unique('uq_wtr_tenant_crm_focus_period_level_scope', [
  'tenantId', 'crmType', 'focusPoint',
  'reportingPeriodStart', 'reportingPeriodEnd',
  'aggregationLevel', 'scopeKey',
])
@Index('idx_wtr_trend_lookup', [
  'tenantId', 'crmType', 'focusPoint',
  'aggregationLevel', 'scopeKey',
  'reportingPeriodEnd',
])
@Index('idx_wtr_ranking_lookup', [
  'tenantId', 'crmType', 'focusPoint',
  'reportingPeriodStart', 'reportingPeriodEnd',
  'aggregationLevel',
])
export class OB1MemoryWeeklyTaskReportsV1 extends OB1BaseConsultantEntity {
  @PrimaryColumn({
    type: 'varchar',
    name: 'id',
    length: 40,
    default: () => `ob1_gen_prefixed_id_v2('wtr')`,
  })
  id: string;

  @Column({ type: 'varchar', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', name: 'crm_type', length: 20 })
  crmType: string; // salesforce | welcomehome

  @Column({ type: 'varchar', name: 'focus_point', length: 20 })
  focusPoint: string; // completion | speed

  @Column({ type: 'date', name: 'reporting_period_start' })
  reportingPeriodStart: Date;

  @Column({ type: 'date', name: 'reporting_period_end' })
  reportingPeriodEnd: Date;

  @Column({ type: 'varchar', name: 'aggregation_level', length: 20 })
  aggregationLevel: 'user' | 'community' | 'region' | 'global';

  // Scope key: userId for user, communityId for community, region for region,
  // literal 'global' for global. Part of the uniqueness key.
  @Column({ type: 'varchar', name: 'scope_key', length: 100 })
  scopeKey: string;

  @Column({ type: 'varchar', name: 'user_id', length: 40, nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', name: 'community_id', length: 40, nullable: true })
  communityId?: string | null;

  @Column({ type: 'text', name: 'region', nullable: true })
  region?: string | null;

  // ── Metric values ─────────────────────────────────────────────────
  @Column({ type: 'int', name: 'total_assigned' })
  totalAssigned: number;

  @Column({ type: 'int', name: 'total_completed' })
  totalCompleted: number;

  @Column({ type: 'int', name: 'total_open' })
  totalOpen: number;

  @Column({ type: 'int', name: 'effective_assigned' })
  effectiveAssigned: number;

  @Column({ type: 'int', name: 'extra_assigned' })
  extraAssigned: number;

  @Column({ type: 'float', name: 'completion_rate', nullable: true })
  completionRate?: number | null;

  @Column({ type: 'float', name: 'same_day_rate', nullable: true })
  sameDayRate?: number | null;

  @Column({ type: 'float', name: 'next_day_rate', nullable: true })
  nextDayRate?: number | null;

  // ── Pre-formatted Sankey text blob ────────────────────────────────
  // Populated once per compile run at the top-of-report level (user for
  // user workflow, region for manager, global for global). Avoids re-
  // running the all-time stage classification at render time.
  @Column({ type: 'text', name: 'sankey_text_input', nullable: true })
  sankeyTextInput?: string | null;

  // ── Narrative source ──────────────────────────────────────────────
  @Column({ type: 'jsonb', name: 'feedback_samples', nullable: true })
  feedbackSamples?: string[] | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'compiled_at' })
  compiledAt: Date;
}
```

## TypeORM Entity: `ob1_memory_report_generated_v1`

```typescript
// src/ab-shared/entities/reporting/ob1-memory-report-generated-v1.entity.ts

import {
  Entity, Column, PrimaryColumn, Index, Unique, CreateDateColumn,
} from 'typeorm';
import { OB1BaseConsultantEntity } from '@/aa-common/global_entity_ref';
import { MemoryV2EntitiesMap } from '@/aa-common/global_map';

@Entity('ob1_memory_report_generated_v1')
@Unique('uq_rpt_tenant_crm_focus_audience_period_scope', [
  'tenantId', 'crmType', 'focusPoint', 'audience',
  'reportingPeriodStart', 'reportingPeriodEnd', 'scopeKey',
])
@Index('idx_rpt_tenant_audience_generated', ['tenantId', 'audience', 'focusPoint', 'generatedAt'])
export class OB1MemoryReportGeneratedV1 extends OB1BaseConsultantEntity {
  @PrimaryColumn({
    type: 'varchar',
    name: 'id',
    length: 40,
    default: () => `ob1_gen_prefixed_id_v2('rpt')`,
  })
  id: string;

  @Column({ type: 'varchar', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', name: 'crm_type', length: 20 })
  crmType: string; // salesforce | welcomehome

  @Column({ type: 'varchar', name: 'focus_point', length: 20 })
  focusPoint: string; // completion | speed

  @Column({ type: 'varchar', name: 'audience', length: 20 })
  audience: string; // user | manager | global — derived from Nexus op

  @Column({ type: 'varchar', name: 'template_version', length: 10 })
  templateVersion: string; // e.g. "v1" — tracks which HTML layout was used

  @Column({ type: 'date', name: 'reporting_period_start' })
  reportingPeriodStart: Date;

  @Column({ type: 'date', name: 'reporting_period_end' })
  reportingPeriodEnd: Date;

  @Column({ type: 'varchar', name: 'scope_key', length: 100 })
  scopeKey: string; // region value for 'region', counselorId for 'counselor' — part of unique constraint

  @Column({ type: 'text', name: 'region', nullable: true })
  region?: string | null;

  @Column({ type: 'varchar', name: 'counselor_id', length: 40, nullable: true })
  counselorId?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'generated_at' })
  generatedAt: Date;

  @Column({ type: 'timestamptz', name: 'delivered_at', nullable: true })
  deliveredAt?: Date | null;

  // ── Numbered section storage ─────────────────────────────────────
  // Each section occupies a numbered slot. Unused slots are null.
  // The templateVersion determines which content occupies which slot.

  @Column({ type: 'text', name: 'section_1_html', nullable: true })
  section1Html?: string | null;
  @Column({ type: 'jsonb', name: 'section_1_data', nullable: true })
  section1Data?: Record<string, any> | null;

  @Column({ type: 'text', name: 'section_2_html', nullable: true })
  section2Html?: string | null;
  @Column({ type: 'jsonb', name: 'section_2_data', nullable: true })
  section2Data?: Record<string, any> | null;

  @Column({ type: 'text', name: 'section_3_html', nullable: true })
  section3Html?: string | null;
  @Column({ type: 'jsonb', name: 'section_3_data', nullable: true })
  section3Data?: Record<string, any> | null;

  @Column({ type: 'text', name: 'section_4_html', nullable: true })
  section4Html?: string | null;
  @Column({ type: 'jsonb', name: 'section_4_data', nullable: true })
  section4Data?: Record<string, any> | null;

  @Column({ type: 'text', name: 'section_5_html', nullable: true })
  section5Html?: string | null;
  @Column({ type: 'jsonb', name: 'section_5_data', nullable: true })
  section5Data?: Record<string, any> | null;

  @Column({ type: 'text', name: 'section_6_html', nullable: true })
  section6Html?: string | null;
  @Column({ type: 'jsonb', name: 'section_6_data', nullable: true })
  section6Data?: Record<string, any> | null;

  @Column({ type: 'text', name: 'section_7_html', nullable: true })
  section7Html?: string | null;
  @Column({ type: 'jsonb', name: 'section_7_data', nullable: true })
  section7Data?: Record<string, any> | null;

  @Column({ type: 'text', name: 'section_8_html', nullable: true })
  section8Html?: string | null;
  @Column({ type: 'jsonb', name: 'section_8_data', nullable: true })
  section8Data?: Record<string, any> | null;
}
```

### Schema Migration: Add `region` to SF Task Table

```typescript
// migrations/customerMemory/manual/XXXXXXXXX-add-region-to-sf-task-v1.ts

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegionToSfTaskV1XXXXXXXXX implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ob1_memory_structured_sf_task_v1
      ADD COLUMN IF NOT EXISTS region TEXT;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sf_task_v1_tenant_region
      ON ob1_memory_structured_sf_task_v1 (tenant_id, region)
      WHERE region IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sf_task_v1_tenant_region;`);
    await queryRunner.query(`ALTER TABLE ob1_memory_structured_sf_task_v1 DROP COLUMN IF EXISTS region;`);
  }
}
```

## Workflow Implementations

The three parent workflows (`generateWeeklyUserEmailWorkflow`, `generateWeeklyManagerEmailWorkflow`, `generateWeeklyGlobalEmailWorkflow`) share the **same 6-step shape**:

1. Idempotency check
2. CRM-specific data processing (dispatched on `crmType`)
3. Compile to `ob1_memory_weekly_task_reports_v1`
4. Section generation (per-audience set; each section picks the speed-vs-completion HTML block)
5. Persist numbered section slots
6. Deliver email

They differ in **which child data workflows they run** and **which sections they render**. The common plumbing lives in `shared/reportOrchestration.ts`.

### Shared Activity Proxies

```typescript
// src/worker/allWorkflow/reporting/shared/reportOrchestration.ts
//
// Shared activity proxies + small helpers used by all three parent workflows.
// This is NOT a workflow itself — parent workflows import and invoke these.

import * as wf from '@temporalio/workflow';
import type { SectionOutput } from '../interfaces/sectionOutput';

export const TEMPLATE_VERSION = 'v1';

export const reportingActivities = wf.proxyActivities<{
  checkIdempotency(args: { request: any; config: any }): Promise<{ exists: boolean; reportId?: string }>;
  compileWeeklyTaskReport(args: { request: any; config: any }): Promise<{ compiledRowIds: string[] }>;
  renderWeeklySummarySection(args: { request: any; config: any }): Promise<SectionOutput>;
  renderSankeyChartSection(args: { request: any; config: any }): Promise<SectionOutput>;
  renderTrendSection(args: { request: any; config: any }): Promise<SectionOutput>;
  renderCounselorBreakdownSection(args: { request: any; config: any }): Promise<SectionOutput>;
  renderPerformanceRankingSection(args: { request: any; config: any }): Promise<SectionOutput>;
  persistReport(args: { request: any; config: any }): Promise<{ reportId: string }>;
  sendReportEmail(args: { request: any; config: any }): Promise<{ mailgunMessageId: string }>;
  queryCompiledTrend(args: { request: any; config: any }): Promise<any>;
}>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
  taskQueue: 'customer-reporting',
});

export const llmActivities = wf.proxyActivities<{
  renderWhatILearnedSection(args: { request: any; config: any }): Promise<SectionOutput>;
}>({
  startToCloseTimeout: '3 minutes',
  retry: { maximumAttempts: 2 },
  taskQueue: 'customer-reporting',
});

// Dispatch metric-gathering to the CRM-specific child workflow.
// WH branch is TBD — stubbed to throw until the WH ingestion path ships.
export function startMetricsChild(
  crmType: string,
  focusPoint: 'completion' | 'speed',
  dataInput: any,
): Promise<any> {
  if (crmType === 'salesforce') {
    const wfName = focusPoint === 'completion'
      ? 'sfCompletionDataWorkflow'
      : 'sfSpeedDataWorkflow';
    return wf.executeChild(wfName, {
      args: [dataInput],
      workflowId: `${wf.workflowInfo().workflowId}:${focusPoint}`,
    });
  }
  if (crmType === 'welcomehome') {
    throw wf.ApplicationFailure.nonRetryable(
      'WH reporting path is TBD',
      'WH_NOT_IMPLEMENTED',
    );
  }
  throw wf.ApplicationFailure.nonRetryable(
    `Unknown crmType: ${crmType}`,
    'INVALID_CRM',
  );
}

export function startSankeyChild(crmType: string, dataInput: any): Promise<any> {
  if (crmType === 'salesforce') {
    return wf.executeChild('sfSankeyProgressionDataWorkflow', {
      args: [dataInput],
      workflowId: `${wf.workflowInfo().workflowId}:sankey`,
    });
  }
  throw wf.ApplicationFailure.nonRetryable('WH sankey TBD', 'WH_NOT_IMPLEMENTED');
}

export function startCounselorSnapshotChild(crmType: string, dataInput: any): Promise<any> {
  if (crmType === 'salesforce') {
    return wf.executeChild('sfCounselorSnapshotWorkflow', {
      args: [dataInput],
      workflowId: `${wf.workflowInfo().workflowId}:snapshot`,
    });
  }
  throw wf.ApplicationFailure.nonRetryable('WH snapshot TBD', 'WH_NOT_IMPLEMENTED');
}

export function startGlobalRankingChild(crmType: string, dataInput: any): Promise<any> {
  if (crmType === 'salesforce') {
    return wf.executeChild('sfGlobalRankingWorkflow', {
      args: [dataInput],
      workflowId: `${wf.workflowInfo().workflowId}:ranking`,
    });
  }
  throw wf.ApplicationFailure.nonRetryable('WH ranking TBD', 'WH_NOT_IMPLEMENTED');
}
```

### `generateWeeklyUserEmailWorkflow` (Parent — user audience)

Audience: one counselor. Scope key = `counselorId`.
Sections: weekly summary, sankey, what-I-learned, trend.

```typescript
// src/worker/allWorkflow/reporting/generateWeeklyUserEmail.workflow.ts

import * as wf from '@temporalio/workflow';
import type { WeeklyUserEmailInput } from './interfaces/weeklyUserEmailInput';
import type { SectionOutput } from './interfaces/sectionOutput';
import type { SankeyProgressionOutput } from './interfaces/sankeyProgression';
import type { TrendComparisonOutput } from './interfaces/trendComparison';
import {
  TEMPLATE_VERSION, reportingActivities, llmActivities,
  startMetricsChild, startSankeyChild,
} from './shared/reportOrchestration';

const AUDIENCE = 'user' as const;

export async function generateWeeklyUserEmailWorkflow({
  request,
  config,
}: {
  request: WeeklyUserEmailInput;
  config: any;
}): Promise<{ success: boolean; reportId: string }> {
  const { tenantId, crmType, focusPoint, reportingPeriod, recipients, counselorId } = request;
  const scopeKey = counselorId;

  // ── Step 1: Idempotency check ──────────────────────────────────
  const idem = await reportingActivities.checkIdempotency({
    request: { tenantId, crmType, focusPoint, audience: AUDIENCE, reportingPeriod, scopeKey },
    config,
  });
  if (idem.exists) {
    wf.log.info('User report already exists', { reportId: idem.reportId });
    return { success: true, reportId: idem.reportId! };
  }

  // ── Step 2: CRM-specific data processing (parallel) ────────────
  const dataInput = { request, config };
  const [metricsOutput, sankeyOutput] = await Promise.all([
    startMetricsChild(crmType, focusPoint, dataInput) as Promise<any>,
    startSankeyChild(crmType, dataInput) as Promise<SankeyProgressionOutput>,
  ]);

  // ── Step 3: Compile into ob1_memory_weekly_task_reports_v1 ────
  // Writes one row at aggregationLevel='user' keyed by counselorId.
  await reportingActivities.compileWeeklyTaskReport({
    request: {
      tenantId, crmType, focusPoint,
      reportingPeriod,
      aggregationLevel: 'user',
      scopeKey: counselorId,
      userId: counselorId,
      metricsOutput,
      sankeyTextInput: sankeyOutput.sankeyTextInput,
    },
    config,
  });

  // ── Step 4: Trend reads from the just-compiled table ───────────
  const trendOutput: TrendComparisonOutput = await reportingActivities.queryCompiledTrend({
    request: {
      tenantId, crmType, focusPoint,
      aggregationLevel: 'user',
      scopeKey: counselorId,
      reportingPeriod,
      trailingWeeks: request.trailingWeeks,
    },
    config,
  });

  // ── Step 5: Section generation (parallel) ──────────────────────
  // Template v1 slot assignments (user audience):
  //   section1 = Weekly Summary      (speed|completion block)
  //   section2 = Sankey Chart
  //   section3 = What I Learned
  //   section4 = 3-Week Trend        (speed|completion block)
  const sections: SectionOutput[] = await Promise.all([
    reportingActivities.renderWeeklySummarySection({
      request: { sectionNumber: 1, audience: AUDIENCE, focusPoint, metricsOutput },
      config,
    }),
    reportingActivities.renderSankeyChartSection({
      request: { sectionNumber: 2, sankeyOutput },
      config,
    }),
    llmActivities.renderWhatILearnedSection({
      request: { sectionNumber: 3, feedbackSamples: metricsOutput.feedbackSamples, reportingPeriod },
      config,
    }),
    reportingActivities.renderTrendSection({
      request: { sectionNumber: 4, audience: AUDIENCE, focusPoint, trendOutput },
      config,
    }),
  ]);

  // ── Step 6: Persist + deliver ──────────────────────────────────
  const persist = await reportingActivities.persistReport({
    request: {
      tenantId, crmType, focusPoint, audience: AUDIENCE,
      templateVersion: TEMPLATE_VERSION,
      reportingPeriod, scopeKey,
      counselorId, region: request.region,
      sections,
    },
    config,
  });

  const delivery = await reportingActivities.sendReportEmail({
    request: {
      reportId: persist.reportId, recipients,
      audience: AUDIENCE, focusPoint, reportingPeriod, sections,
    },
    config,
  });

  wf.log.info('User report delivered', {
    reportId: persist.reportId, mailgunMessageId: delivery.mailgunMessageId,
  });
  return { success: true, reportId: persist.reportId };
}
```

### `generateWeeklyManagerEmailWorkflow` (Parent — manager audience)

Audience: one regional manager. Scope key = `region`.
Sections: weekly summary (region-level), sankey, what-I-learned, trend, counselor breakdown.

```typescript
// src/worker/allWorkflow/reporting/generateWeeklyManagerEmail.workflow.ts

import * as wf from '@temporalio/workflow';
import type { WeeklyManagerEmailInput } from './interfaces/weeklyManagerEmailInput';
import type { SectionOutput } from './interfaces/sectionOutput';
import type { SankeyProgressionOutput } from './interfaces/sankeyProgression';
import type { CounselorSnapshotOutput } from './interfaces/counselorSnapshot';
import type { TrendComparisonOutput } from './interfaces/trendComparison';
import {
  TEMPLATE_VERSION, reportingActivities, llmActivities,
  startMetricsChild, startSankeyChild, startCounselorSnapshotChild,
} from './shared/reportOrchestration';

const AUDIENCE = 'manager' as const;

export async function generateWeeklyManagerEmailWorkflow({
  request,
  config,
}: {
  request: WeeklyManagerEmailInput;
  config: any;
}): Promise<{ success: boolean; reportId: string }> {
  const { tenantId, crmType, focusPoint, reportingPeriod, recipients, region } = request;
  const scopeKey = region;

  // ── Step 1: Idempotency check ──────────────────────────────────
  const idem = await reportingActivities.checkIdempotency({
    request: { tenantId, crmType, focusPoint, audience: AUDIENCE, reportingPeriod, scopeKey },
    config,
  });
  if (idem.exists) {
    wf.log.info('Manager report already exists', { reportId: idem.reportId });
    return { success: true, reportId: idem.reportId! };
  }

  // ── Step 2: CRM-specific data processing (parallel) ────────────
  const dataInput = { request, config };
  const [metricsOutput, sankeyOutput, snapshotOutput] = await Promise.all([
    startMetricsChild(crmType, focusPoint, dataInput) as Promise<any>,
    startSankeyChild(crmType, dataInput) as Promise<SankeyProgressionOutput>,
    startCounselorSnapshotChild(crmType, dataInput) as Promise<CounselorSnapshotOutput>,
  ]);

  // ── Step 3: Compile rows for region + each community under it ─
  // Snapshot carries per-community aggregates; compile writes:
  //   - one aggregationLevel='region' row, scopeKey=region
  //   - one aggregationLevel='community' row per community in snapshot
  await reportingActivities.compileWeeklyTaskReport({
    request: {
      tenantId, crmType, focusPoint,
      reportingPeriod,
      aggregationLevel: 'region',
      scopeKey: region,
      region,
      metricsOutput,
      sankeyTextInput: sankeyOutput.sankeyTextInput,
      communityAggregates: snapshotOutput.communityAggregates,
    },
    config,
  });

  // ── Step 4: Trend reads region row from the compiled table ────
  const trendOutput: TrendComparisonOutput = await reportingActivities.queryCompiledTrend({
    request: {
      tenantId, crmType, focusPoint,
      aggregationLevel: 'region',
      scopeKey: region,
      reportingPeriod,
      trailingWeeks: request.trailingWeeks,
    },
    config,
  });

  // ── Step 5: Section generation ─────────────────────────────────
  // Template v1 slot assignments (manager audience):
  //   section1 = Weekly Summary          (speed|completion block)
  //   section2 = Sankey Chart
  //   section3 = What I Learned
  //   section4 = 3-Week Trend            (speed|completion block)
  //   section5 = Counselor Breakdown     (speed|completion block)
  const sections: SectionOutput[] = await Promise.all([
    reportingActivities.renderWeeklySummarySection({
      request: { sectionNumber: 1, audience: AUDIENCE, focusPoint, metricsOutput },
      config,
    }),
    reportingActivities.renderSankeyChartSection({
      request: { sectionNumber: 2, sankeyOutput },
      config,
    }),
    llmActivities.renderWhatILearnedSection({
      request: { sectionNumber: 3, feedbackSamples: metricsOutput.feedbackSamples, reportingPeriod },
      config,
    }),
    reportingActivities.renderTrendSection({
      request: { sectionNumber: 4, audience: AUDIENCE, focusPoint, trendOutput },
      config,
    }),
    reportingActivities.renderCounselorBreakdownSection({
      request: { sectionNumber: 5, audience: AUDIENCE, focusPoint, snapshotOutput },
      config,
    }),
  ]);

  // ── Step 6: Persist + deliver ──────────────────────────────────
  const persist = await reportingActivities.persistReport({
    request: {
      tenantId, crmType, focusPoint, audience: AUDIENCE,
      templateVersion: TEMPLATE_VERSION,
      reportingPeriod, scopeKey, region,
      sections,
    },
    config,
  });

  const delivery = await reportingActivities.sendReportEmail({
    request: {
      reportId: persist.reportId, recipients,
      audience: AUDIENCE, focusPoint, reportingPeriod, sections,
    },
    config,
  });

  wf.log.info('Manager report delivered', {
    reportId: persist.reportId, mailgunMessageId: delivery.mailgunMessageId,
  });
  return { success: true, reportId: persist.reportId };
}
```

### `generateWeeklyGlobalEmailWorkflow` (Parent — global audience)

Audience: organization-wide stakeholders. Scope key = literal `'global'`.
Sections: org-wide weekly summary, sankey, what-I-learned, trend, performance ranking.

```typescript
// src/worker/allWorkflow/reporting/generateWeeklyGlobalEmail.workflow.ts

import * as wf from '@temporalio/workflow';
import type { WeeklyGlobalEmailInput } from './interfaces/weeklyGlobalEmailInput';
import type { SectionOutput } from './interfaces/sectionOutput';
import type { SankeyProgressionOutput } from './interfaces/sankeyProgression';
import type { GlobalRankingOutput } from './interfaces/globalRanking';
import type { TrendComparisonOutput } from './interfaces/trendComparison';
import {
  TEMPLATE_VERSION, reportingActivities, llmActivities,
  startMetricsChild, startSankeyChild, startGlobalRankingChild,
} from './shared/reportOrchestration';

const AUDIENCE = 'global' as const;
const GLOBAL_SCOPE_KEY = 'global';

export async function generateWeeklyGlobalEmailWorkflow({
  request,
  config,
}: {
  request: WeeklyGlobalEmailInput;
  config: any;
}): Promise<{ success: boolean; reportId: string }> {
  const { tenantId, crmType, focusPoint, reportingPeriod, recipients } = request;

  // ── Step 1: Idempotency check ──────────────────────────────────
  const idem = await reportingActivities.checkIdempotency({
    request: {
      tenantId, crmType, focusPoint, audience: AUDIENCE,
      reportingPeriod, scopeKey: GLOBAL_SCOPE_KEY,
    },
    config,
  });
  if (idem.exists) {
    wf.log.info('Global report already exists', { reportId: idem.reportId });
    return { success: true, reportId: idem.reportId! };
  }

  // ── Step 2: CRM-specific data processing (parallel) ────────────
  const dataInput = { request, config };
  const [metricsOutput, sankeyOutput, rankingOutput] = await Promise.all([
    startMetricsChild(crmType, focusPoint, dataInput) as Promise<any>,
    startSankeyChild(crmType, dataInput) as Promise<SankeyProgressionOutput>,
    startGlobalRankingChild(crmType, dataInput) as Promise<GlobalRankingOutput>,
  ]);

  // ── Step 3: Compile — writes the 'global' row (org-wide totals) ─
  // Per-region / per-community / per-user rows are authored by their own
  // manager/user report runs; this workflow only writes the 'global' row.
  await reportingActivities.compileWeeklyTaskReport({
    request: {
      tenantId, crmType, focusPoint,
      reportingPeriod,
      aggregationLevel: 'global',
      scopeKey: GLOBAL_SCOPE_KEY,
      metricsOutput,
      sankeyTextInput: sankeyOutput.sankeyTextInput,
    },
    config,
  });

  // ── Step 4: Trend reads the 'global' row from the compiled table ─
  const trendOutput: TrendComparisonOutput = await reportingActivities.queryCompiledTrend({
    request: {
      tenantId, crmType, focusPoint,
      aggregationLevel: 'global',
      scopeKey: GLOBAL_SCOPE_KEY,
      reportingPeriod,
      trailingWeeks: request.trailingWeeks,
    },
    config,
  });

  // ── Step 5: Section generation ─────────────────────────────────
  // Template v1 slot assignments (global audience):
  //   section1 = Weekly Summary           (speed|completion block, org-wide)
  //   section2 = Sankey Chart
  //   section3 = What I Learned
  //   section4 = 3-Week Trend             (speed|completion block, org-wide)
  //   section5 = Performance Ranking      (speed|completion block)
  const sections: SectionOutput[] = await Promise.all([
    reportingActivities.renderWeeklySummarySection({
      request: { sectionNumber: 1, audience: AUDIENCE, focusPoint, metricsOutput },
      config,
    }),
    reportingActivities.renderSankeyChartSection({
      request: { sectionNumber: 2, sankeyOutput },
      config,
    }),
    llmActivities.renderWhatILearnedSection({
      request: { sectionNumber: 3, feedbackSamples: metricsOutput.feedbackSamples, reportingPeriod },
      config,
    }),
    reportingActivities.renderTrendSection({
      request: { sectionNumber: 4, audience: AUDIENCE, focusPoint, trendOutput },
      config,
    }),
    reportingActivities.renderPerformanceRankingSection({
      request: { sectionNumber: 5, audience: AUDIENCE, focusPoint, rankingOutput },
      config,
    }),
  ]);

  // ── Step 6: Persist + deliver ──────────────────────────────────
  const persist = await reportingActivities.persistReport({
    request: {
      tenantId, crmType, focusPoint, audience: AUDIENCE,
      templateVersion: TEMPLATE_VERSION,
      reportingPeriod, scopeKey: GLOBAL_SCOPE_KEY,
      sections,
    },
    config,
  });

  const delivery = await reportingActivities.sendReportEmail({
    request: {
      reportId: persist.reportId, recipients,
      audience: AUDIENCE, focusPoint, reportingPeriod, sections,
    },
    config,
  });

  wf.log.info('Global report delivered', {
    reportId: persist.reportId, mailgunMessageId: delivery.mailgunMessageId,
  });
  return { success: true, reportId: persist.reportId };
}
```

### Ingestion Parent Workflows — TBD

`ingestSfCrmDataV1Workflow` and `ingestWmCrmDataV1Workflow` will live under `allWorkflow/ingestion/`. Their internals (extraction, normalization, write into the raw CRM tables owned by `database-services-l1`) are out of scope for Mark 1's reporting docs and will be specified when the raw-table schemas are finalized. Their Nexus entry points and workflow IDs are still reserved so downstream callers can target them without a rename when they land.

### `SfCompletionDataWorkflow` (Child)

```typescript
// src/worker/allWorkflow/reporting/salesforce/sfCompletionData.workflow.ts

import * as wf from '@temporalio/workflow';

const dataActivities = wf.proxyActivities<{
  querySfTaskCompletionMetrics(args: { request: any; config: any }): Promise<any>;
}>({
  startToCloseTimeout: '2 minutes',
  retry: { maximumAttempts: 3 },
  taskQueue: 'customer-reporting',
});

export async function sfCompletionDataWorkflow({
  request,
  config,
}: {
  request: any;
  config: any;
}): Promise<any> {
  const result = await dataActivities.querySfTaskCompletionMetrics({
    request: {
      tenantId: request.tenantId,
      memoryInstanceId: request.memoryInstanceId,
      reportingPeriod: request.reportingPeriod,
      agentUserIds: request.agentUserIds,
      region: request.region,
      counselorId: request.counselorId,
      normalizationCeiling: request.normalizationCeiling,
    },
    config,
  });

  if (result.totalAssigned === 0) {
    throw wf.ApplicationFailure.nonRetryable(
      'No task data found for the reporting period',
      'NO_DATA',
    );
  }

  return result;
}
```

### `SfSankeyProgressionDataWorkflow` (Child)

```typescript
// src/worker/allWorkflow/reporting/salesforce/sfSankeyProgressionData.workflow.ts

import * as wf from '@temporalio/workflow';

const dataActivities = wf.proxyActivities<{
  querySfSankeyProgression(args: { request: any; config: any }): Promise<any>;
}>({
  startToCloseTimeout: '3 minutes',
  retry: { maximumAttempts: 3 },
  taskQueue: 'customer-reporting',
});

export async function sfSankeyProgressionDataWorkflow({
  request,
  config,
}: {
  request: any;
  config: any;
}): Promise<any> {
  return dataActivities.querySfSankeyProgression({
    request: {
      tenantId: request.tenantId,
      memoryInstanceId: request.memoryInstanceId,
      agentUserIds: request.agentUserIds,
      region: request.region,
      counselorId: request.counselorId,
      sankeyConfig: request.sankeyConfig,
    },
    config,
  });
}
```

### `SfCounselorSnapshotWorkflow` (Child)

Same shape as `SfCompletionDataWorkflow` — wraps `querySfCounselorSnapshot`, returns `CounselorSnapshotOutput` (per-counselor rows + per-community aggregates). Used only by the manager parent.

### `SfGlobalRankingWorkflow` (Child — new in v0.4)

```typescript
// src/worker/allWorkflow/reporting/salesforce/sfGlobalRanking.workflow.ts

import * as wf from '@temporalio/workflow';

const dataActivities = wf.proxyActivities<{
  querySfGlobalRanking(args: { request: any; config: any }): Promise<any>;
}>({
  startToCloseTimeout: '3 minutes',
  retry: { maximumAttempts: 3 },
  taskQueue: 'customer-reporting',
});

export async function sfGlobalRankingWorkflow({
  request,
  config,
}: {
  request: any;
  config: any;
}): Promise<any> {
  return dataActivities.querySfGlobalRanking({
    request: {
      tenantId: request.tenantId,
      memoryInstanceId: request.memoryInstanceId,
      agentUserIds: request.agentUserIds,
      reportingPeriod: request.reportingPeriod,
      focusPoint: request.focusPoint,
      rankingDepth: request.rankingDepth ?? 5,
      normalizationCeiling: request.normalizationCeiling,
    },
    config,
  });
}
```

### `SfSpeedDataWorkflow`

Same pattern as `SfCompletionDataWorkflow` but calls `querySfTaskSpeedMetrics` instead.

### Trend — No Child Workflow

In v0.4 the trend step is a single activity call (`queryCompiledTrend`) invoked directly from the parent. It reads from `ob1_memory_weekly_task_reports_v1`, so it is CRM-agnostic and no longer needs an SF-specific child workflow. The old `SfTrendComparisonWorkflow` is removed; `trendComparison.workflow.ts` remains only as a thin wrapper if we later want retry isolation, but is unreferenced by default.

## Activity Implementations

### `checkIdempotency`

```typescript
// src/worker/allActivity/reporting/checkIdempotency.activity.ts

export async function checkIdempotency({
  request,
  config,
}: {
  request: {
    tenantId: string;
    crmType: string;
    focusPoint: string;
    audience: 'user' | 'manager' | 'global';
    reportingPeriod: { startDate: string; endDate: string };
    scopeKey: string;
  };
  config: any;
}): Promise<{ exists: boolean; reportId?: string }> {
  const dataSource = getCustomerMemoryDataSource();
  const repo = dataSource.getRepository(OB1MemoryReportGeneratedV1);

  const existing = await repo.findOne({
    where: {
      tenantId: request.tenantId,
      crmType: request.crmType,
      focusPoint: request.focusPoint,
      audience: request.audience,
      reportingPeriodStart: request.reportingPeriod.startDate,
      reportingPeriodEnd: request.reportingPeriod.endDate,
      scopeKey: request.scopeKey,
      deliveredAt: Not(IsNull()),
    },
  });

  if (existing) {
    return { exists: true, reportId: existing.id };
  }
  return { exists: false };
}
```

### `compileWeeklyTaskReport` (new in v0.4)

Writes rows into `ob1_memory_weekly_task_reports_v1` using upsert on the unique constraint `(tenantId, crmType, focusPoint, reportingPeriodStart, reportingPeriodEnd, aggregationLevel, scopeKey)`. Depending on the caller, one invocation may write one row (user or global audience) or several rows (manager audience: one region row + N community rows).

```typescript
// src/worker/allActivity/reporting/compile/compileWeeklyTaskReport.activity.ts

export async function compileWeeklyTaskReport({
  request,
  config,
}: {
  request: {
    tenantId: string;
    crmType: string;
    focusPoint: 'completion' | 'speed';
    reportingPeriod: { startDate: string; endDate: string };
    aggregationLevel: 'user' | 'community' | 'region' | 'global';
    scopeKey: string;
    userId?: string;
    region?: string;
    metricsOutput: any;            // CompletionMetricsOutput | SpeedMetricsOutput
    sankeyTextInput?: string;
    communityAggregates?: Array<{
      communityId: string;
      communityName: string;
      weekAssigned: number;
      weekCompleted: number;
      focusPointRate: number;
    }>;
  };
  config: any;
}): Promise<{ compiledRowIds: string[] }> {
  const dataSource = getCustomerMemoryDataSource();
  const repo = dataSource.getRepository(OB1MemoryWeeklyTaskReportsV1);

  const rows: Partial<OB1MemoryWeeklyTaskReportsV1>[] = [];

  // Primary row (the aggregation level the caller is reporting for)
  rows.push({
    tenantId: request.tenantId,
    crmType: request.crmType,
    focusPoint: request.focusPoint,
    reportingPeriodStart: new Date(request.reportingPeriod.startDate),
    reportingPeriodEnd: new Date(request.reportingPeriod.endDate),
    aggregationLevel: request.aggregationLevel,
    scopeKey: request.scopeKey,
    userId: request.userId ?? null,
    region: request.region ?? null,
    totalAssigned: request.metricsOutput.totalAssigned,
    totalCompleted: request.metricsOutput.totalCompleted,
    totalOpen: request.metricsOutput.totalOpen,
    effectiveAssigned: request.metricsOutput.effectiveAssigned,
    extraAssigned: request.metricsOutput.extraAssigned,
    completionRate: request.metricsOutput.completionRate ?? null,
    sameDayRate: request.metricsOutput.sameDayRate ?? null,
    nextDayRate: request.metricsOutput.nextDayRate ?? null,
    sankeyTextInput: request.sankeyTextInput ?? null,
    feedbackSamples: request.metricsOutput.feedbackSamples ?? null,
  });

  // Manager call also stamps per-community rows so later user/region trend
  // queries can pull community-level context without re-querying raw CRM.
  if (request.communityAggregates?.length) {
    for (const c of request.communityAggregates) {
      rows.push({
        tenantId: request.tenantId,
        crmType: request.crmType,
        focusPoint: request.focusPoint,
        reportingPeriodStart: new Date(request.reportingPeriod.startDate),
        reportingPeriodEnd: new Date(request.reportingPeriod.endDate),
        aggregationLevel: 'community',
        scopeKey: c.communityId,
        communityId: c.communityId,
        region: request.region ?? null,
        totalAssigned: c.weekAssigned,
        totalCompleted: c.weekCompleted,
        totalOpen: c.weekAssigned - c.weekCompleted,
        effectiveAssigned: c.weekAssigned,
        extraAssigned: 0,
        completionRate: request.focusPoint === 'completion' ? c.focusPointRate : null,
        sameDayRate: request.focusPoint === 'speed' ? c.focusPointRate : null,
      });
    }
  }

  // Upsert on the unique constraint — re-running the parent rewrites the row.
  const saved = await repo
    .createQueryBuilder()
    .insert()
    .values(rows)
    .orUpdate(
      [
        'total_assigned', 'total_completed', 'total_open',
        'effective_assigned', 'extra_assigned',
        'completion_rate', 'same_day_rate', 'next_day_rate',
        'sankey_text_input', 'feedback_samples',
      ],
      'uq_wtr_tenant_crm_focus_period_level_scope',
    )
    .returning(['id'])
    .execute();

  return { compiledRowIds: (saved.raw as Array<{ id: string }>).map(r => r.id) };
}
```

### `queryCompiledTrend` (new in v0.4 — replaces live CRM trend query)

CRM-agnostic. Reads the compiled table for the caller's `(crmType, focusPoint, aggregationLevel, scopeKey)` across the trailing N weeks.

```typescript
// src/worker/allActivity/reporting/trend/queryCompiledTrend.activity.ts

export async function queryCompiledTrend({
  request,
  config,
}: {
  request: {
    tenantId: string;
    crmType: string;
    focusPoint: 'completion' | 'speed';
    aggregationLevel: 'user' | 'community' | 'region' | 'global';
    scopeKey: string;
    reportingPeriod: { startDate: string; endDate: string };
    trailingWeeks: number;
  };
  config: any;
}): Promise<TrendComparisonOutput> {
  const dataSource = getCustomerMemoryDataSource();
  const repo = dataSource.getRepository(OB1MemoryWeeklyTaskReportsV1);

  const anchorEnd = new Date(request.reportingPeriod.endDate + 'T23:59:59Z');
  const windowStart = new Date(
    anchorEnd.getTime() - (request.trailingWeeks * 7 - 1) * 86_400_000,
  );

  const rows = await repo.createQueryBuilder('w')
    .where('w.tenantId = :tenantId', { tenantId: request.tenantId })
    .andWhere('w.crmType = :crmType', { crmType: request.crmType })
    .andWhere('w.focusPoint = :focusPoint', { focusPoint: request.focusPoint })
    .andWhere('w.aggregationLevel = :level', { level: request.aggregationLevel })
    .andWhere('w.scopeKey = :scopeKey', { scopeKey: request.scopeKey })
    .andWhere('w.reportingPeriodEnd >= :windowStart', { windowStart })
    .andWhere('w.reportingPeriodEnd <= :anchorEnd', { anchorEnd })
    .orderBy('w.reportingPeriodEnd', 'ASC')
    .getMany();

  const weeklyBuckets: WeeklyBucket[] = rows.map(r => {
    const rate = request.focusPoint === 'completion'
      ? (r.completionRate ?? NaN)
      : (r.sameDayRate ?? NaN);
    const label = `Week of ${r.reportingPeriodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const displayCounts = r.extraAssigned > 0
      ? `${r.totalCompleted}/${r.effectiveAssigned} (+${r.extraAssigned})`
      : `${r.totalCompleted}/${r.effectiveAssigned}`;
    return {
      label,
      assigned: r.totalAssigned,
      completed: r.totalCompleted,
      open: r.totalOpen,
      effectiveAssigned: r.effectiveAssigned,
      extraAssigned: r.extraAssigned,
      focusPointRate: rate,
      displayCounts,
    };
  });

  const { previous, current } = computeOverlapWindows(weeklyBuckets);
  const previousWindowAvg = safeMean(previous.map(w => w.focusPointRate));
  const currentWindowAvg = safeMean(current.map(w => w.focusPointRate));
  const deltaPp = (isNaN(previousWindowAvg) || isNaN(currentWindowAvg))
    ? NaN
    : (currentWindowAvg - previousWindowAvg) * 100;

  let trendDirection: 'up' | 'down' | 'flat' | 'insufficient';
  if (isNaN(deltaPp)) trendDirection = 'insufficient';
  else if (deltaPp >= 0.5) trendDirection = 'up';
  else if (deltaPp <= -0.5) trendDirection = 'down';
  else trendDirection = 'flat';

  return { weeklyBuckets, previousWindowAvg, currentWindowAvg, deltaPp, trendDirection };
}
```

> `computeOverlapWindows` and `safeMean` are small pure helpers for picking the previous/current overlapping windows from the weekly bucket list and computing a NaN-tolerant mean; in v0.4 they live in `src/ab-shared/utils/trend/trendWindowing.ts` and are shared by the compiled-trend activity (and any future trend backfill job).

### `querySfTaskCompletionMetrics`

```typescript
// src/worker/allActivity/reporting/data/querySfTaskCompletionMetrics.activity.ts

export async function querySfTaskCompletionMetrics({
  request,
  config,
}: {
  request: {
    tenantId: string;
    memoryInstanceId: string;
    reportingPeriod: { startDate: string; endDate: string };
    agentUserIds: string[];
    region?: string;
    counselorId?: string;
    normalizationCeiling?: number;
  };
  config: any;
}): Promise<CompletionMetricsOutput> {
  const dataSource = getCustomerMemoryDataSource();
  const repo = dataSource.getRepository(OB1MemoryStructuredSfTaskV1);

  // Build query: agent-created tasks in the reporting period
  const qb = repo.createQueryBuilder('t')
    .where('t.tenantId = :tenantId', { tenantId: request.tenantId })
    .andWhere('t.memoryInstanceId = :instanceId', { instanceId: request.memoryInstanceId })
    .andWhere('t.sfTaskCreatedById IN (:...agentIds)', { agentIds: request.agentUserIds })
    .andWhere('t.taskCreatedAt >= :start', { start: request.reportingPeriod.startDate })
    .andWhere('t.taskCreatedAt <= :end', { end: request.reportingPeriod.endDate });

  if (request.region) {
    qb.andWhere('t.region = :region', { region: request.region });
  }
  if (request.counselorId) {
    qb.andWhere('t.sfSalesCounselorId = :counselorId', { counselorId: request.counselorId });
  }

  const tasks = await qb.getMany();

  const totalAssigned = tasks.length;
  const totalCompleted = tasks.filter(t => isTaskCompleted(t.taskStatus)).length;
  const totalOpen = totalAssigned - totalCompleted;

  // Apply normalization ceiling per counselor
  const { effectiveAssigned, extraAssigned } = applyNormalizationCeiling(
    tasks,
    request.normalizationCeiling,
  );

  const completionRate = effectiveAssigned > 0
    ? totalCompleted / effectiveAssigned
    : NaN;

  // Collect feedback samples
  const feedbackSamples = tasks
    .map(t => t.counselorFeedbackToAgent)
    .filter((f): f is string => f != null && f.trim().length > 0);

  return {
    totalAssigned,
    totalCompleted,
    totalOpen,
    completionRate,
    effectiveAssigned,
    extraAssigned,
    feedbackSamples,
  };
}

function isTaskCompleted(status: string): boolean {
  const s = status?.toLowerCase().trim();
  return s === 'completed' || s === 'true';
}

function applyNormalizationCeiling(
  tasks: OB1MemoryStructuredSfTaskV1[],
  ceiling: number | undefined,
): { effectiveAssigned: number; extraAssigned: number } {
  const total = tasks.length;
  if (!ceiling || ceiling <= 0 || total === 0) {
    return { effectiveAssigned: total, extraAssigned: 0 };
  }

  // Group by counselor, cap each at ceiling
  const byCouns: Record<string, number> = {};
  for (const t of tasks) {
    const key = t.sfSalesCounselorId ?? 'unknown';
    byCouns[key] = (byCouns[key] ?? 0) + 1;
  }

  let effective = 0;
  let extra = 0;
  for (const count of Object.values(byCouns)) {
    effective += Math.min(count, ceiling);
    extra += Math.max(count - ceiling, 0);
  }
  return { effectiveAssigned: effective, extraAssigned: extra };
}
```

### `querySfSankeyProgression`

This is the most complex activity. It implements the full Sankey stage classification algorithm from the HLD.

```typescript
// src/worker/allActivity/reporting/data/querySfSankeyProgression.activity.ts

export async function querySfSankeyProgression({
  request,
  config,
}: {
  request: {
    tenantId: string;
    memoryInstanceId: string;
    agentUserIds: string[];
    region?: string;
    counselorId?: string;
    sankeyConfig: SankeyStageConfig;
  };
  config: any;
}): Promise<SankeyProgressionOutput> {
  const dataSource = getCustomerMemoryDataSource();
  const repo = dataSource.getRepository(OB1MemoryStructuredSfTaskV1);
  const cfg = request.sankeyConfig;

  // ── Fetch all records for this memory instance ─────────────────
  const qb = repo.createQueryBuilder('t')
    .where('t.tenantId = :tenantId', { tenantId: request.tenantId })
    .andWhere('t.memoryInstanceId = :instanceId', { instanceId: request.memoryInstanceId })
    .orderBy('t.taskCreatedAt', 'ASC');

  if (request.region) {
    qb.andWhere('t.region = :region', { region: request.region });
  }
  if (request.counselorId) {
    qb.andWhere('t.sfSalesCounselorId = :counselorId', { counselorId: request.counselorId });
  }

  const allRecords = await qb.getMany();

  // ── Partition: agent-created tasks vs activity trail ────────────
  const agentIdSet = new Set(request.agentUserIds.map(id => id.toLowerCase()));

  const agentTasks: Map<string, OB1MemoryStructuredSfTaskV1[]> = new Map(); // accountId → tasks
  const trailRecords: Map<string, OB1MemoryStructuredSfTaskV1[]> = new Map(); // accountId → trail

  for (const rec of allRecords) {
    const accountId = rec.sfAccountId;
    if (!accountId) continue;

    const isAgentCreated = rec.sfTaskCreatedById
      && agentIdSet.has(rec.sfTaskCreatedById.toLowerCase());

    if (isAgentCreated) {
      if (!agentTasks.has(accountId)) agentTasks.set(accountId, []);
      agentTasks.get(accountId)!.push(rec);
    } else {
      if (!trailRecords.has(accountId)) trailRecords.set(accountId, []);
      trailRecords.get(accountId)!.push(rec);
    }
  }

  // ── Account-level dedup: latest agent task per account ─────────
  const accountLatestTask: Map<string, OB1MemoryStructuredSfTaskV1> = new Map();
  for (const [accountId, tasks] of agentTasks) {
    const sorted = tasks.sort((a, b) => {
      const da = a.taskCreatedAt?.getTime() ?? 0;
      const db = b.taskCreatedAt?.getTime() ?? 0;
      return da - db || a.sfTaskId.localeCompare(b.sfTaskId);
    });
    accountLatestTask.set(accountId, sorted[sorted.length - 1]);
  }

  // ── Determine pending vs completed ─────────────────────────────
  const accountStatus: Map<string, 'pending' | 'completed'> = new Map();
  let completedByOverride = 0;

  for (const [accountId, latestTask] of accountLatestTask) {
    const isClosed = isTaskCompleted(latestTask.taskStatus);

    if (isClosed) {
      accountStatus.set(accountId, 'completed');
      continue;
    }

    // Check activity trail override
    const trail = trailRecords.get(accountId) ?? [];
    const validTrailCount = trail.filter(r => isValidActivityForOverride(r)).length;

    if (validTrailCount >= cfg.openTaskActivityOverrideMinRows) {
      accountStatus.set(accountId, 'completed');
      completedByOverride++;
    } else {
      accountStatus.set(accountId, 'pending');
    }
  }

  const totalPicked = accountStatus.size;
  const totalPending = [...accountStatus.values()].filter(s => s === 'pending').length;
  const totalCompleted = [...accountStatus.values()].filter(s => s === 'completed').length;

  // ── Stage classification for completed accounts ────────────────
  const stage2Counts: Record<string, number> = {};
  const finalEdgesFlat: Map<string, Map<string, number>> = new Map();
  // channel -> finalStage -> count

  for (const [accountId, status] of accountStatus) {
    if (status !== 'completed') continue;

    const trail = (trailRecords.get(accountId) ?? []).sort((a, b) => {
      const da = a.taskCreatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = b.taskCreatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });

    // Classify channel and final stage
    const { channelStage, finalStage, sawScheduled } =
      classifyAccountProgression(trail, cfg);

    // Determine stage-2 assignment
    let stage2: string;
    if (channelStage) {
      stage2 = channelStage;
    } else if (sawScheduled) {
      stage2 = cfg.notConnectedFollowOnName;
    } else {
      stage2 = cfg.notConnectedNoFollowName;
    }

    stage2Counts[stage2] = (stage2Counts[stage2] ?? 0) + 1;

    // Track final edges for connected accounts
    if (channelStage && finalStage) {
      if (!finalEdgesFlat.has(channelStage)) finalEdgesFlat.set(channelStage, new Map());
      const channelMap = finalEdgesFlat.get(channelStage)!;
      channelMap.set(finalStage, (channelMap.get(finalStage) ?? 0) + 1);
    }
  }

  // ── Build Sankey text and transition edges ─────────────────────
  const edges: StageTransition[] = [];
  const lines: string[] = [];

  const addEdge = (from: string, to: string, count: number) => {
    if (count > 0) {
      edges.push({ from, to, count });
      lines.push(`${from} [${count}] ${to}`);
    }
  };

  // Level 1: Root → Pending/Completed
  addEdge(cfg.rootNodeName, cfg.pendingNodeName, totalPending);
  addEdge(cfg.rootNodeName, cfg.completedNodeName, totalCompleted);

  // Level 2: Completed → Stage-2 breakdown
  const notConnNoFollow = stage2Counts[cfg.notConnectedNoFollowName] ?? 0;
  const notConnFollowOn = stage2Counts[cfg.notConnectedFollowOnName] ?? 0;
  addEdge(cfg.completedNodeName, cfg.notConnectedNoFollowName, notConnNoFollow);
  addEdge(cfg.completedNodeName, cfg.notConnectedFollowOnName, notConnFollowOn);

  // Calculate connected total
  let connectedTotal = 0;
  for (const ch of cfg.channels) {
    connectedTotal += stage2Counts[ch.name] ?? 0;
  }
  addEdge(cfg.completedNodeName, cfg.connectedNodeName, connectedTotal);

  // Level 3: Connected → Channels
  for (const ch of cfg.channels) {
    addEdge(cfg.connectedNodeName, ch.name, stage2Counts[ch.name] ?? 0);
  }

  // Level 4: Channels → In-Progress
  for (const ch of cfg.channels) {
    const channelFinals = finalEdgesFlat.get(ch.name);
    const inProgressCount = channelFinals
      ? [...channelFinals.values()].reduce((a, b) => a + b, 0)
      : 0;
    addEdge(ch.name, cfg.inProgressNodeName, inProgressCount);
  }

  // Level 5: In-Progress → Final stages
  const allFinalStageNames = [
    ...cfg.topicFinals.map(f => f.stageName),
    ...cfg.resultOnlyFinals.map(f => f.stageName),
  ];
  for (const fs of allFinalStageNames) {
    let total = 0;
    for (const channelMap of finalEdgesFlat.values()) {
      total += channelMap.get(fs) ?? 0;
    }
    addEdge(cfg.inProgressNodeName, fs, total);
  }

  return {
    stageTransitions: edges,
    sankeyTextInput: lines.join('\n'),
    accountTotals: {
      picked: totalPicked,
      pending: totalPending,
      completed: totalCompleted,
      completedByOverride,
    },
    debugCounts: { ...stage2Counts },
  };
}
```

#### Stage Classification Helper

```typescript
function classifyAccountProgression(
  trail: OB1MemoryStructuredSfTaskV1[],
  cfg: SankeyStageConfig,
): {
  channelStage: string | null;
  finalStage: string | null;
  sawScheduled: boolean;
} {
  let firstChannel: string | null = null;
  let sawScheduled = false;

  let latestTopicSignalSeq = -1;
  let latestTopicFinal: string | null = null;
  let latestResultOnlySeq = -1;
  let latestResultOnlyStage: string | null = null;

  for (let seq = 0; seq < trail.length; seq++) {
    const rec = trail[seq];
    const subjectL = (rec.taskSubject ?? '').toLowerCase().trim();
    const outcomeL = (rec.activityOutcome ?? '').toLowerCase().trim();        // Task_WrapUp
    const outcomeDetailL = (rec.activityOutcomeDetail ?? '').toLowerCase().trim(); // Result
    const topicL = ((rec.sfCustomAttribute as any)?.topic ?? '').toLowerCase().trim();
    const apptL = ((rec.sfCustomAttribute as any)?.apptWrapUp ?? '').toLowerCase().trim();
    const sourceL = ((rec.sfCustomAttribute as any)?.activitySource ?? '').toLowerCase().trim();

    // Scheduled detection
    if (isScheduled(subjectL, outcomeDetailL)) {
      sawScheduled = true;
    }

    // Channel detection (stage 2): first non-scheduled
    if (firstChannel === null && !isScheduled(subjectL, outcomeDetailL)) {
      const channel = detectChannel(sourceL, subjectL, outcomeL, topicL, apptL, cfg);
      if (channel) {
        firstChannel = channel;
      }
    }

    // Topic/Appt final stage tracking
    if (topicL || apptL) {
      latestTopicSignalSeq = seq;
    }
    const topicFinal = classifyTopicApptFinal(topicL, apptL, cfg);
    if (topicFinal) {
      latestTopicFinal = topicFinal;
      latestTopicSignalSeq = Math.max(latestTopicSignalSeq, seq);
    }

    // Result-only final stage tracking
    const resultOnly = classifyResultOnlyFinal(outcomeDetailL, cfg);
    if (resultOnly) {
      latestResultOnlySeq = seq;
      latestResultOnlyStage = resultOnly;
    }
  }

  // Final stage precedence: topic/appt > result-only (by sequence)
  let finalStage: string | null = null;
  if (latestResultOnlyStage === null) {
    finalStage = latestTopicFinal;
  } else if (latestTopicSignalSeq > latestResultOnlySeq) {
    finalStage = latestTopicFinal;
  } else if (latestTopicSignalSeq === latestResultOnlySeq) {
    finalStage = latestTopicFinal ?? latestResultOnlyStage;
  } else {
    finalStage = latestResultOnlyStage;
  }

  return { channelStage: firstChannel, finalStage, sawScheduled };
}

function detectChannel(
  sourceL: string,
  subjectL: string,
  outcomeL: string,
  topicL: string,
  apptL: string,
  cfg: SankeyStageConfig,
): string | null {
  // Face-to-face priority: event source, appointment/event subject, topic/appt presence
  if (
    sourceL === 'event'
    || subjectL.includes('appointment')
    || subjectL.includes('event')
    || topicL.length > 0
    || apptL.length > 0
  ) {
    // Find the face-to-face channel in config (or default to first channel that has
    // face-to-face semantics — typically the last one in the array)
    const faceChannel = cfg.channels.find(
      ch => ch.subjectKeywords.some(k => k === 'appointment' || k === 'event'),
    );
    return faceChannel?.name ?? cfg.channels[cfg.channels.length - 1]?.name ?? null;
  }

  // Check each configured channel
  for (const ch of cfg.channels) {
    if (ch.wrapUpValues.some(v => v === outcomeL)) {
      return ch.name;
    }
    if (ch.subjectKeywords.some(k => subjectL.includes(k))) {
      return ch.name;
    }
  }

  return null;
}

function classifyTopicApptFinal(
  topicL: string,
  apptL: string,
  cfg: SankeyStageConfig,
): string | null {
  for (const tf of cfg.topicFinals) {
    if (tf.requiresAttendance) {
      if (tf.topicValues.some(v => topicL.includes(v)) && apptL === 'attended') {
        return tf.stageName;
      }
    } else {
      if (tf.topicValues.some(v => v === topicL)) {
        return tf.stageName;
      }
    }
  }
  return null;
}

function classifyResultOnlyFinal(
  resultL: string,
  cfg: SankeyStageConfig,
): string | null {
  if (!resultL) return null;
  for (const rf of cfg.resultOnlyFinals) {
    if (rf.resultKeywords.some(k => resultL.includes(k))) {
      return rf.stageName;
    }
  }
  return null;
}

function isScheduled(subjectL: string, resultL: string): boolean {
  return (
    subjectL.includes('status=scheduled isclosed=false')
    || resultL.includes('scheduled appointment')
    || resultL.includes('scheduled event attendance')
  );
}

function isValidActivityForOverride(rec: OB1MemoryStructuredSfTaskV1): boolean {
  // Must have a task ID and at least one meaningful content signal
  if (!rec.sfTaskId) return false;
  return !!(
    rec.taskSubject?.trim()
    || rec.activityOutcome?.trim()
    || rec.activityOutcomeDetail?.trim()
    || (rec.sfCustomAttribute as any)?.topic
    || (rec.sfCustomAttribute as any)?.apptWrapUp
    || (rec.sfCustomAttribute as any)?.activitySource
  );
}
```

### `querySfGlobalRanking` (new in v0.4)

Returns best/worst performers across regions, communities, and individual users for the reporting period, plus the org-wide totals row. Called only from the global parent workflow.

```typescript
// src/worker/allActivity/reporting/data/querySfGlobalRanking.activity.ts

export async function querySfGlobalRanking({
  request,
  config,
}: {
  request: {
    tenantId: string;
    memoryInstanceId: string;
    agentUserIds: string[];
    reportingPeriod: { startDate: string; endDate: string };
    focusPoint: 'completion' | 'speed';
    rankingDepth: number;
    normalizationCeiling?: number;
  };
  config: any;
}): Promise<GlobalRankingOutput> {
  const dataSource = getCustomerMemoryDataSource();
  const repo = dataSource.getRepository(OB1MemoryStructuredSfTaskV1);

  // Org-wide agent-created tasks for the period (no region/counselor filter)
  const qb = repo.createQueryBuilder('t')
    .where('t.tenantId = :tenantId', { tenantId: request.tenantId })
    .andWhere('t.memoryInstanceId = :instanceId', { instanceId: request.memoryInstanceId })
    .andWhere('t.sfTaskCreatedById IN (:...agentIds)', { agentIds: request.agentUserIds })
    .andWhere('t.taskCreatedAt >= :start', { start: request.reportingPeriod.startDate })
    .andWhere('t.taskCreatedAt <= :end', { end: request.reportingPeriod.endDate + 'T23:59:59Z' });
  const tasks = await qb.getMany();

  // Bucket once by scope; compute focus-point rate per bucket
  const byRegion: Record<string, { assigned: number; completed: number; rateNum: number }> = {};
  const byCommunity: Record<string, { name: string; assigned: number; completed: number; rateNum: number }> = {};
  const byUser: Record<string, { name: string; assigned: number; completed: number; rateNum: number }> = {};

  const isCompleted = (t: OB1MemoryStructuredSfTaskV1) => isTaskCompleted(t.taskStatus);
  const isSameDay = (t: OB1MemoryStructuredSfTaskV1) => {
    if (!isCompleted(t)) return false;
    const c = t.taskCreatedAt?.getTime() ?? 0;
    const m = t.taskLastModifiedAt?.getTime() ?? 0;
    return (m - c) < 86_400_000;
  };

  for (const t of tasks) {
    const regionKey = t.region ?? 'unknown';
    const communityId = (t.sfCustomAttribute as any)?.communityId ?? 'unknown';
    const counselorId = t.sfSalesCounselorId ?? 'unknown';
    const counselorName = t.sfSalesCounselorName ?? counselorId;

    const bump = (
      bag: Record<string, { assigned: number; completed: number; rateNum: number; name?: string }>,
      key: string,
      name?: string,
    ) => {
      const b = bag[key] ?? { assigned: 0, completed: 0, rateNum: 0, name };
      b.assigned += 1;
      if (isCompleted(t)) b.completed += 1;
      if (request.focusPoint === 'speed' && isSameDay(t)) b.rateNum += 1;
      bag[key] = b;
    };
    bump(byRegion, regionKey);
    bump(byCommunity, communityId, (t.sfCustomAttribute as any)?.communityName ?? communityId);
    bump(byUser, counselorId, counselorName);
  }

  const toRanked = (
    bag: Record<string, { name?: string; assigned: number; completed: number; rateNum: number }>,
  ): RankedRow[] => Object.entries(bag).map(([scopeId, v]) => {
    const rate = request.focusPoint === 'completion'
      ? (v.assigned > 0 ? v.completed / v.assigned : NaN)
      : (v.assigned > 0 ? v.rateNum / v.assigned : NaN);
    return {
      scopeId,
      scopeName: v.name ?? scopeId,
      focusPointRate: rate,
      weekAssigned: v.assigned,
      weekCompleted: v.completed,
    };
  }).filter(r => !isNaN(r.focusPointRate));

  const sortDesc = (a: RankedRow, b: RankedRow) => b.focusPointRate - a.focusPointRate;
  const sortAsc = (a: RankedRow, b: RankedRow) => a.focusPointRate - b.focusPointRate;
  const N = request.rankingDepth;

  const regionsRanked = toRanked(byRegion);
  const communitiesRanked = toRanked(byCommunity);
  const usersRanked = toRanked(byUser);

  // Org-wide totals
  const orgAssigned = tasks.length;
  const orgCompleted = tasks.filter(isCompleted).length;
  const orgRate = request.focusPoint === 'completion'
    ? (orgAssigned > 0 ? orgCompleted / orgAssigned : NaN)
    : (orgAssigned > 0 ? tasks.filter(isSameDay).length / orgAssigned : NaN);

  return {
    period: request.reportingPeriod,
    bestRegions: [...regionsRanked].sort(sortDesc).slice(0, N),
    worstRegions: [...regionsRanked].sort(sortAsc).slice(0, N),
    bestCommunities: [...communitiesRanked].sort(sortDesc).slice(0, N),
    worstCommunities: [...communitiesRanked].sort(sortAsc).slice(0, N),
    bestUsers: [...usersRanked].sort(sortDesc).slice(0, N),
    worstUsers: [...usersRanked].sort(sortAsc).slice(0, N),
    orgWide: {
      weekAssigned: orgAssigned,
      weekCompleted: orgCompleted,
      focusPointRate: orgRate,
    },
  };
}
```

> Trend computation previously lived in `querySfTrendMetrics` (a live CRM query). In v0.4 that activity is **removed**; trend is now read from `ob1_memory_weekly_task_reports_v1` by `queryCompiledTrend` (above). The old SF-specific trend helpers (`computeOverlapWindows`, `safeMean`) live in `src/ab-shared/utils/trend/trendWindowing.ts` and are shared by the compiled-trend activity.

### `querySfCounselorSnapshot`

```typescript
// src/worker/allActivity/reporting/data/querySfCounselorSnapshot.activity.ts

export async function querySfCounselorSnapshot({
  request,
  config,
}: {
  request: {
    tenantId: string;
    memoryInstanceId: string;
    agentUserIds: string[];
    reportingPeriod: { startDate: string; endDate: string };
    region?: string;
    focusPoint: 'completion' | 'speed';
  };
  config: any;
}): Promise<CounselorSnapshotOutput> {
  const dataSource = getCustomerMemoryDataSource();
  const repo = dataSource.getRepository(OB1MemoryStructuredSfTaskV1);

  // All agent-created tasks for the region (all time, for allTimeOpen)
  const allTimeQb = repo.createQueryBuilder('t')
    .where('t.tenantId = :tenantId', { tenantId: request.tenantId })
    .andWhere('t.memoryInstanceId = :instanceId', { instanceId: request.memoryInstanceId })
    .andWhere('t.sfTaskCreatedById IN (:...agentIds)', { agentIds: request.agentUserIds });

  if (request.region) {
    allTimeQb.andWhere('t.region = :region', { region: request.region });
  }

  const allTimeTasks = await allTimeQb.getMany();

  // Group by counselor
  const byCounselor: Map<string, {
    counselorName: string;
    counselorId: string;
    allTasks: OB1MemoryStructuredSfTaskV1[];
    weekTasks: OB1MemoryStructuredSfTaskV1[];
  }> = new Map();

  const periodStart = new Date(request.reportingPeriod.startDate).getTime();
  const periodEnd = new Date(request.reportingPeriod.endDate + 'T23:59:59Z').getTime();

  for (const t of allTimeTasks) {
    const cId = t.sfSalesCounselorId ?? 'unknown';
    if (!byCounselor.has(cId)) {
      byCounselor.set(cId, {
        counselorName: t.sfSalesCounselorName ?? cId,
        counselorId: cId,
        allTasks: [],
        weekTasks: [],
      });
    }
    const entry = byCounselor.get(cId)!;
    entry.allTasks.push(t);

    const created = t.taskCreatedAt?.getTime() ?? 0;
    if (created >= periodStart && created <= periodEnd) {
      entry.weekTasks.push(t);
    }
  }

  const counselors: CounselorRow[] = [];
  for (const [, data] of byCounselor) {
    const weekAssigned = data.weekTasks.length;
    const weekCompleted = data.weekTasks.filter(t => isTaskCompleted(t.taskStatus)).length;
    const weekOpen = weekAssigned - weekCompleted;
    const allTimeOpen = data.allTasks.filter(t => !isTaskCompleted(t.taskStatus)).length;

    let focusPointRate: number | undefined;
    if (request.focusPoint === 'speed' && weekAssigned > 0) {
      const sameDayCount = data.weekTasks.filter(t => {
        if (!isTaskCompleted(t.taskStatus)) return false;
        const created = t.taskCreatedAt?.getTime() ?? 0;
        const modified = t.taskLastModifiedAt?.getTime() ?? 0;
        return (modified - created) < 24 * 60 * 60 * 1000;
      }).length;
      focusPointRate = sameDayCount / weekAssigned;
    } else if (request.focusPoint === 'completion' && weekAssigned > 0) {
      focusPointRate = weekCompleted / weekAssigned;
    }

    counselors.push({
      counselorName: data.counselorName,
      counselorId: data.counselorId,
      weekAssigned,
      weekCompleted,
      weekOpen,
      allTimeOpen,
      focusPointRate,
    });
  }

  // ── Community aggregation (week only) ───────────────────────────
  // Groups the same week-window tasks by community to provide the rows the
  // compile activity stamps into `ob1_memory_weekly_task_reports_v1` at
  // aggregationLevel='community'.
  const byCommunity: Map<string, { communityName: string; weekTasks: OB1MemoryStructuredSfTaskV1[] }> = new Map();
  for (const [, data] of byCounselor) {
    for (const t of data.weekTasks) {
      const cid = (t.sfCustomAttribute as any)?.communityId ?? 'unknown';
      const cname = (t.sfCustomAttribute as any)?.communityName ?? cid;
      if (!byCommunity.has(cid)) byCommunity.set(cid, { communityName: cname, weekTasks: [] });
      byCommunity.get(cid)!.weekTasks.push(t);
    }
  }

  const communityAggregates: CommunityAggregateRow[] = [];
  for (const [communityId, c] of byCommunity) {
    const weekAssigned = c.weekTasks.length;
    const weekCompleted = c.weekTasks.filter(t => isTaskCompleted(t.taskStatus)).length;

    let focusPointRate = 0;
    if (weekAssigned > 0) {
      if (request.focusPoint === 'completion') {
        focusPointRate = weekCompleted / weekAssigned;
      } else {
        const sameDay = c.weekTasks.filter(t => {
          if (!isTaskCompleted(t.taskStatus)) return false;
          const created = t.taskCreatedAt?.getTime() ?? 0;
          const modified = t.taskLastModifiedAt?.getTime() ?? 0;
          return (modified - created) < 86_400_000;
        }).length;
        focusPointRate = sameDay / weekAssigned;
      }
    }

    communityAggregates.push({
      communityId,
      communityName: c.communityName,
      weekAssigned,
      weekCompleted,
      focusPointRate,
    });
  }

  return { counselors, communityAggregates };
}
```

### Section Render — Focus-Point HTML Block Dispatch

All numbered section renderers (except Sankey and What-I-Learned) follow a **common dispatch shape**: they receive `audience` and `focusPoint`, then pick the appropriate HTML block. The HTML differs — the metric labels, copy, and call-outs change per focus point — but the section number and the surrounding wrapper are identical across focus points.

```typescript
// Shape shared by renderWeeklySummarySection / renderTrendSection /
// renderCounselorBreakdownSection / renderPerformanceRankingSection.
//
//   pickBlock(focusPoint, { completion: () => htmlA, speed: () => htmlB })
//
// Keeps the dispatch trivial — same renderer, same slot, different copy.
function pickBlock<T>(
  focusPoint: 'completion' | 'speed',
  blocks: { completion: () => T; speed: () => T },
): T {
  return focusPoint === 'completion' ? blocks.completion() : blocks.speed();
}
```

### `renderWeeklySummarySection`

```typescript
// src/worker/allActivity/reporting/sections/renderWeeklySummarySection.activity.ts

export async function renderWeeklySummarySection({
  request,
  config,
}: {
  request: {
    sectionNumber: number;
    audience: 'user' | 'manager' | 'global';
    focusPoint: 'completion' | 'speed';
    metricsOutput: any; // CompletionMetricsOutput | SpeedMetricsOutput
  };
  config: any;
}): Promise<SectionOutput> {
  const { sectionNumber, audience, focusPoint, metricsOutput } = request;

  const html = pickBlock(focusPoint, {
    completion: () => renderCompletionSummaryHtml(audience, metricsOutput),
    speed: () => renderSpeedSummaryHtml(audience, metricsOutput),
  });

  return { sectionNumber, html, rawData: { audience, focusPoint, ...metricsOutput } };
}
```

`renderCompletionSummaryHtml` and `renderSpeedSummaryHtml` are pure string-building helpers — the completion block shows `completionRate` with `effectiveAssigned` and any `extraAssigned` ceiling call-out, the speed block shows `sameDayRate` / `nextDayRate`. Both use the `audience` value only to tune the headline copy (e.g. "Your week" vs "Your region this week" vs "Organization-wide this week") — the data shape itself does not change.

### `renderTrendSection`

```typescript
export async function renderTrendSection({
  request,
  config,
}: {
  request: {
    sectionNumber: number;
    audience: 'user' | 'manager' | 'global';
    focusPoint: 'completion' | 'speed';
    trendOutput: TrendComparisonOutput;
  };
  config: any;
}): Promise<SectionOutput> {
  const { sectionNumber, audience, focusPoint, trendOutput } = request;

  const html = pickBlock(focusPoint, {
    completion: () => renderCompletionTrendHtml(audience, trendOutput),
    speed: () => renderSpeedTrendHtml(audience, trendOutput),
  });

  return { sectionNumber, html, rawData: trendOutput };
}
```

### `renderCounselorBreakdownSection` (manager audience only)

```typescript
export async function renderCounselorBreakdownSection({
  request,
  config,
}: {
  request: {
    sectionNumber: number;
    audience: 'manager';
    focusPoint: 'completion' | 'speed';
    snapshotOutput: CounselorSnapshotOutput;
  };
  config: any;
}): Promise<SectionOutput> {
  const { sectionNumber, focusPoint, snapshotOutput } = request;

  const html = pickBlock(focusPoint, {
    completion: () => renderCompletionCounselorTableHtml(snapshotOutput),
    speed: () => renderSpeedCounselorTableHtml(snapshotOutput),
  });

  return { sectionNumber, html, rawData: snapshotOutput };
}
```

The completion block uses columns `[Counselor | Assigned | Completed | Rate]`; the speed block uses `[Counselor | Assigned | Same-day | Next-day | All-time open]`.

### `renderPerformanceRankingSection` (global audience only — new in v0.4)

```typescript
export async function renderPerformanceRankingSection({
  request,
  config,
}: {
  request: {
    sectionNumber: number;
    audience: 'global';
    focusPoint: 'completion' | 'speed';
    rankingOutput: GlobalRankingOutput;
  };
  config: any;
}): Promise<SectionOutput> {
  const { sectionNumber, focusPoint, rankingOutput } = request;

  const html = pickBlock(focusPoint, {
    completion: () => renderCompletionRankingHtml(rankingOutput),
    speed: () => renderSpeedRankingHtml(rankingOutput),
  });

  return { sectionNumber, html, rawData: rankingOutput };
}
```

Both ranking blocks render three pairs of best/worst tables (regions, communities, users) plus an org-wide summary line. The completion block emphasizes completion rate; the speed block emphasizes same-day rate.

### `renderSankeyChartSection`

```typescript
// src/worker/allActivity/reporting/sections/renderSankeyChartSection.activity.ts

import { parseSankeyInput } from '@/ab-shared/utils/sankey/sankeyParser';
import { computeSankeyLayout } from '@/ab-shared/utils/sankey/sankeyLayout';
import { renderSankeyToPng } from '@/ab-shared/utils/sankey/sankeyRenderer';

export async function renderSankeyChartSection({
  request,
  config,
}: {
  request: { sankeyOutput: SankeyProgressionOutput };
  config: any;
}): Promise<SectionOutput> {
  const { sankeyOutput } = request;

  const { sectionNumber } = request;

  if (sankeyOutput.stageTransitions.length === 0) {
    return {
      sectionNumber,
      html: '<div class="section-empty">No progression data available.</div>',
      rawData: sankeyOutput,
    };
  }

  // Parse text input → nodes + links
  const parsed = parseSankeyInput(sankeyOutput.sankeyTextInput);

  // Compute layout using d3-sankey
  const layout = computeSankeyLayout(parsed, {
    width: 900,
    height: 500,
    nodeWidth: 15,
    nodePadding: 10,
  });

  // Render to PNG buffer
  const pngBuffer = renderSankeyToPng(layout, { width: 900, height: 500 });

  // Base64 encode
  const base64 = pngBuffer.toString('base64');
  const imgTag = `<img src="data:image/png;base64,${base64}" alt="Prospect Progression Chart" style="max-width:100%; height:auto;" />`;

  return {
    sectionNumber,
    html: `<div class="sankey-chart-section">${imgTag}</div>`,
    rawData: sankeyOutput,
  };
}
```

### `renderWhatILearnedSection`

```typescript
// src/worker/allActivity/reporting/sections/renderWhatILearnedSection.activity.ts

export async function renderWhatILearnedSection({
  request,
  config,
}: {
  request: {
    sectionNumber: number;
    feedbackSamples: string[];
    reportingPeriod: { startDate: string; endDate: string };
  };
  config: any;
}): Promise<SectionOutput> {
  const { sectionNumber } = request;

  if (request.feedbackSamples.length === 0) {
    return {
      sectionNumber,
      html: '<div class="section-empty">No counselor feedback was recorded this period.</div>',
      rawData: { feedbackSamples: [], promptVersion: null },
    };
  }

  // Call existing executeConsultantPrompt with reporting-specific prompt
  // The prompt is stored in the prompt management system under a known prompt ID.
  // The activity inherits the prompt execution pattern from Worker-1.
  const promptInput = {
    feedbackEntries: request.feedbackSamples,
    periodStart: request.reportingPeriod.startDate,
    periodEnd: request.reportingPeriod.endDate,
  };

  // executeConsultantPrompt is a shared activity already available on the task queue
  const narrative = await executeConsultantPrompt({
    promptId: 'customer-reporting-what-i-learned-v1',
    variables: promptInput,
    config,
  });

  return {
    sectionNumber,
    html: `<div class="what-i-learned-section"><p>${escapeHtml(narrative.text)}</p></div>`,
    rawData: {
      feedbackSamples: request.feedbackSamples,
      promptVersion: narrative.promptVersion,
      generatedText: narrative.text,
    },
  };
}
```

### `sendReportEmail`

```typescript
// src/worker/allActivity/reporting/sendReportEmail.activity.ts

import Mailgun from 'mailgun.js';

export async function sendReportEmail({
  request,
  config,
}: {
  request: {
    reportId: string;
    recipients: string[];
    focusPoint: string;
    audience: 'user' | 'manager' | 'global';
    reportingPeriod: { startDate: string; endDate: string };
    sections: SectionOutput[];
  };
  config: any;
}): Promise<{ mailgunMessageId: string }> {
  // Build numbered section map from section outputs
  const sectionSlots: Record<number, string> = {};
  for (const s of request.sections) {
    sectionSlots[s.sectionNumber] = s.html;
  }

  // Assemble full HTML email from base template + numbered section slots
  const htmlBody = assembleEmailHtml({
    focusPoint: request.focusPoint,
    audience: request.audience,
    reportingPeriod: request.reportingPeriod,
    sectionSlots,
  });

  // Send via Mailgun
  const mg = new Mailgun(FormData).client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY!,
  });

  const subjectLabel = formatSubjectLabel(request.focusPoint, request.audience);
  const periodLabel = formatPeriodLabel(request.reportingPeriod);

  const result = await mg.messages.create(process.env.MAILGUN_DOMAIN!, {
    from: `Reports <reports@${process.env.MAILGUN_DOMAIN}>`,
    to: request.recipients,
    subject: `${subjectLabel} — ${periodLabel}`,
    html: htmlBody,
  });

  // Update deliveredAt on the report record
  const dataSource = getCustomerMemoryDataSource();
  const repo = dataSource.getRepository(OB1MemoryReportGeneratedV1);
  await repo.update(
    { id: request.reportId },
    { deliveredAt: new Date() },
  );

  return { mailgunMessageId: result.id ?? '' };
}

function assembleEmailHtml(args: {
  focusPoint: string;
  audience: 'user' | 'manager' | 'global';
  reportingPeriod: { startDate: string; endDate: string };
  sectionSlots: Record<number, string>;
}): string {
  // Base HTML wrapper with numbered section slots.
  // This template is embedded in the activity — NOT externally referenced.
  // Numbered slots decouple section content from position: reordering sections
  // in a future template version only requires changing the slot assignments
  // in the parent workflow, not this template.

  const MAX_SECTIONS = 8;
  let sectionsHtml = '';
  for (let i = 1; i <= MAX_SECTIONS; i++) {
    const slotHtml = args.sectionSlots[i];
    if (slotHtml) {
      sectionsHtml += `  <section id="section${i}">${slotHtml}</section>\n`;
    }
  }

  const subjectLabel = formatSubjectLabel(args.focusPoint, args.audience);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
  <header style="margin-bottom: 24px;">
    <h1 style="font-size: 20px;">${subjectLabel}</h1>
    <p style="color: #666;">${formatPeriodLabel(args.reportingPeriod)}</p>
  </header>

${sectionsHtml}
  <footer style="margin-top: 24px; font-size: 12px; color: #999;">
    Generated by the digital teammate reporting service.
  </footer>
</body>
</html>`;
}
```

## Query Specifications

All queries target the `ob1_memory_structured_sf_task_v1` table in the **customer database**. The reporting service has **read-only** access to this table. Every query is tenant-scoped and filtered by `memory_instance_id`.

### Q1 — Agent-Created Tasks for a Reporting Period (Completion / Speed / Counselor Snapshot)

Used by: `querySfTaskCompletionMetrics`, `querySfTaskSpeedMetrics`, `querySfCounselorSnapshot`

```sql
-- Fetch agent-created tasks within the reporting period
-- Optionally filtered by region or counselor
SELECT
    t.id,
    t.sf_task_id,
    t.sf_account_id,
    t.sf_account_name,
    t.sf_sales_counselor_id,
    t.sf_sales_counselor_name,
    t.task_status,
    t.task_created_at,
    t.task_last_modified_at,
    t.task_subject,
    t.counselor_feedback_to_agent,
    t.region
FROM ob1_memory_structured_sf_task_v1 t
WHERE t.tenant_id = :tenantId
  AND t.memory_instance_id = :memoryInstanceId
  AND t.sf_task_created_by_id IN (:agentUserIds)         -- only agent-created tasks
  AND t.task_created_at >= :periodStart                   -- reporting period
  AND t.task_created_at <= :periodEnd + INTERVAL '23:59:59'
  -- optional scope filters (one or neither):
  AND (:region IS NULL OR t.region = :region)
  AND (:counselorId IS NULL OR t.sf_sales_counselor_id = :counselorId)
ORDER BY t.task_created_at ASC;
```

### TypeORM equivalent:

```typescript
const qb = repo.createQueryBuilder('t')
  .where('t.tenantId = :tenantId', { tenantId })
  .andWhere('t.memoryInstanceId = :instanceId', { instanceId: memoryInstanceId })
  .andWhere('t.sfTaskCreatedById IN (:...agentIds)', { agentIds: agentUserIds })
  .andWhere('t.taskCreatedAt >= :start', { start: reportingPeriod.startDate })
  .andWhere('t.taskCreatedAt <= :end', { end: reportingPeriod.endDate + 'T23:59:59Z' });

if (region) qb.andWhere('t.region = :region', { region });
if (counselorId) qb.andWhere('t.sfSalesCounselorId = :counselorId', { counselorId });

const tasks = await qb.orderBy('t.taskCreatedAt', 'ASC').getMany();
```

**Index used:** `idx_ob1_memory_structured_sf_task_v1_tenant_instance_task_created` on `(tenant_id, memory_instance_id, task_created_at)`

---

### Q2 — All Records for Sankey Progression (All-Time, No Date Filter)

Used by: `querySfSankeyProgression`

This query fetches **every record** for the memory instance — both agent-created tasks and human follow-up activities — because the Sankey chart depicts all-time progression, not just the reporting period.

```sql
-- Fetch ALL records (agent tasks + activity trail) for Sankey
SELECT
    t.id,
    t.sf_task_id,
    t.sf_account_id,
    t.sf_sales_counselor_id,
    t.sf_sales_counselor_name,
    t.sf_task_created_by_id,
    t.task_status,
    t.task_created_at,
    t.task_subject,
    t.activity_type,
    t.activity_outcome,           -- stores Task_WrapUp__c value
    t.activity_outcome_detail,    -- stores Result__c value
    t.sf_custom_attribute,        -- JSONB: contains { topic, apptWrapUp, activitySource }
    t.region
FROM ob1_memory_structured_sf_task_v1 t
WHERE t.tenant_id = :tenantId
  AND t.memory_instance_id = :memoryInstanceId
  AND (:region IS NULL OR t.region = :region)
  AND (:counselorId IS NULL OR t.sf_sales_counselor_id = :counselorId)
ORDER BY t.sf_account_id ASC, t.task_created_at ASC;
```

### TypeORM equivalent:

```typescript
const qb = repo.createQueryBuilder('t')
  .where('t.tenantId = :tenantId', { tenantId })
  .andWhere('t.memoryInstanceId = :instanceId', { instanceId: memoryInstanceId });

if (region) qb.andWhere('t.region = :region', { region });
if (counselorId) qb.andWhere('t.sfSalesCounselorId = :counselorId', { counselorId });

const allRecords = await qb
  .orderBy('t.sfAccountId', 'ASC')
  .addOrderBy('t.taskCreatedAt', 'ASC')
  .getMany();
```

### Post-fetch partitioning (in application code):

```typescript
// Partition into agent-created tasks vs activity trail
const agentIdSet = new Set(agentUserIds.map(id => id.toLowerCase()));

for (const rec of allRecords) {
  const isAgent = rec.sfTaskCreatedById
    && agentIdSet.has(rec.sfTaskCreatedById.toLowerCase());

  if (isAgent) {
    agentTasksByAccount.get(rec.sfAccountId)?.push(rec) ?? agentTasksByAccount.set(rec.sfAccountId, [rec]);
  } else {
    trailByAccount.get(rec.sfAccountId)?.push(rec) ?? trailByAccount.set(rec.sfAccountId, [rec]);
  }
}
```

**Index used:** Same composite index on `(tenant_id, memory_instance_id, task_created_at)`. The `ORDER BY sf_account_id, task_created_at` ordering allows efficient grouping in application code.

**Estimated volume:** For a typical tenant with ~500–2000 accounts and 2–5 records per account, this returns ~1K–10K rows. Acceptable for in-memory processing.

---

### Q3 — All-Time Agent Tasks by Counselor (Counselor Snapshot)

Used by: `querySfCounselorSnapshot` (manager audience only)

This query needs both the reporting-period tasks AND all-time open counts. It uses a single wider query and partitions in application code.

```sql
-- Fetch ALL agent-created tasks for the region (all time) to compute
-- per-counselor week metrics + all-time open counts
SELECT
    t.sf_task_id,
    t.sf_sales_counselor_id,
    t.sf_sales_counselor_name,
    t.task_status,
    t.task_created_at,
    t.task_last_modified_at,
    t.region
FROM ob1_memory_structured_sf_task_v1 t
WHERE t.tenant_id = :tenantId
  AND t.memory_instance_id = :memoryInstanceId
  AND t.sf_task_created_by_id IN (:agentUserIds)
  AND t.region = :region                          -- region is required for counselor snapshot
ORDER BY t.sf_sales_counselor_id ASC, t.task_created_at ASC;
```

### Post-fetch grouping (in application code):

```typescript
// Group by counselor, partition into week vs all-time
for (const task of allTimeTasks) {
  const counselorId = task.sfSalesCounselorId ?? 'unknown';
  const entry = byCounselor.get(counselorId) ?? { allTasks: [], weekTasks: [] };

  entry.allTasks.push(task);

  const created = task.taskCreatedAt?.getTime() ?? 0;
  if (created >= periodStart && created <= periodEnd) {
    entry.weekTasks.push(task);
  }

  byCounselor.set(counselorId, entry);
}

// Per counselor:
//   weekAssigned = entry.weekTasks.length
//   weekCompleted = entry.weekTasks.filter(isCompleted).length
//   allTimeOpen = entry.allTasks.filter(t => !isCompleted(t)).length
```

---

### Q4 — Trend (Compiled Table)

Used by: `queryCompiledTrend` (v0.4 replacement for the old `querySfTrendMetrics` live-CRM query)

```sql
-- Read pre-compiled metrics across trailing N weeks for one (crm, focus, level, scope)
SELECT
    w.reporting_period_start,
    w.reporting_period_end,
    w.total_assigned,
    w.total_completed,
    w.total_open,
    w.effective_assigned,
    w.extra_assigned,
    w.completion_rate,
    w.same_day_rate,
    w.next_day_rate
FROM ob1_memory_weekly_task_reports_v1 w
WHERE w.tenant_id = :tenantId
  AND w.crm_type = :crmType
  AND w.focus_point = :focusPoint
  AND w.aggregation_level = :aggregationLevel
  AND w.scope_key = :scopeKey
  AND w.reporting_period_end >= :windowStart
  AND w.reporting_period_end <= :anchorEnd
ORDER BY w.reporting_period_end ASC;
```

**Index used:** `idx_wtr_trend_lookup` on `(tenant_id, crm_type, focus_point, aggregation_level, scope_key, reporting_period_end)`.

**Expected rows:** equals `trailingWeeks` (≤ 12 in practice).

---

### Q5 — Upsert Compiled Weekly Report Row

Used by: `compileWeeklyTaskReport`

```sql
INSERT INTO ob1_memory_weekly_task_reports_v1 (
    id, tenant_id, crm_type, focus_point,
    reporting_period_start, reporting_period_end,
    aggregation_level, scope_key,
    user_id, community_id, region,
    total_assigned, total_completed, total_open,
    effective_assigned, extra_assigned,
    completion_rate, same_day_rate, next_day_rate,
    sankey_text_input, feedback_samples,
    consultant_short_name, created_by_person_id
) VALUES (
    ob1_gen_prefixed_id_v2('wtr'),
    :tenantId, :crmType, :focusPoint,
    :periodStart, :periodEnd,
    :aggregationLevel, :scopeKey,
    :userId, :communityId, :region,
    :totalAssigned, :totalCompleted, :totalOpen,
    :effectiveAssigned, :extraAssigned,
    :completionRate, :sameDayRate, :nextDayRate,
    :sankeyTextInput, :feedbackSamples::jsonb,
    :consultantShortName, :createdByPersonId
)
ON CONFLICT ON CONSTRAINT uq_wtr_tenant_crm_focus_period_level_scope
DO UPDATE SET
    total_assigned    = EXCLUDED.total_assigned,
    total_completed   = EXCLUDED.total_completed,
    total_open        = EXCLUDED.total_open,
    effective_assigned= EXCLUDED.effective_assigned,
    extra_assigned    = EXCLUDED.extra_assigned,
    completion_rate   = EXCLUDED.completion_rate,
    same_day_rate     = EXCLUDED.same_day_rate,
    next_day_rate     = EXCLUDED.next_day_rate,
    sankey_text_input = EXCLUDED.sankey_text_input,
    feedback_samples  = EXCLUDED.feedback_samples
RETURNING id;
```

---

### Q6 — Idempotency Check (Report Record)

Used by: `checkIdempotency`

```sql
-- Check if a delivered report already exists for this combination
SELECT id
FROM ob1_memory_report_generated_v1
WHERE tenant_id = :tenantId
  AND crm_type = :crmType
  AND focus_point = :focusPoint
  AND audience = :audience
  AND reporting_period_start = :periodStart
  AND reporting_period_end = :periodEnd
  AND scope_key = :scopeKey
  AND delivered_at IS NOT NULL
LIMIT 1;
```

**Index used:** Unique constraint `uq_rpt_tenant_crm_focus_audience_period_scope` on `(tenant_id, crm_type, focus_point, audience, reporting_period_start, reporting_period_end, scope_key)`

---

### Q7 — Persist Report Record

Used by: `persistReport`

```sql
INSERT INTO ob1_memory_report_generated_v1 (
    id, tenant_id, crm_type, focus_point, audience, template_version,
    reporting_period_start, reporting_period_end, scope_key, region, counselor_id,
    generated_at,
    section_1_html, section_1_data,
    section_2_html, section_2_data,
    section_3_html, section_3_data,
    section_4_html, section_4_data,
    section_5_html, section_5_data,
    -- sections 6-8 left NULL
    consultant_short_name, created_by_person_id
) VALUES (
    ob1_gen_prefixed_id_v2('rpt'),
    :tenantId, :crmType, :focusPoint, :audience, :templateVersion,
    :periodStart, :periodEnd, :scopeKey, :region, :counselorId,
    NOW(),
    :section1Html, :section1Data::jsonb,
    :section2Html, :section2Data::jsonb,
    :section3Html, :section3Data::jsonb,
    :section4Html, :section4Data::jsonb,
    :section5Html, :section5Data::jsonb,
    :consultantShortName, :createdByPersonId
)
RETURNING id;
```

### TypeORM equivalent:

```typescript
const report = repo.create({
  tenantId, crmType, focusPoint, audience, templateVersion,
  reportingPeriodStart: periodStart,
  reportingPeriodEnd: periodEnd,
  scopeKey, region, counselorId,
  ...mapSectionsToColumns(sections), // spreads section1Html, section1Data, etc.
  consultantOrgShortName, createdByPersonId,
});
const saved = await repo.save(report);
return { reportId: saved.id };
```

---

### Q8 — Update Delivered Timestamp

Used by: `sendReportEmail` (after successful Mailgun delivery)

```sql
UPDATE ob1_memory_report_generated_v1
SET delivered_at = NOW(),
    updated_at = NOW(),
    record_version = record_version + 1
WHERE id = :reportId;
```

---

### Q9 — Org-Wide Agent Tasks (Global Ranking)

Used by: `querySfGlobalRanking` (global audience only)

Same shape as Q1 but with no region/counselor scope filter — this is the org-wide pull the ranking activity buckets by region, community, and user in application code.

```sql
SELECT
    t.sf_task_id,
    t.sf_sales_counselor_id,
    t.sf_sales_counselor_name,
    t.task_status,
    t.task_created_at,
    t.task_last_modified_at,
    t.region,
    t.sf_custom_attribute    -- holds communityId / communityName
FROM ob1_memory_structured_sf_task_v1 t
WHERE t.tenant_id = :tenantId
  AND t.memory_instance_id = :memoryInstanceId
  AND t.sf_task_created_by_id IN (:agentUserIds)
  AND t.task_created_at >= :periodStart
  AND t.task_created_at <= :periodEnd + INTERVAL '23:59:59'
ORDER BY t.task_created_at ASC;
```

---

### Query Performance Notes

| Query                   | Expected Rows | Scan Type                                      | Notes                                                        |
| ----------------------- | ------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Q1 (period tasks)       | 20–200        | Index scan on `(tenant, instance, created_at)` | Narrow date range, fast                                      |
| Q2 (all-time sankey)    | 1K–10K        | Index scan, wider range                        | Largest query; in-memory processing acceptable at this scale |
| Q3 (counselor snapshot) | 200–2000      | Index scan                                     | All-time for one region (manager audience only)              |
| Q4 (compiled trend)     | ≤ 12          | Index scan on `idx_wtr_trend_lookup`           | Small; one row per trailing week                             |
| Q5 (compile upsert)     | 1–N           | Insert/upsert on unique constraint             | N communities for manager; 1 otherwise                       |
| Q6 (idempotency)        | 0–1           | Unique index lookup                            | Fast point query                                             |
| Q7 (insert report)      | 1             | Insert                                         | Single row                                                   |
| Q8 (update delivered)   | 1             | Primary key lookup                             | Single row                                                   |
| Q9 (global ranking)     | 500–5000      | Index scan, org-wide                           | Global audience only; runs once per weekly global report     |

## SankeyMatic Node Module

The Sankey rendering module is a self-contained utility that converts SankeyMatic text format into a PNG image.

### Module Architecture

```text
src/ab-shared/utils/sankey/
├── sankeyParser.ts      # Text → { nodes, links }
├── sankeyLayout.ts      # { nodes, links } → positioned layout (d3-sankey)
└── sankeyRenderer.ts    # Positioned layout → PNG buffer (node-canvas)
```

### Input Format (SankeyMatic Text)

```text
Source Node [count] Target Node
Source Node [count] Another Target
Another Target [count] Final Node
```

Each line defines a flow: `sourceName [weight] targetName`. Lines with zero weight are omitted.

### Dependencies

| Package       | Version | Purpose                                  |
| ------------- | ------- | ---------------------------------------- |
| `d3-sankey`   | ^0.12   | Sankey diagram layout algorithm          |
| `node-canvas` | ^2.11   | Server-side Canvas API for PNG rendering |
| `d3-shape`    | ^3.2    | Link path generators for flow curves     |
| `d3-scale`    | ^4.0    | Color scaling for nodes                  |

### `sankeyParser.ts`

```typescript
interface ParsedSankeyInput {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
}

export function parseSankeyInput(text: string): ParsedSankeyInput {
  const nodeSet = new Set<string>();
  const links: Array<{ source: string; target: string; value: number }> = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match: "Source Name [123] Target Name"
    const match = trimmed.match(/^(.+?)\s+\[(\d+)\]\s+(.+)$/);
    if (!match) continue;

    const source = match[1].trim();
    const value = parseInt(match[2], 10);
    const target = match[3].trim();

    if (value <= 0) continue;

    nodeSet.add(source);
    nodeSet.add(target);
    links.push({ source, target, value });
  }

  const nodes = [...nodeSet].map(name => ({ name }));
  return { nodes, links };
}
```

### `sankeyLayout.ts`

```typescript
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';

interface LayoutOptions {
  width: number;
  height: number;
  nodeWidth: number;
  nodePadding: number;
}

interface SankeyLayoutResult {
  nodes: Array<{ name: string; x0: number; x1: number; y0: number; y1: number; value: number }>;
  links: Array<{ source: any; target: any; width: number; y0: number; y1: number; value: number }>;
  linkPathGenerator: (link: any) => string;
}

export function computeSankeyLayout(
  input: ParsedSankeyInput,
  options: LayoutOptions,
): SankeyLayoutResult {
  const nodeMap = new Map(input.nodes.map((n, i) => [n.name, i]));

  const indexedLinks = input.links.map(l => ({
    source: nodeMap.get(l.source)!,
    target: nodeMap.get(l.target)!,
    value: l.value,
  }));

  const layout = sankey()
    .nodeWidth(options.nodeWidth)
    .nodePadding(options.nodePadding)
    .extent([[1, 1], [options.width - 1, options.height - 5]]);

  const graph = layout({
    nodes: input.nodes.map(n => ({ ...n })),
    links: indexedLinks,
  });

  return {
    nodes: graph.nodes as any[],
    links: graph.links as any[],
    linkPathGenerator: sankeyLinkHorizontal(),
  };
}
```

### `sankeyRenderer.ts`

```typescript
import { createCanvas } from 'canvas';

interface RenderOptions {
  width: number;
  height: number;
  backgroundColor?: string;
}

// Color palette for Sankey nodes
const NODE_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
];

export function renderSankeyToPng(
  layout: SankeyLayoutResult,
  options: RenderOptions,
): Buffer {
  const canvas = createCanvas(options.width, options.height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = options.backgroundColor ?? '#ffffff';
  ctx.fillRect(0, 0, options.width, options.height);

  // Draw links (flows)
  ctx.globalAlpha = 0.3;
  for (const link of layout.links) {
    const sourceColor = NODE_COLORS[link.source.index % NODE_COLORS.length];
    ctx.strokeStyle = sourceColor;
    ctx.lineWidth = Math.max(1, link.width);

    const path = new Path2D(layout.linkPathGenerator(link));
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1.0;

  // Draw nodes (rectangles)
  for (const node of layout.nodes) {
    const color = NODE_COLORS[node.index % NODE_COLORS.length];
    ctx.fillStyle = color;
    ctx.fillRect(node.x0, node.y0, node.x1 - node.x0, node.y1 - node.y0);
  }

  // Draw labels
  ctx.fillStyle = '#333';
  ctx.font = '11px Arial';
  for (const node of layout.nodes) {
    const isLeft = node.x0 < options.width / 2;
    const x = isLeft ? node.x1 + 6 : node.x0 - 6;
    const y = (node.y0 + node.y1) / 2;
    ctx.textAlign = isLeft ? 'left' : 'right';
    ctx.textBaseline = 'middle';

    const label = `${node.name} [${node.value}]`;
    ctx.fillText(label, x, y);
  }

  return canvas.toBuffer('image/png');
}
```

## Error Handling Matrix


| Error                                           | Retryable | Behavior                                                           |
| ----------------------------------------------- | --------- | ------------------------------------------------------------------ |
| No task data for period                         | No        | `ApplicationFailure.nonRetryable` (`NO_DATA`); no record written   |
| Invalid `focusPoint`, `audience`, or `crmType`  | No        | `ApplicationFailure.nonRetryable` before any DB reads              |
| `crmType=welcomehome` hit in any parent         | No        | `ApplicationFailure.nonRetryable` (`WH_NOT_IMPLEMENTED`) until WH ships |
| Report already exists (idempotency)             | No        | Workflow exits as no-op; returns existing reportId                 |
| DB read failure (data query)                    | Yes       | Temporal retries the data activity; max 3 attempts                 |
| Compile upsert failure                          | Yes       | Temporal retries `compileWeeklyTaskReport`; unique constraint makes it safely re-runnable |
| Compiled-trend window missing rows              | No        | `queryCompiledTrend` sets `trendDirection='insufficient'`; workflow continues |
| DB write failure (persist)                      | Yes       | Temporal retries `persistReport`; delivery not attempted           |
| Section activity failure (non-LLM)              | Yes       | Temporal retries individual activity; max 3 attempts               |
| Sankey render failure                           | Yes       | Temporal retries; if canvas init fails, surfaces error             |
| Mailgun API error (5xx / network)               | Yes       | Temporal retries `sendReportEmail`; report record preserved        |
| Mailgun API error (4xx / bad request)           | No        | `ApplicationFailure.nonRetryable`; report record preserved         |
| `renderWhatILearnedSection` LLM failure         | Yes       | Retry up to 2 attempts; fail workflow if exhausted                 |
| Empty feedback samples (LLM section)            | No        | Activity returns placeholder HTML; workflow continues              |

## Temporal Configuration

### Worker Registration

```typescript
// src/worker/worker.service.ts

import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './allActivity/all.activity';

const worker = await Worker.create({
  connection: nativeConnection,
  namespace: 'ob1-tsch-temporal-workflow-automation-ns-1',
  taskQueue: 'customer-reporting',
  workflowsPath: require.resolve('./allWorkflow/all.workflow'),
  activities,
  interceptors: buildInterceptors(),
  maxConcurrentActivityTaskExecutions: 10,
  maxConcurrentWorkflowTaskExecutions: 5,
});

await worker.run();
```

### Workflow Configuration


| Workflow                              | Execution Timeout | Task Queue           |
| ------------------------------------- | ----------------- | -------------------- |
| `generateWeeklyUserEmailWorkflow`     | 15 minutes        | `customer-reporting` |
| `generateWeeklyManagerEmailWorkflow`  | 15 minutes        | `customer-reporting` |
| `generateWeeklyGlobalEmailWorkflow`   | 15 minutes        | `customer-reporting` |
| `ingestSfCrmDataV1Workflow` (TBD)     | TBD               | `customer-reporting` |
| `ingestWmCrmDataV1Workflow` (TBD)     | TBD               | `customer-reporting` |
| `sfCompletionDataWorkflow`            | 3 minutes         | `customer-reporting` |
| `sfSpeedDataWorkflow`                 | 3 minutes         | `customer-reporting` |
| `sfSankeyProgressionDataWorkflow`     | 5 minutes         | `customer-reporting` |
| `sfCounselorSnapshotWorkflow`         | 3 minutes         | `customer-reporting` |
| `sfGlobalRankingWorkflow`             | 3 minutes         | `customer-reporting` |

### Activity Retry Policy Defaults


| Activity Category              | Start-to-Close Timeout | Max Attempts | Initial Interval | Backoff |
| ------------------------------ | ---------------------- | ------------ | ---------------- | ------- |
| Data query                     | 2 minutes              | 3            | 1s               | 2x      |
| Compile (`compileWeeklyTaskReport`) | 1 minute          | 3            | 1s               | 2x      |
| Compiled-trend read            | 30 seconds             | 3            | 1s               | 2x      |
| Section render                 | 5 minutes              | 3            | 1s               | 2x      |
| LLM (What I Learned)           | 3 minutes              | 2            | 2s               | 2x      |
| Persist report                 | 1 minute               | 3            | 1s               | 2x      |
| Send email                     | 2 minutes              | 3            | 5s               | 2x      |
| Idempotency check              | 30 seconds             | 3            | 1s               | 2x      |

### Nexus Service Registration

Mark 1 exposes **five** Nexus operations from the reporting service: three report-generation ops (one per audience) and two ingestion ops (CRM-specific, internals TBD). Callers pick the op that matches their intent; the op itself fixes the audience and CRM, so there is no `audience`/`crmType` routing in a single generic op.


| Nexus operation                 | Parent workflow started                  | Input type                 | Audience | CRM         |
| ------------------------------- | ---------------------------------------- | -------------------------- | -------- | ----------- |
| `generateWeeklyUserEmailV1`     | `generateWeeklyUserEmailWorkflow`        | `WeeklyUserEmailInput`     | `user`   | SF + WH     |
| `generateWeeklyManagerEmailV1`  | `generateWeeklyManagerEmailWorkflow`     | `WeeklyManagerEmailInput`  | `manager`| SF + WH     |
| `generateWeeklyGlobalEmailV1`   | `generateWeeklyGlobalEmailWorkflow`      | `WeeklyGlobalEmailInput`   | `global` | SF + WH     |
| `ingestSFCrmDataV1`             | `ingestSfCrmDataV1Workflow` (TBD)        | TBD                        | —        | salesforce  |
| `ingestWMCrmDataV1`             | `ingestWmCrmDataV1Workflow` (TBD)        | TBD                        | —        | welcomehome |


`crmType` (`salesforce` | `welcomehome`) on each `WeeklyReportInputBase` decides which CRM-specific child data workflows fire inside the parent. The Nexus op itself does not branch on CRM.

```typescript
// src/worker/nexus/reporting/reporting.service.contract.ts

import type { WeeklyUserEmailInput } from '@/worker/allWorkflow/reporting/interfaces/weeklyUserEmailInput';
import type { WeeklyManagerEmailInput } from '@/worker/allWorkflow/reporting/interfaces/weeklyManagerEmailInput';
import type { WeeklyGlobalEmailInput } from '@/worker/allWorkflow/reporting/interfaces/weeklyGlobalEmailInput';

export interface ReportingNexusService {
  // Report generation — one op per audience
  generateWeeklyUserEmailV1(
    input: { request: WeeklyUserEmailInput; config: WorkflowConfigV2 },
  ): Promise<{ success: boolean; reportId: string }>;
  generateWeeklyManagerEmailV1(
    input: { request: WeeklyManagerEmailInput; config: WorkflowConfigV2 },
  ): Promise<{ success: boolean; reportId: string }>;
  generateWeeklyGlobalEmailV1(
    input: { request: WeeklyGlobalEmailInput; config: WorkflowConfigV2 },
  ): Promise<{ success: boolean; reportId: string }>;

  // Ingestion — internals TBD, contracts reserved
  ingestSFCrmDataV1(input: { request: unknown; config: WorkflowConfigV2 }): Promise<unknown>;
  ingestWMCrmDataV1(input: { request: unknown; config: WorkflowConfigV2 }): Promise<unknown>;
}
```

```typescript
// src/worker/nexus/reporting/reporting.service.impl.ts

const reportingNexusService = serviceHandler(reportingServiceDefinition, {
  // ── User audience ────────────────────────────────────────────
  generateWeeklyUserEmailV1: new WorkflowRunOperationHandler(
    async (ctx, input) => {
      const { tenantId, crmType, focusPoint, reportingPeriod, counselorId } = input.request;
      const workflowId = buildReportWorkflowId(
        tenantId, crmType, focusPoint, 'user',
        reportingPeriod.startDate, reportingPeriod.endDate,
        counselorId,
      );
      return startWorkflow(ctx, 'generateWeeklyUserEmailWorkflow', {
        args: [input],
        workflowId,
      });
    },
  ),

  // ── Manager audience ─────────────────────────────────────────
  generateWeeklyManagerEmailV1: new WorkflowRunOperationHandler(
    async (ctx, input) => {
      const { tenantId, crmType, focusPoint, reportingPeriod, region } = input.request;
      const workflowId = buildReportWorkflowId(
        tenantId, crmType, focusPoint, 'manager',
        reportingPeriod.startDate, reportingPeriod.endDate,
        region,
      );
      return startWorkflow(ctx, 'generateWeeklyManagerEmailWorkflow', {
        args: [input],
        workflowId,
      });
    },
  ),

  // ── Global audience ──────────────────────────────────────────
  generateWeeklyGlobalEmailV1: new WorkflowRunOperationHandler(
    async (ctx, input) => {
      const { tenantId, crmType, focusPoint, reportingPeriod } = input.request;
      const workflowId = buildReportWorkflowId(
        tenantId, crmType, focusPoint, 'global',
        reportingPeriod.startDate, reportingPeriod.endDate,
        'global',
      );
      return startWorkflow(ctx, 'generateWeeklyGlobalEmailWorkflow', {
        args: [input],
        workflowId,
      });
    },
  ),

  // ── Ingestion (TBD) ──────────────────────────────────────────
  // Handler signatures are reserved. Workflow start is stubbed until the
  // ingestion workflows are specified.
  ingestSFCrmDataV1: new WorkflowRunOperationHandler(async (_ctx, _input) => {
    throw new Error('ingestSFCrmDataV1 not yet implemented');
  }),
  ingestWMCrmDataV1: new WorkflowRunOperationHandler(async (_ctx, _input) => {
    throw new Error('ingestWMCrmDataV1 not yet implemented');
  }),
});
```

## Configuration (Environment Variables)

| Variable                 | Source | Description                                  |
| ------------------------ | ------ | -------------------------------------------- |
| `TEMPORAL_FRONTEND_ADDR` | Env    | `temporal-frontend:7233`                     |
| `TEMPORAL_NAMESPACE`     | Env    | `ob1-tsch-temporal-workflow-automation-ns-1` |
| `DATABASE_URL`           | Env    | PostgreSQL connection string (customer DB)   |
| `MAILGUN_API_KEY`        | Vault  | `mailgun-api-key`                            |
| `MAILGUN_DOMAIN`         | Env    | Mailgun sending domain                       |
| `SERVICE_NAME`           | Env    | `shared-consultant-worker-2`                 |
| `LOG_LEVEL`              | Env    | `info`                                       |

## Testing


| Test                          | Trigger                                                                                          | Pass Condition                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Manual user-audience report   | Temporal UI: start `generateWeeklyUserEmailWorkflow` with SF input, `focusPoint=completion`      | Email received at test inbox; sections 1–4 present                     |
| Manual user speed report      | Same, `focusPoint=speed`                                                                         | Sections 1 (summary) and 4 (trend) show same-day block                 |
| Manual manager-audience report | Start `generateWeeklyManagerEmailWorkflow`, `focusPoint=completion`                             | Email includes section 5 (counselor breakdown); community rows written to `ob1_memory_weekly_task_reports_v1` |
| Manual global-audience report | Start `generateWeeklyGlobalEmailWorkflow`, `focusPoint=completion`                               | Email includes section 5 (performance ranking); `global` row written to compiled table |
| Trend after prior compile     | Run user-audience report twice across consecutive weeks                                          | Second run's trend section shows ≥ 2 weekly buckets read from compiled table |
| No-data scenario              | Trigger any of the three with empty tenant                                                       | Workflow fails with `NO_DATA`; no report record or compiled row written |
| Duplicate trigger             | Trigger same input twice                                                                         | Second returns existing reportId, no duplicate email                   |
| WH branch guard               | Trigger any parent with `crmType=welcomehome`                                                    | `ApplicationFailure.nonRetryable` with code `WH_NOT_IMPLEMENTED`       |

## Deployment Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shared-consultant-worker-2
  namespace: ob1-tsch-temporal-workflow-automation-ns-1
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shared-consultant-worker-2
  template:
    metadata:
      labels:
        app: shared-consultant-worker-2
    spec:
      containers:
        - name: worker
          image: <registry>/shared-consultant-worker-2:<tag>
          ports:
            - containerPort: 8081   # Metrics
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          env:
            - name: TEMPORAL_FRONTEND_ADDR
              value: "temporal-frontend:7233"
            - name: TEMPORAL_NAMESPACE
              value: "ob1-tsch-temporal-workflow-automation-ns-1"
            - name: SERVICE_NAME
              value: "shared-consultant-worker-2"
            - name: MAILGUN_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: reporting-config
                  key: mailgun-domain
          livenessProbe:
            exec:
              command: ["node", "-e", "process.exit(0)"]
            initialDelaySeconds: 30
            periodSeconds: 60
```

> **Note:** Memory limit is 1Gi (higher than Worker-1's 512Mi) because the Sankey rendering via node-canvas requires additional memory for canvas buffer allocation, especially for large diagrams.
