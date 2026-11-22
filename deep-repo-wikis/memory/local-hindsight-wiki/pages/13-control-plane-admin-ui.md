---
grok_wiki: true
page_id: "page-control-plane"
title: "Control Plane (Admin UI)"
repository: "local/hindsight"
branch: "default"
generated_at: "2026-07-14T22:08:34.361Z"
source_files:
  - "hindsight-control-plane/src/app/[locale]/dashboard/page.tsx"
  - "hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx"
  - "hindsight-control-plane/src/app/api/recall"
  - "hindsight-control-plane/src/app/api/reflect"
  - "hindsight-control-plane/src/lib/api.ts"
---

<details>
<summary>Relevant source files</summary>
The following files were used as context for generating this wiki page:

- [hindsight-control-plane/src/app/[locale]/dashboard/page.tsx](hindsight-control-plane/src/app/[locale]/dashboard/page.tsx)
- [hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx](hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx)
- [hindsight-control-plane/src/app/api/recall/route.ts](hindsight-control-plane/src/app/api/recall/route.ts)
- [hindsight-control-plane/src/app/api/reflect/route.ts](hindsight-control-plane/src/app/api/reflect/route.ts)
- [hindsight-control-plane/src/app/api/memories/retain/route.ts](hindsight-control-plane/src/app/api/memories/retain/route.ts)
- [hindsight-control-plane/src/app/api/entities/route.ts](hindsight-control-plane/src/app/api/entities/route.ts)
- [hindsight-control-plane/src/app/api/stats/[agentId]/route.ts](hindsight-control-plane/src/app/api/stats/[agentId]/route.ts)
- [hindsight-control-plane/src/lib/api.ts](hindsight-control-plane/src/lib/api.ts)
- [hindsight-control-plane/src/lib/hindsight-client.ts](hindsight-control-plane/src/lib/hindsight-client.ts)
- [hindsight-control-plane/src/lib/sdk-response.ts](hindsight-control-plane/src/lib/sdk-response.ts)
- [hindsight-control-plane/src/lib/bank-url.ts](hindsight-control-plane/src/lib/bank-url.ts)
- [hindsight-control-plane/src/lib/bank-context.tsx](hindsight-control-plane/src/lib/bank-context.tsx)
- [hindsight-control-plane/src/lib/features-context.tsx](hindsight-control-plane/src/lib/features-context.tsx)
- [hindsight-control-plane/src/components/sidebar.tsx](hindsight-control-plane/src/components/sidebar.tsx)
- [hindsight-control-plane/package.json](hindsight-control-plane/package.json)
</details>

# Control Plane (Admin UI)

The control plane (`hindsight-control-plane/`) is a Next.js admin application for operating Hindsight memory banks: browsing and curating facts, running recall/reflect queries interactively, managing entities, documents, mental models, webhooks, and per-bank configuration. It never talks to the dataplane API (`hindsight-api-slim`) directly from the browser. Instead, every UI interaction goes through a same-origin Next.js API route under `src/app/api/`, which proxies the request to the dataplane over a typed SDK. This three-layer split — page components, API route proxies, and a typed browser client — is the architectural backbone of the app and is the reason the CLAUDE.md conventions require all three to be updated together whenever a dataplane parameter changes.

Because the dataplane is a separate, independently deployable FastAPI service (potentially self-hosted with any BYOK/BYOC LLM, embeddings, and database backend), the control plane treats it purely as an HTTP dependency reachable via `HINDSIGHT_CP_DATAPLANE_API_URL` — it makes no assumptions about which model provider or infrastructure backs a given bank.

## Three-Layer Architecture

```
flowchart TB
    subgraph UI["Browser UI (src/app/[locale])"]
        Dashboard["dashboard/page.tsx"]
        BankPage["banks/[bankId]/page.tsx"]
        Views["DataView / EntitiesView / SearchDebugView /\nThinkView / BankStatsView / ..."]
    end

    subgraph ClientLayer["Typed client (src/lib)"]
        ApiTs["api.ts\nControlPlaneClient"]
        BankUrl["bank-url.ts\nbankApi() / bankRoute()"]
        BankCtx["bank-context.tsx / features-context.tsx"]
    end

    subgraph RouteLayer["API route proxies (src/app/api)"]
        Recall["api/recall/route.ts"]
        Reflect["api/reflect/route.ts"]
        Retain["api/memories/retain/route.ts"]
        Entities["api/entities/route.ts"]
        Stats["api/stats/[agentId]/route.ts"]
        Banks["api/banks/[bankId]/..."]
    end

    subgraph SdkLayer["Dataplane SDK (src/lib)"]
        HClient["hindsight-client.ts\nsdk, lowLevelClient, hindsightClient"]
        SdkResp["sdk-response.ts\nrespondWithSdk()"]
    end

    subgraph Dataplane["hindsight-api-slim (external service)"]
        HttpApi["api/http.py\n/v1/default/banks/{bank_id}/..."]
    end

    Dashboard --> BankCtx
    BankPage --> Views
    Views --> ApiTs
    ApiTs --> BankUrl
    ApiTs -->|"fetch(withBasePath(path))"| RouteLayer
    RouteLayer --> SdkLayer
    SdkLayer -->|HTTP| HttpApi
    SdkResp -.serializes result.data/.error.-> RouteLayer
```

Sources: [hindsight-control-plane/src/lib/api.ts:215-304](), [hindsight-control-plane/src/lib/hindsight-client.ts:1-63](), [hindsight-control-plane/src/lib/sdk-response.ts:84-123]()

### Why the proxy layer exists

The API routes are not pass-through shims: `hindsight-client.ts` builds two dataplane clients — a low-level `sdk`/`lowLevelClient` pair (used by most routes via `@hey-api/client-fetch`-generated SDK calls) and a higher-level `hindsightClient` (`HindsightClient`) used for convenience methods like `retainBatch`. Both are configured once with `DATAPLANE_URL` (`HINDSIGHT_CP_DATAPLANE_API_URL`, default `http://localhost:8888`) and an optional bearer token (`HINDSIGHT_CP_DATAPLANE_API_KEY`) [hindsight-control-plane/src/lib/hindsight-client.ts:14-53](). Routes that use the low-level `sdk` funnel their result through `respondWithSdk`, a shared helper that fixes a specific failure mode of the generated `@hey-api/client-fetch` SDK: on a non-2xx dataplane response, `result.data` is `undefined` and `NextResponse.json(undefined)` throws — `respondWithSdk` detects `result.error !== undefined || result.data === undefined`, extracts the upstream status/detail, and returns a structured `{error, details, upstream}` payload instead of masking the real error as a generic 500 [hindsight-control-plane/src/lib/sdk-response.ts:63-123]().

Not every route uses `respondWithSdk` — `recall/route.ts` and `memories/retain/route.ts` hand-roll their own try/catch and reshape the response body directly, which is a source of drift worth watching when auditing error-handling consistency across routes [hindsight-control-plane/src/app/api/recall/route.ts:5-67](), [hindsight-control-plane/src/app/api/memories/retain/route.ts:5-64]().

## Page Layer: Dashboard and Bank Pages

`dashboard/page.tsx` is a thin redirect target: on mount, if `useBank()` already has a `currentBank` selected (persisted via `BankProvider`/`localStorage`-backed context), it immediately routes to `bankRoute(currentBank, "?view=data")`; otherwise it shows a "select a bank" placeholder alongside the `BankSelector` [hindsight-control-plane/src/app/[locale]/dashboard/page.tsx:10-36]().

`banks/[bankId]/page.tsx` is the actual admin workspace. It reads `view`, `subTab`, and `bankConfigTab` from the query string to drive tab state (no client-side router state beyond the URL), and renders one of six top-level views selected by the `Sidebar`:

| `view` value | Rendered component | Purpose |
|---|---|---|
| `profile` | `BankStatsView`, `BankOperationsView`, `BankProfileView`, `BankConfigView`, `MemoryDefenseSection`, `WebhooksView`, `AuditLogsView`, `LLMRequestsView` | Bank configuration, stats, operations, memory-defense rules, webhooks, audit/LLM traces |
| `recall` | `SearchDebugView` | Interactive recall query debugger |
| `reflect` | `ThinkView` | Interactive reflect (disposition-aware reasoning) console |
| `data` | `DataView` (per `subTab`: world / experience / observations / mental-models) | Browse and curate memory units |
| `documents` | `DocumentsView` | Document list, export/import |
| `entities` | `EntitiesView` | Entity list and co-occurrence graph |

Sub-features are gated by server-reported feature flags (`observations`, `bank_config_api`, `audit_log`, `llm_trace`, `bank_llm_health`) pulled from `useFeatures()`, which itself calls `client.getVersion()` once on mount [hindsight-control-plane/src/lib/features-context.tsx:47-61](), [hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx:76-86]() — disabled features render a `FeatureNotEnabled` placeholder naming the env var to flip (e.g. `HINDSIGHT_API_ENABLE_OBSERVATIONS=true`), rather than hiding the tab outright [hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx:593-611]().

The page also owns several bank-lifecycle actions dispatched straight to `client` methods: delete bank, clear observations, trigger/recover consolidation, reset config, and export a bank template — each wrapped in local `isX` loading state and a confirmation `AlertDialog` for destructive ones [hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx:115-187]().

Sources: [hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx:60-113](), [hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx:189-641](), [hindsight-control-plane/src/components/sidebar.tsx:20-42]()

## API Route Layer

Every route lives under `src/app/api/` and mirrors a dataplane endpoint at `/v1/default/banks/{bank_id}/...`. Bank-scoped routes are built with the `bankApi()` / `bankStatsApi()` / `memoryApi()` / `documentApi()` helpers in `bank-url.ts`, which percent-encode the bank id since bank ids can contain `:`/`/`/`%` (e.g. composite ids like `agent::channel::user`) [hindsight-control-plane/src/lib/bank-url.ts:14-39]().

| Route | Method | Dataplane call | Notes |
|---|---|---|---|
| `api/recall/route.ts` | POST | `sdk.recallMemories` → `/memories/recall` | Accepts `bank_id` or legacy `agent_id`; maps `types`/`fact_type` alias; defaults `budget` to `"mid"`; hand-rolled response shaping (not `respondWithSdk`) [hindsight-control-plane/src/app/api/recall/route.ts:5-67]() |
| `api/reflect/route.ts` | POST | `sdk.reflect` → `/reflect` | Defaults `budget` from legacy `thinking_budget`; builds `include.facts`/`include.tool_calls` from booleans; uses `respondWithSdk` [hindsight-control-plane/src/app/api/reflect/route.ts:6-63]() |
| `api/memories/retain/route.ts` | POST | `hindsightClient.retainBatch` | Synchronous batch retain; folds request-level `observation_scopes` into each item if the item didn't set its own [hindsight-control-plane/src/app/api/memories/retain/route.ts:20-33]() |
| `api/memories/retain_async/route.ts` | POST | async retain variant | Returns an `operation_id` for polling via `api/operations/[agentId]` |
| `api/entities/route.ts` | GET | `sdk.listEntities` → `/entities` | `bank_id` required as query param; `limit`/`offset` pass-through; uses `respondWithSdk` [hindsight-control-plane/src/app/api/entities/route.ts:6-29]() |
| `api/entities/graph/route.ts`, `api/entities/[entityId]/route.ts`, `.../regenerate/route.ts` | GET/POST | entity graph & regeneration | Co-occurrence graph and observation regeneration |
| `api/stats/[agentId]/route.ts` | GET | `sdk.getAgentStats` → bank stats | Trivial pass-through via `respondWithSdk` [hindsight-control-plane/src/app/api/stats/[agentId]/route.ts:5-15]() |
| `api/stats/[agentId]/memories-timeseries/route.ts` | GET | stats timeseries | Bucketed by `period` and `time_field` |
| `api/banks/route.ts`, `api/banks/[bankId]/...` | GET/POST/PATCH/DELETE | bank CRUD, config, health, import/export, consolidation, webhooks, audit-logs, llm-requests, mental-models, observations, tags, directives | One subdirectory per bank-scoped dataplane resource |
| `api/documents/...`, `api/chunks/[chunkId]`, `api/files/retain`, `api/graph`, `api/list`, `api/operations/[agentId]`, `api/profile/[bankId]`, `api/extract`, `api/version` | various | documents, chunks, uploads, graph, memory listing, async operation polling, bank profile, dry-run extraction, feature flags | Cover the remaining `DataView`/`DocumentsView`/`EntitiesView` needs |

Sources: [hindsight-control-plane/src/app/api](hindsight-control-plane/src/app/api), [hindsight-control-plane/src/lib/bank-url.ts:21-39]()

### Recall route example

```ts
// hindsight-control-plane/src/app/api/recall/route.ts:24-40
const response = await sdk.recallMemories({
  client: lowLevelClient,
  path: { bank_id: bankId },
  body: {
    query,
    types: types || fact_type,
    prefer_observations,
    max_tokens,
    trace,
    budget: budget || "mid",
    include,
    query_timestamp,
    tags,
    tags_match,
    min_scores,
  },
});
```

This request body shape (`types`, `prefer_observations`, `budget`, `include.{entities,chunks,source_facts}`, `tags_match`, `min_scores`) is exactly the surface that `ControlPlaneClient.recall()` in `lib/api.ts` types out for callers, and both must be kept in sync whenever the dataplane recall endpoint gains or renames a parameter [hindsight-control-plane/src/lib/api.ts:344-371]().

## Typed Client: `lib/api.ts`

`ControlPlaneClient` (exported as the singleton `client`) is the only way UI components talk to the control-plane API routes — components never call `fetch()` on `/api/...` directly. It centralizes:

- **Base-path-aware fetch** via `withBasePath()`/`stripBasePath()`, so it works behind a reverse-proxy path prefix.
- **Uniform error handling**: on non-2xx responses it distinguishes 4xx ("Client Error", `toast.warning`) from 5xx ("Server Error", `toast.error`), auto-redirects to `/login` on 401 (unless already on the login page), and reduces structured error `details` (including Memory Defense violation blocks shaped as `{violations: [{message}]}`) into a renderable string via `describeErrorDetails()` [hindsight-control-plane/src/lib/api.ts:16-32](), [hindsight-control-plane/src/lib/api.ts:216-304]().
- **One method per dataplane capability** — `recall`, `reflect`, `retain`, `getBankStats`, `getMemoriesTimeseries`, `getGraph`, `listOperations`/`cancelOperation`/`retryOperation`, `listEntities`/`getEntityGraph`/`getEntity`/`regenerateEntityObservations`, `listDocuments`/`getDocument`/`updateDocument`/`reprocessDocument`/`deleteDocument`, `listMemories`/`updateMemory`/`getMemory`/`getObservationHistory`, bank profile/config/webhooks/audit-logs/llm-requests, mental models, `getVersion`, and file/document transfer (`exportDocuments`/`importDocuments`/`uploadFiles`, which bypass `fetchApi` for binary/multipart bodies) [hindsight-control-plane/src/lib/api.ts:344-1782]().

Each method's parameter and return types are hand-written TypeScript interfaces that mirror the dataplane's request/response schema — they are **not** derived from the generated OpenAPI SDK types used inside the route handlers. This is the specific "stay in sync" risk called out in project conventions: adding a dataplane recall/reflect/retain parameter requires updating (1) the route handler's destructuring and SDK call, (2) the corresponding method signature in `api.ts`, and (3) any UI component consuming the new field — none of these three are compile-time linked to each other.

```ts
// hindsight-control-plane/src/lib/api.ts:344-371
async recall(params: {
  query: string;
  types?: string[];
  prefer_observations?: boolean;
  bank_id: string;
  budget?: string;
  max_tokens?: number;
  trace?: boolean;
  include?: {
    entities?: { max_tokens: number } | null;
    chunks?: { max_tokens: number } | null;
    source_facts?: { max_tokens?: number } | null;
  };
  query_timestamp?: string;
  tags?: string[];
  tags_match?: "any" | "all" | "any_strict" | "all_strict" | "exact";
  min_scores?: { semantic?: number | null; keyword?: number | null; reranker?: number | null; final?: number | null };
}) {
  return this.fetchApi("/api/recall", { method: "POST", body: JSON.stringify(params) });
}
```

Sources: [hindsight-control-plane/src/lib/api.ts:215-304](), [hindsight-control-plane/src/lib/api.ts:344-419]()

## Request Flow: Recall From the UI

```
sequenceDiagram
    participant View as SearchDebugView (data-view / recall tab)
    participant Client as ControlPlaneClient.recall()
    participant Route as api/recall/route.ts
    participant SDK as sdk.recallMemories (lowLevelClient)
    participant Dataplane as hindsight-api-slim /memories/recall

    View->>Client: client.recall({query, bank_id, budget, include, ...})
    Client->>Route: fetch(withBasePath("/api/recall"), POST, JSON body)
    Route->>SDK: sdk.recallMemories({path: {bank_id}, body: {...}})
    SDK->>Dataplane: POST /v1/default/banks/{bank_id}/memories/recall
    Dataplane-->>SDK: {results, trace, entities, chunks} or error
    SDK-->>Route: {data} or {error, response}
    alt success
        Route-->>Client: NextResponse.json({results, trace, entities, chunks})
    else dataplane error
        Route-->>Client: NextResponse.json({error: "Failed to recall"}, 500)
    end
    Client-->>View: parsed JSON or thrown Error (toast shown automatically)
```

Retain and reflect follow the same shape, differing only in which SDK function and dataplane path they call (`hindsightClient.retainBatch` → `/memories/retain`, `sdk.reflect` → `/reflect`) and in how they map legacy/aliased fields (`agent_id` → `bank_id`, `fact_type` → `types`, `thinking_budget` → `budget`).

Sources: [hindsight-control-plane/src/app/api/recall/route.ts:5-67](), [hindsight-control-plane/src/lib/api.ts:342-371]()

## Provider-Neutral, BYOC/BYOK Design

The control plane holds no model-provider logic itself: `HINDSIGHT_CP_DATAPLANE_API_URL` and `HINDSIGHT_CP_DATAPLANE_API_KEY` are the only environment inputs `hindsight-client.ts` reads, and every operation the UI performs — recall, reflect, retain, entity/graph queries, mental-model refresh — is delegated entirely to whatever LLM/embeddings/database configuration the target bank resolves on the dataplane side (per the hierarchical Global → Tenant → Bank config system documented for `hindsight-api-slim`) [hindsight-control-plane/src/lib/hindsight-client.ts:14-43](). This keeps the admin UI portable across self-hosted or hosted dataplane deployments and across any BYOK provider the operator configures for a given bank, without the control plane needing provider-specific code paths.

## Client/Server Generation Chain

The typed SDK consumed by `hindsight-client.ts` (`@vectorize-io/hindsight-client`, resolved via `file:../hindsight-clients/typescript` in `package.json`) is generated, not hand-written: `scripts/generate-openapi.sh` regenerates `hindsight-docs/static/openapi.json` from the FastAPI app, and `scripts/generate-clients.sh` regenerates the TypeScript client (via `@hey-api/openapi-ts`) from that spec [hindsight-control-plane/package.json:14-80](). The control plane's `package.json` even runs a `prebuild` step that rebuilds `@vectorize-io/hindsight-client` before building the Next.js app, so a stale generated client can't silently ship. `lib/api.ts`, by contrast, is hand-maintained and is the piece that must be manually kept in sync when the OpenAPI-derived types change — this is the crux of the "must stay in sync" relationship named in this page's description.

## Summary

The control plane's data path is UI component → `ControlPlaneClient` (`lib/api.ts`) → Next.js API route (`src/app/api/**/route.ts`) → generated dataplane SDK (`lib/hindsight-client.ts`) → `hindsight-api-slim`. The route layer exists specifically to keep the dataplane URL/API key server-side and to normalize dataplane error responses (`respondWithSdk`) into a shape the browser client can toast consistently. Because `lib/api.ts`'s parameter/response types are hand-written rather than generated, any change to a dataplane endpoint's request or response shape (recall, reflect, retain, memories, entities, stats, or any bank-scoped resource) requires coordinated edits across the route handler, the `ControlPlaneClient` method, and any UI component reading the new field — the checklist codified in this repository's CLAUDE.md "Control Plane API Routes" section.

## Related pages

- page-http-api
- page-cli


## Source files

- `hindsight-control-plane/src/app/[locale]/dashboard/page.tsx`
- `hindsight-control-plane/src/app/[locale]/banks/[bankId]/page.tsx`
- `hindsight-control-plane/src/app/api/recall`
- `hindsight-control-plane/src/app/api/reflect`
- `hindsight-control-plane/src/lib/api.ts`
