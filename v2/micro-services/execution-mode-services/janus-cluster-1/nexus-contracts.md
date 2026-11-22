---
name: Janus Cluster — Nexus Contracts
code: janus-cluster-1-nexus-contracts
version: 1.1
status: in-review
last_updated: 2026-11-20
---

# Janus Cluster — Nexus Contracts

How other clusters, the Janus console, intake-1 and Digital Teammates (DTs) call janus-cluster-1. This is the **as-built** contract of 2026-11-20. The authoritative sources are the capability manifests in `charts/gateway-1/files/capabilities/*.yaml` (request schemas) and the Go types in `shared/contract` (answers); this file records them for callers and marks what is not verified.

**Outbound decisions are not made through Nexus.** Whether a DT Dynamo worker's outbound call is allowed is decided by `outbound-policy-1` as an Envoy external-authorization (ext_authz, gRPC) service, called by `outbound-gateway-1` on every call; no caller sends a decision request through `Execute`. What `outbound-policy-1` does offer through Nexus is two **read-only rate-limit usage capabilities** (`getConnectionRateLimitUsage` for a tenant, `systemGetConnectionRateLimitUsage` for platform staff) and the phase 0 stub `describePolicy` (see "Other components" and "Outbound path"). The worker-facing HTTP API and the usage report to the registry are listed under "Outbound path (not Nexus)" so a caller knows they are separate.

## Endpoint and operations

| | |
| --- | --- |
| Nexus endpoint | `ob1-nexus-janus-cluster-1-endpoint-1` (never versioned; its server-assigned id is delivered to callers in a Secret, and the HTTP path uses that id, not the name) |
| Service | `ConnectionServiceV1` |
| Operations | `Execute` and `DescribeCapabilities` |
| STS audience | `urn:budy:nexus:ob1-nexus-janus-cluster-1-endpoint-1:ConnectionServiceV1` |
| Temporal namespace | `ob1-temporal-janus-cluster-1-ns-1` |
| Gateway worker | `gateway-1`, task queue `janus-cluster-1-gateway-1-tq`, workflow `GatewayExecuteWorkflow` |
| Components behind it | `connection-registry-1` (25 capabilities), `publish-1` (3), `outbound-policy-1` (3: 2 usage reads and the `describePolicy` stub), `vault-manager-1` (1). 32 in all (`shared/contract/components.go`; the manifests in `charts/gateway-1/files/capabilities/` agree) |

`Execute` takes the envelope below and returns `{ok, data?, error?: {code, message}}`. The caller's **tenant, user, scope type and session boundary come only from the verified STS token**; a payload never carries a tenant. `DescribeCapabilities` returns the capability list and, on request, each capability's JSON Schema; it needs a valid token and nothing else.

### Request envelope

```json
{
  "component": "connection-registry-1",
  "capability": "requestConnection",
  "payload": { "typeCode": "google-calendar", "reason": "Book the sales calendar" },
  "idempotencyKey": "optional, see below",
  "auth": { "token": "<STS access token>" }
}
```

The gateway validates `payload` against the capability's JSON Schema (every schema is closed: `additionalProperties: false`), starts a `GatewayExecuteWorkflow`, and runs the component as a child workflow on its own task queue. Unknown capability: `UNIMPLEMENTED`.

### Result envelope and error codes

| `error.code` | Meaning | Retry? |
| --- | --- | --- |
| `UNAUTHORIZED` | The token is missing, expired or not accepted. | Fetch a new token, then retry once. |
| `PERMISSION_DENIED` | The token is valid but the caller may not call this capability (wrong scope, session boundary too low, not an internal caller). Surfaced to Temporal as a non-retryable application failure. | No. |
| `INVALID_ARGUMENT` | The request failed schema or business validation. The message starts with the field (`reason: ...`, `name: ...`, `type_retired: ...`, `conflict: ...`). | No: fix the request. |
| `NOT_FOUND` | The connection, type or link does not exist for this caller (a tenant cannot see another tenant's connection; the usage read answers the same for another tenant's connection as for one that does not exist). | No. |
| `FAILED_PRECONDITION` | A stale `expectedUpdatedAt` (the row changed since it was read), or a concurrent write lost. Only the catalog editor capabilities and `systemSetConnectionRateLimits`. | Reload, then retry with the new version. |
| `UNAVAILABLE` | A dependency is not ready or not configured (no database, `CONNECT_BASE_URL` unset, a name could not be chosen after 5 clashes). | Yes, with backoff. |
| `INTERNAL` | Unexpected failure. | Once, with backoff. |
| `UNIMPLEMENTED` | The capability is not offered by that component. | No. |

A failed gateway call can also surface as an HTTP 500 from Temporal's Nexus handler **instead of** a result envelope, for example `Workflow execution is already running` (see idempotency).

## Calling `Execute`: asynchronous, with a callback

`Execute` is a workflow-run operation. `POST <temporal frontend>:7243/nexus/endpoints/<endpoint id>/services/ConnectionServiceV1/Execute?callback=<url>` does not return the result:

1. Temporal answers **201** with `{"token": "<operation token>"}` immediately (a 200 with the result is also valid and is used as is).
2. When the operation finishes, Temporal **POSTs the result** to the `callback` URL with headers `Nexus-Operation-Token` (must equal the token from the 201) and `Nexus-Operation-State` (`succeeded`, `failed` or `canceled`). On `succeeded` the body is the result envelope above.
3. The caller must register the callback **before** sending the request (the completion can arrive before the 201).

Requirements for a caller:

- A **callback listener**, reachable from Temporal's history service, on its own port (the Janus callers use 3001) with a **per-call signed URL** so only a call this process started can be completed. One replica per callback Service, or a shared signing key.
- The callback address must be in Temporal's `component.callbacks.allowedAddresses` (eks-stack, `temporal-cluster-3` values). Janus callers already listed: `console-1-callback` and `janus-intake-1-callback`, in `ob1-tf-eks-de-v2-janus-1-ns-1`, port 3001. `outbound-policy-1` makes no Nexus calls and has no callback listener (its audit goes to S3 and its usage report to the registry over HTTP, see "Outbound path (not Nexus)").
- Network policy: egress to the Temporal frontend on 7243 (and the STS for tokens), and ingress to the callback port from Temporal's history service. In an Istio namespace with an `ALLOW` AuthorizationPolicy on the caller, the policy must also admit Temporal's service account (`ob1-acd-eks-temporal-cluster-3-sa-1`) on the callback port, or Temporal gets a 403 and reports "handler error (UNAUTHORIZED)".
- Send `Operation-Timeout` in **whole seconds**, and make the local wait no shorter than it. intake-1 waits 10 s per try (up to 3 tries) and the console 20 s for reads and longer for writes. The registry's default execution timeout is 30 s (`defaults.executionTimeout` in the manifests).
- Callbacks are delivered at least once; a repeat or late callback for a finished call is acknowledged and dropped.

## Idempotency and workflow ids

The gateway derives the **workflow id** from the tenant, the user, the capability, the session boundary and either `idempotencyKey` or a hash of the payload. Consequences for callers:

- **Two identical calls in flight at once share a workflow id** and the second fails with `Workflow execution is already running` (HTTP 500). This includes a retry after a timeout and a page that polls while it reads. **Send a fresh `idempotencyKey` on every try of a call that is only a read** (the console and intake-1 send a random one per try).
- **For a write that must land once, send the same key on every retry** so the retry finds the same run (the key becomes the workflow id). The registry also keeps its own idempotency for writes (below).
- The registry reads `idempotencyKey` from the call; for the catalog editor writes it is the audit's replay key, otherwise `run:<workflow run id>`. A key reused for a different request (caller, capability or payload) is refused with `INVALID_ARGUMENT` `idempotencyKey: ...`.

## Scope and session rules

| Kind | Token scope | Session boundary | Capabilities |
| --- | --- | --- | --- |
| Type reads | any valid token | any | `describeConnectionTypes`, `listConnectionTypes`, `getConnectionType` (tenant-shaped answers: no `normaliser`, `updatedAt`, `links` or `activeProvider`; they do carry `outbound` and `rateLimits`) |
| Tenant | Tenant (`tenantId` in the token) | any | `listConnections`, `getConnection`, `listConnectionRevisions`, `listConnectionAudit`, `listPublications`, `createConnection`, `requestConnection`, `revokeConnection`; `describePublications` (publish-1); `getConnectionRateLimitUsage` (outbound-policy-1) |
| System reads | Platform | any | `systemListConnectionTypes`, `systemListProviders`, `systemConnectionTypeUsage`, `systemCheckTypeProvider`, `systemListCatalogAudit`, `describeVaultState`; `systemGetConnectionRateLimitUsage` (outbound-policy-1; a viewer may read it) |
| System writes (catalog editor) | Platform | `editor` or `admin` (checked by the registry itself) | `systemUpsertConnectionType`, `systemSetConnectionTypeState`, `systemDeleteConnectionType`, `systemSetTypeProvider`, `systemRemoveTypeProvider`, `systemSetConnectionRateLimits` |
| Internal | Platform, caller's user id in the registry's `INTERNAL_CALLERS` (`janus-intake-1`; the de-v2 values still list `janus-outbound-policy-1` too, which calls no internal capability since `recordCredentialUse` was removed) | any | `completeConnection`, `inspectConnection`, `setConnectionMetadata` |
| Publishing service | the publishing service's identity, in a session of the publication's tenant | any | `registerPublication`, `retirePublication` |

Session boundaries are `viewer`, `editor` and `admin`, ordered. Janus enforces `editor` on the catalog writes and on `systemSetConnectionRateLimits` in the registry (not only in the console) and on the console's Connect action (console only, see "console-1"). The two usage reads check scope only: `getConnectionRateLimitUsage` refuses a platform token and `systemGetConnectionRateLimitUsage` a tenant token, both `PERMISSION_DENIED`.

## Capabilities: `connection-registry-1`

Every call is `Execute` with `component: "connection-registry-1"`. Ids: connection ids are `conn_<ULID>`. Timestamps are RFC 3339.

### Connection types (reads)

| Capability | Payload | Result |
| --- | --- | --- |
| `describeConnectionTypes`, `listConnectionTypes` | none | `{connectionTypes: ConnectionType[]}` |
| `getConnectionType` | `code` (1-64) | `ConnectionType` |

`ConnectionType` (tenant shape): `id`, `code`, `name`, `description`, `category`, `credentialKind` (`oauth2` \| `api_key` \| `basic` \| `bearer`), `host?`, `pathPrefix?`, `scopes?`, `defaultScopes[]`, `placement {in: header\|query\|context, name?, format?}`, `outbound?` (the outbound credential spec: `mode` `inject` \| `context`, `credential[{in: header\|query, name, value}]`, `staticHeaders?`, `stripHeaders?`; absent when the type has none, then `placement` applies), `rateLimits[]?` (see "Rate limits"; absent when the type has none), `state` (`active` \| `retired`). Platform-only fields: `normaliser?`, `updatedAt`, `links[]`, `activeProvider?`. The provider behind a type is **not** shown to tenants. Retired types stay readable.

### Tenant reads

| Capability | Payload | Result |
| --- | --- | --- |
| `listConnections` | `typeCode?`, `state?` (`pending` \| `active` \| `needs-reauth` \| `revoked`), `limit?` (1-200), `cursor?` | `{connections: Connection[], nextCursor?}` |
| `getConnection` | `connectionId` | `Connection` |
| `listConnectionRevisions` | `connectionId` | `{revisions: [{revision, vaultPath?, createdAt, createdBy}]}`, newest first; versions and times, never values |
| `listConnectionAudit` | `connectionId?`, `limit?` (1-200) | `{entries: [{at, connectionId, actor, action, runId?, activity?, decision?}]}`, newest first. Holds the registry's own lifecycle rows (created, link minted, completed, metadata changed, revoked, deleted at the provider). Per-call outbound decisions are **not** here: they go to the outbound audit bucket (see "Outbound path (not Nexus)"). |
| `listPublications` | `automation?`, `limit?` (1-200) | `{publications: [{id, tenant, automation, activities{activityId: connectionId[]}, state, refusalReason?, publishedAt}]}` |

`Connection`: `id`, `tenant`, `name`, `typeCode`, `providerCode`, `providerRef?`, `state`, `currentRevision`, `host?`, `pathPrefix?` (generic types), `createdBy`, `createdAt`, `updatedAt`, `lastUsedAt?` (when the outbound path last put the connection's credential on an allowed call; reported about once a minute, absent when never used), `rateLimitOverrides?` (`[{name, limit}]`: limits lowered for this connection, see "Rate limits"), `reason?` (why it was requested; empty on older rows), `metadata?` (a string map for display, see `setConnectionMetadata`). No secret value is ever in an answer.

### Tenant writes

| Capability | Payload | Result |
| --- | --- | --- |
| `requestConnection` | `typeCode` (1-64), `reason` (required, 1-500, plain text, no control characters), `idempotencyKey?` (up to 128), `host?` (up to 253) and `pathPrefix?` (up to 200) for generic types, `forceNew?` (boolean, or the strings `"true"`/`"false"`) | `{connection, link: {url, message, expiresAt}, reused, reusedFromRequestedAt?}` |
| `createConnection` | `typeCode`, `name` (1-200, unused for the tenant and type in any state, else `name: ...`), `host?`, `pathPrefix?` | `{connection, collection: {mode: form\|redirect, intakeSession?, intakeUrl?, connectUrl?, expiresAt}}` |
| `revokeConnection` | `connectionId` | `Connection` (state `revoked`) with `providerDeletion`: `not_needed` (nothing at a provider), `done` (a Nango connection was deleted in Nango, or already gone) or `pending` (the provider-side deletion failed and is kept; revoking again retries it). The revoke itself succeeded in all three. Queues destruction of the stored secret versions; idempotent |

`requestConnection` is what callers use. It creates a **pending** connection and mints a link **the user opens** to finish it (a form for `api_key`, `basic` and `bearer`; the provider's redirect for `oauth2`). Rules:

- There is **no name**: the registry names and numbers connections per tenant and type. Types with a fixed host: `Google Calendar`, `Google Calendar 2`. Generic types (no fixed host): `<Type name> – <host><path>` (the path only when it is not empty or `/`), for example `API key – welcomehome.com`, with a number only on a repeat of the same type, host and path. A number is never reused, even after a revoke. A request that still sends `name` is refused (`name: not accepted`).
- **Reuse.** If the same user already has a connection of that type (and host and path prefix) still `pending` from the last 60 minutes, the answer is a **fresh link for that same connection** with `reused: true` and `reusedFromRequestedAt`, and `link.message` begins by saying so. Tell the user it is the same pending connection. Older links to it stay valid until they expire.
- `forceNew: true` starts another connection and leaves the pending one as it is; use it only when the user explicitly asks for another.
- **The same `idempotencyKey` for the same type always finds the same connection again** (a retry), even with `forceNew`, and mints a fresh link; it is not reported as a reuse.
- The link lives **60 minutes**, its session is single use, and it only lets the holder store a credential into this one pending connection. Pass `link.message` and `link.url` to the user unchanged, **including the `#` fragment**. A refused type is `INVALID_ARGUMENT` `type_retired: ...`.
- `reason` is kept on the connection and in the audit.
- Fails `UNAVAILABLE` while the registry has no `CONNECT_BASE_URL`; `UNAVAILABLE` `could not pick a free connection name; try again` after 5 name clashes.

### Internal capabilities

| Capability | Caller | Payload | Result |
| --- | --- | --- | --- |
| `completeConnection` | intake-1, oauth-provider-1 | `connectionId`, `providerRef?`, `vaultPath?` (up to 512) with `vaultVersion?` (>= 1), `actor?` | `Connection` (now `active`). A connection that is not `pending` is refused (that makes a session single use); repeating the same completion is harmless. |
| `inspectConnection` | intake-1 | `connectionId` | `{connection, type, provider: {code, kind, integrationKey?}}` (metadata only; never a provider reference) |
| `setConnectionMetadata` | `INTERNAL_CALLERS`, platform scope | `connectionId`, `set?` (1-20 keys), `remove?` (up to 20 keys); at least one, no key in both | `{connectionId, metadata}` after the change |

`setConnectionMetadata`: keys match `^[a-z][a-z0-9_.-]{0,63}$`; a value is plain text of 1-500 characters without control characters; at most 20 keys per connection; repeating a call changes nothing; the change is audited with key names only. **Metadata is shown to tenants and platform alike and is never a place for a secret.** Nothing writes it yet (for example an `account_label` from a provider is the intended later use).

### System and catalog editor (platform scope)

Reads (any session boundary): `systemListConnectionTypes` (`{connectionTypes}` with `links`, `normaliser`, `updatedAt`, `activeProvider`), `systemListProviders` (`{providers: [{id, code, kind, credentialKinds[], state, name, configRef, updatedAt?}]}`; `configRef` is a Vault path, never a value), `systemConnectionTypeUsage` (`{usage: [{typeCode, tenants, connections, active, providers[{providerId, connections, active}]}]}`).

Writes (session boundary `editor` or `admin`; each is audited, with the row before and after, and replays by its idempotency key). Providers are **not** editable through Nexus: a provider is added in code through a registry migration. `systemSetConnectionRateLimits` is listed with them because it has the same admission, although it changes a connection, not a catalog row.

| Capability | Payload | Result |
| --- | --- | --- |
| `systemUpsertConnectionType` | `id` (`^[a-z0-9][a-z0-9-]{0,62}$`), `name` (1-120), `description` (required, 1-1000, plain text, newlines allowed), `credentialKind`, `placement {in: header\|query, name, format}` (format holds exactly the kind's placeholder: `{token}` for oauth2 and bearer, `{key}` for api_key, `{base64(username:password)}` for basic), `category?`, `defaultScopes?` (up to 50), `normaliser?`, `host?` + `pathPrefix?` (both or neither), `outbound?` (the outbound credential spec: `mode` `inject` \| `context`, `credential` 1-5 entries `{in: header\|query, name, value}` for inject, `staticHeaders?` up to 10, `stripHeaders?` up to 20; `context` is refused with `credential_mode_context_not_supported` until it is built), `rateLimits?` (up to 8, see "Rate limits": absent or `null` keeps an existing type's limits, an explicit `[]` removes them), `expectedUpdatedAt?` | the type as stored, with its links. `credentialKind` cannot change once a connection of the type exists. A type with no description is refused on edit until one is given. When an existing type's limits change, its connections' overrides are reconciled in the same write (clamped down to the new limit, or dropped when the limit is gone or became type-scoped), each with an audit row. |
| `systemSetConnectionTypeState` | `id`, `state` (`active` \| `retired`), `expectedUpdatedAt?` | the type with its links. A retired type is refused for new connections; existing ones keep working. |
| `systemDeleteConnectionType` | `id`, `expectedUpdatedAt` (required) | `{id, deleted}`. Refused (`id: ...`) if any connection of the type exists in any state: retire it instead. Deletes its links. |
| `systemSetTypeProvider` | `connectionTypeId`, `providerId`, `state` (`active` \| `available` \| `deprecated` \| `retired`), `settings?` `{integrationKey}` (`^[A-Za-z0-9._-]*$`, up to 128), `expectedUpdatedAt?` | the link as stored. `active` demotes the type's other active link in the same transaction; only **new** connections use the new provider. `integrationKey` is required for `nango-1` and refused for any other provider. |
| `systemRemoveTypeProvider` | `connectionTypeId`, `providerId`, `expectedUpdatedAt?` | `{connectionTypeId, providerId, removed}`. A link any connection uses cannot be removed: retire it. |
| `systemSetConnectionRateLimits` | `connectionId`, `rateLimitOverrides` (up to 8 `{name: ^[a-z0-9][a-z0-9-]{0,31}$, limit: 1 to 1000000000}`; an empty list removes every override), `expectedUpdatedAt?` | the connection as stored, with `rateLimitOverrides` (absent when none). The connection is found by id in any tenant. A name the type does not have, a type-scoped limit, a limit above the type's or a name listed twice is `INVALID_ARGUMENT`; audited (subject `connection:<id>`). |
| `systemCheckTypeProvider` (read only, any boundary) | `connectionTypeId`, `providerId`, `integrationKey?` (checks that key before the link is saved) | `{ok, checks: [{name, ok, detail}]}`; for a Nango link: the integration exists, is for this type, and allows the type's default scopes. Details are fixed sentences, never Nango's text. |
| `systemListCatalogAudit` (read only, any boundary) | `limit?` (1-200, default 50), `cursor?` | `{entries: [{id, at, actor, action, subject, before?, after?, requestId?}], nextCursor?}`, newest first |

`expectedUpdatedAt`: when sent it must equal the stored `updatedAt`, else `FAILED_PRECONDITION`.

### Rate limits (outbound)

A connection type carries the outbound rate limits of its service (`ConnectionType.rateLimits`, edited with `systemUpsertConnectionType`), and a connection may lower some of them (`Connection.rateLimitOverrides`, set with `systemSetConnectionRateLimits`). The limits are enforced by `outbound-policy-1` on the outbound path, not by Nexus; this section is the shape callers read and write.

| Object | Fields |
| --- | --- |
| `RateLimit` | `name` (1-32 lowercase letters, digits or dashes, unique within the type), `scope` (`connection`: one counter per connection; `type`: one counter shared by every connection of the type, platform-wide), `limit` (1 to 1000000000 calls), `window` (a whole number and one unit of `s`, `m`, `h` or `d`, from `1s` to `1d`, for example `10s`, `1m`, `24h`, `1d`). At most 8 per type. |
| `RateLimitOverride` | `name`, `limit`. Lowers the limit of a **connection-scoped** limit of the connection's type, never raises it; same window. |

**Usage reads** (live, on request; read-only: they count no call, and they are never polled, the console reads once per button press). Both take `{connectionId}` (`^[A-Za-z0-9_-]{1,64}$`) and answer `ConnectionRateLimitUsage`.

| Capability | Scope | What it lists |
| --- | --- | --- |
| `getConnectionRateLimitUsage` | Tenant, one of the tenant's own connections (any other id is `NOT_FOUND`, the same as an id that does not exist) | The connection's effective **connection-scoped** limits only (a shared limit's counter holds other tenants' calls). |
| `systemGetConnectionRateLimitUsage` | Platform, any session boundary | Every effective limit including the shared ones, and the connection's tenant. |

Answer: `{connectionId, typeCode, state, tenant?, source, at, limits: [{name, scope, limit, window, used, retryAfterSeconds}]}`. `tenant` is set on the platform read only. `limits` are the connection's effective limits (its type's with its overrides applied), in the type's order; an empty list means the type has no limit. `used` is the sliding-window estimate the limiter itself decides with, rounded up, so it can exceed `limit` right after a limit was lowered (a reader clamps what it shows). `retryAfterSeconds` is 0 when a call would be admitted now, otherwise when the limit next admits one (whole seconds, at least 1), the figure a refused caller is told. `at` is when the counters were read (UTC, the answering pod's clock); a reader showing usage must show it. `source` is `redis` (counted) or `unavailable` (the counter store is not configured or did not answer: the limits are listed with `used` and `retryAfterSeconds` zero and no counts, and calls are still limited meanwhile).

Errors: `PERMISSION_DENIED` (wrong scope), `INVALID_ARGUMENT` (`connectionId: ...`), `NOT_FOUND`, `UNAVAILABLE` (the connection could not be read).

## Other components

| Component | Capability | Caller | Notes |
| --- | --- | --- | --- |
| `publish-1` | `describePublications` | Tenant scope | Same answer as `listPublications`. |
| `publish-1` | `registerPublication` | The publishing service only, in a session of the publication's tenant | Required: `publicationId`, `tenant` (must be the session's), `dt`, `automation` (the publication's root workflow type, a `pwf_` id: a publication is one parent workflow). Optional: `activities` (activity id to connection ids, up to 500 activities, 50 connections each), `workflows[]` (the automation's other published workflows, up to 100), `activityWorkflows` (activity id to the workflow that calls it, up to 500), `mission` (the `msn_` it is filed under), `worker` `{name}` (`^dynamo-worker-[0-9]+$`, up to 63: the DT's Dynamo worker that runs it; `namespace` and `serviceAccount` are still accepted and ignored), `hosts[]` (up to 200), `rules`. Validates that every connection belongs to the tenant and is `active`, records the publication and writes its tuples to Janus's OpenFGA. Idempotent per `publicationId`. A request naming a missing or inactive connection is recorded as refused with the reason and writes nothing. **Without `worker.name` the publication is registered but every outbound call of its activities is refused** (no run token is issued for it). |
| `publish-1` | `retirePublication` | The publishing service only | `publicationId`. Marks it retired and deletes the tuples no other live publication of the automation needs; idempotent. |
| `vault-manager-1` | `describeVaultState` | Platform scope | What it keeps in the Janus Vault (KV mounts, fixed policies), the queued destroy requests and the last reconcile; never a secret value. |
| `outbound-policy-1` | `describePolicy` | any | Phase 0 stub: answers `stub: true`, takes no input. Outbound decisions are not made through Nexus. |
| `outbound-policy-1` | `getConnectionRateLimitUsage` | Tenant scope | Live rate-limit usage of one of the tenant's connections (see "Rate limits"). |
| `outbound-policy-1` | `systemGetConnectionRateLimitUsage` | Platform scope, any boundary | Live rate-limit usage of any connection (see "Rate limits"). |

Not published and not callable by tenants or DTs: `createConnection`, `completeConnection`, `registerPublication`, `retirePublication` and every `system*` capability (the catalog lint fails the build if a DT tool names any of them). The DT tools below include none for the rate-limit usage read; the console is its only caller today.

## DT tools and skills (catalog path `/janus`, audience global)

Published by `janus-catalog-1` as `Tool` and `Skill` resources. Every tool calls `Execute` on this endpoint as the signed-in user, so the gateway fixes tenant and user from the token; **no tool has a tenant argument**. Parameters are strict and every parameter is required (a tool template can only send strings).

| Tool | Capability | Parameters |
| --- | --- | --- |
| `list_connection_types` | `listConnectionTypes` | none |
| `get_connection_type` | `getConnectionType` | `code` |
| `list_connections` | `listConnections` | none |
| `list_connections_by_type` | `listConnections` | `typeCode` |
| `list_connections_by_state` | `listConnections` | `state` |
| `get_connection` | `getConnection` | `connectionId` |
| `list_connection_revisions` | `listConnectionRevisions` | `connectionId` |
| `list_connection_audit` | `listConnectionAudit` | `connectionId` |
| `list_publications` | `listPublications` | none |
| `list_publications_for_automation` | `listPublications` | `automation` |
| `revoke_connection` | `revokeConnection` | `connectionId` (only on an explicit user request for that exact connection) |
| `request_connection` | `requestConnection` | `typeCode`, `reason` (one concrete sentence on why; required), `forceNew` (`"true"` or `"false"`; `"false"` unless the user explicitly asked for another connection) |

`request_connection` sends `idempotencyKey` from the runtime placeholder `{{runtime.workflowToolCallIdempotencyKey}}`, so a retried tool call lands on the same connection. Its answer is `requestConnection`'s: the DT shows `link.message` and `link.url` to the user unchanged and, when `reused` is true, says it is the same pending connection from earlier.

Skills: `janus-using-connections` (plan around the user's connections, request the missing ones, hand over the link, read back), `janus-diagnosing-connections` and `janus-publishing-with-connections`.

## intake-1 public HTTP (the connect page)

Routes under `/v1/connections` on the public API host, routed to intake-1 by api-gateway-1 **without an app bearer token**: the credential is the **signed intake session** in the body (`capability` auth), except the webhook. All are `POST` with `Content-Type: application/json`; each answers `Cache-Control: no-store` and a closed Content-Security-Policy. Errors are `{"error": {"code", "message"}}`; a link that is not valid, expired (410) or already completed (409) says so without revealing why a forged one failed.

| Route | Request | Success |
| --- | --- | --- |
| `session/inspect` | `{session}` | 200 `{connection: {id, name, state}, type: {code, name, credentialKind, host?, pathPrefix?}, provider: {code, kind}, mode: form\|redirect, fields: [{name, label, input: secret\|text, required}], expiresAt}` |
| `credentials` | `{session, fields}` (the exact field set of the kind: `key`; `username` + `password`; `token`; each up to 4 KiB, no control characters) | 201 `{state: "active"}` |
| `session/connect` | `{session}` | 200 `{connectUrl, expiresAt}` (the provider's hosted connect page, created now so it is fresh) |
| `session/status` | `{session}` | 200 `{state, completed, typeName, completedAt?}` |
| `webhooks/nango` | Nango's event | verified by the `X-Nango-Hmac-Sha256` header: hex HMAC-SHA256 of the raw body keyed with Nango's **webhook signing key** (a key of its own, not the API key); a good event completes the connection |

Errors seen by the page: `session_invalid` (401), `session_expired` (410), `already_completed` (409), `connection_not_found` (404), `invalid_request` and `unsupported_kind` (400), `not_a_redirect_connection` (400), `provider_not_configured` (503), `provider_unavailable` (502), `registry_unavailable` (503), `vault_unavailable` (502), `origin_not_allowed` (403), `unsupported_media_type` (415) and `rate_limited` (429, with `Retry-After`).

## console-1 HTTP API (platform console)

The console's own browser API, behind the console-kit session cookie. It calls this endpoint **as the signed-in user** with that user's token. A tenant session gets 403 from `/api/system/*`, a platform session gets 403 from every tenant route; neither reaches the gateway. A gateway failure reaches the browser as a status class only (401, 403, 404, 503), never the gateway's text.

| Route | Scope | Boundary | Capability |
| --- | --- | --- | --- |
| `GET /api/connection-types`, `/:typeCode` | tenant | any | `listConnectionTypes`, `getConnectionType` |
| `GET /api/connections`, `/:connectionId` | tenant | any | `listConnections`, `getConnection` |
| `GET /api/audit`, `GET /api/publications` | tenant | any | `listConnectionAudit`, `listPublications` |
| `POST /api/connections/request` (`Idempotency-Key` required; body `{typeCode, reason, host?, pathPrefix?, forceNew?}`) | tenant | `editor` | `requestConnection` |
| `DELETE /api/connections/:connectionId` (empty body `{}`, `Idempotency-Key` required) | tenant | `admin` (console only) | `revokeConnection` |
| `GET /api/connections/:connectionId/rate-limit-usage` | tenant | any | `getConnectionRateLimitUsage` |
| `GET /api/system/types`, `/providers`, `/usage` | system | any | `systemListConnectionTypes`, `systemListProviders`, `systemConnectionTypeUsage` |
| `GET /api/system/audit` | system | `viewer` | `systemListCatalogAudit` |
| `PUT /api/system/types/:id`, `/:id/state`; `DELETE /api/system/types/:id` | system | `editor` | `systemUpsertConnectionType`, `systemSetConnectionTypeState`, `systemDeleteConnectionType` |
| `PUT` and `DELETE /api/system/types/:id/providers/:providerId`; `POST .../check` | system | `editor` | `systemSetTypeProvider`, `systemRemoveTypeProvider`, `systemCheckTypeProvider` |
| `GET /api/system/connections/:connectionId/rate-limit-usage` | system | `viewer` (any platform boundary) | `systemGetConnectionRateLimitUsage` |
| `PUT /api/system/connections/:connectionId/rate-limits` (body `{rateLimitOverrides: [{name, limit}], expectedUpdatedAt?}`) | system | `editor` | `systemSetConnectionRateLimits` |
| `GET /api/system/outbound-activity?window=&class=&tenant=&code=&q=&run=&around=`, `GET /api/system/outbound-activity/summary?window=&tenant=&around=` | system | `viewer` | none: the console reads the outbound audit bucket directly with its own read-only role (see "Outbound path (not Nexus)") |

Every console write requires an `Idempotency-Key` that it forwards as the gateway's `idempotencyKey`; the catalog editor's writes and the rate-limit override write are also optimistic (`expectedUpdatedAt`, 409 on a stale edit). The two Outbound activity routes are the only console routes that do not call the gateway: they answer from the audit bucket and fail with fixed codes (`503 audit_not_configured` when no bucket is set up, `503 audit_unavailable` for a failed read, `400 invalid_query` for a refused filter); a tenant session gets 403 before the bucket is read.

## Outbound path (not Nexus)

These interfaces belong to the outbound path of DT Dynamo workers. They are listed so callers do not look for them in `Execute`. The source of truth is `shared/contract/outbound.go`, `rate_limit.go` and `outbound_audit.go`.

| Interface | Between | Notes |
| --- | --- | --- |
| ext_authz (gRPC, port 9001) | `outbound-gateway-1` (Envoy) to `outbound-policy-1` | The decision for every outbound call: run token, the activity's grant on the connection (Janus's OpenFGA), rules, rate limits, then the credential, which is read just in time from the Janus Vault or Nango and injected by the gateway. No fail-open: if the policy service is unavailable the call is refused. A refusal answers the worker with the header `x-janus-decision: <code>` and the body `{"error": "<code>", "message": "<reason>"}`. |
| Rate-limit refusal | the same | HTTP 429, code `rate_limited`, body `{error, message, limit {name, scope, limit, window}, retryAfterSeconds}` and the headers `Retry-After`, `RateLimit-Policy: "<name>";q=<limit>;w=<window seconds>` and `RateLimit: "<name>";r=0;t=<seconds>`. When several limits are exhausted, the one with the longest wait is reported. A caller must not retry before `retryAfterSeconds`; the worker hooks turn it into a retryable Temporal failure whose next retry delay is that wait. A vendor's own 429 reaches the caller unchanged. |
| Worker API (HTTP, port 8090, plain HTTP inside the mesh) | DT Dynamo worker hook to `outbound-policy-1` | `POST /v1/run-tokens` with `Authorization: Bearer <projected service account token, audience janus-outbound-policy-1>` and `{runId, workflowId?, workflow, activity, namespace?}`; answers `{token, expiresAt, tenant, automation, publication?, rootRunId?}` (a run token bound to one activity, signed by STS, 5-minute lifetime). Errors are `{code, message}`: `unauthenticated` (401), `invalid_request` (400), `not_published`, `wrong_worker`, `ambiguous`, `wrong_namespace`, `run_not_live` (403) and `unavailable` (503, retry). `GET /v1/trust-bundle` answers the PEM of the Janus root CA, unauthenticated; the worker images already carry the roots, so it is for export and checks. The worker adds `x-janus-run-token`, `x-janus-run-id` and `x-janus-activity` to each outbound request; the gateway strips every `x-janus-*` header before the request leaves. `x-janus-connection: <connection id>` selects one connection when an activity is granted more than one for the same host and path; without it such a call is refused `ambiguous_connection`. |
| Connection usage (HTTP, the registry's usage port 8081) | `outbound-policy-1` to `connection-registry-1` | `POST /v1/connection-usage` with `{connections: [{connectionId, lastUsedAt}]}` (up to 1000), at most once a minute, no authorization header (the port admits only outbound-policy-1's mesh identity). The registry keeps the latest time per connection and shows it as `lastUsedAt`. |
| Outbound audit (S3) | `outbound-policy-1` writes, `console-1` reads | Decisions and run-token outcomes as gzipped NDJSON: `deny/` (always) and `allow/` (only with `audit.capture` `all`), then `dt=YYYY-MM-DD/hour=HH/<pod>-<millis>-<seq>.ndjson.gz`; one object per pod per flush, at most every 5 minutes. Identical denies in one flush collapse into one record with a `count`. Retention is the bucket's lifecycle rule: set per class prefix (`deny/`, `allow/`) where the bucket is declared, not in code. No header, token, credential or query string is recorded. Read by the console's system Outbound activity page. |
| Cache invalidation (Postgres `LISTEN/NOTIFY`, channel `janus_registry_changed`) | `connection-registry-1` triggers to `outbound-policy-1` | After any change to what the outbound path reads the registry notifies and `outbound-policy-1` drops its caches (30 seconds otherwise), so a revoke or a retire applies to the next call. |

## Timeouts

| Where | Value |
| --- | --- |
| Capability execution timeout | 30 s (`defaults.executionTimeout` in each manifest) |
| `Operation-Timeout` header | whole seconds, never shorter than the caller's local wait |
| Link / intake session lifetime | 60 minutes (`requestConnection`) |
| Reuse window for a pending connection | the same 60 minutes |

## Caller guidance

```go
// Go: a read that may be retried. A new idempotency key per try, so a retry never collides with a run still going.
body := Execute{Component: "connection-registry-1", Capability: "inspectConnection",
    Payload: json.RawMessage(`{"connectionId":"conn_..."}`),
    IdempotencyKey: randomKey(), Auth: Auth{Token: token}}
cbURL, wait, release := callbacks.Register()        // before the request
defer release()
resp := post(endpoint + "?callback=" + url.QueryEscape(cbURL), body, "Operation-Timeout: 10s")
if resp.StatusCode == 201 { result = wait(ctx, resp.Body) }  // the completion arrives at cbURL
// result is {ok, data | error{code, message}}
```

- A write that must land once (a catalog edit, `requestConnection`): send **one** key per intended action and reuse it on retries; do not retry `INVALID_ARGUMENT` or `PERMISSION_DENIED`.
- `FAILED_PRECONDITION`: reload the row and retry with its new `updatedAt`.
- Never log `link.url`, `link.message`, an intake session, a token or a credential: the link's fragment is a one-time bearer for entering a secret.

## Versioning policy

- The endpoint (`ob1-nexus-janus-cluster-1-endpoint-1`) is never versioned; the service is `ConnectionServiceV1`. A breaking change is a new service version, not an edited one.
- Capability schemas are **closed**: an added optional field is non-breaking, a removed or renamed field is refused by the gateway for old callers. Example: `requestConnection` dropped `name` and made `reason` required on 2026-11-17; the console, the DT tool and the skills changed in the same release. Changes of 2026-11-17 to 2026-11-20: three capabilities were added (`systemSetConnectionRateLimits`, `getConnectionRateLimitUsage`, `systemGetConnectionRateLimitUsage`), the optional fields `outbound`, `rateLimits` and `rateLimitOverrides` appeared in the type and connection answers and in `systemUpsertConnectionType`, `registerPublication` gained `mission`, `workflows`, `activityWorkflows` and `worker.name`, and `recordCredentialUse` was removed (outbound-policy-1 now reports last use over HTTP, see "Outbound path (not Nexus)"; it was the only caller).
- `shared/contract` (Go) carries the types; the manifests carry the schemas; a component's own test (`capabilitytest.Verify`) fails if its manifest and worker drift.
- Component and chart versions follow changesets (`connection-registry-1`, `contract`, `gateway-1`, `intake-1`, `console-1`, the Janus chart).

## Not verified

- The gateway's exact workflow-id derivation and the maximum length of the envelope's `idempotencyKey` (only `requestConnection`'s key is bounded, at 128) were read from the registry's documentation and callers, not from the gateway's source.
- Which of the error codes Temporal treats as non-retryable beyond `PERMISSION_DENIED` (observed in a failed workflow) was not checked.
- The type reads (`describeConnectionTypes`, `listConnectionTypes`, `getConnectionType`) were read: they need a valid token and no particular scope. `describePublications` and `listPublications` refuse a non-tenant caller with `PERMISSION_DENIED` (read in `components/publish-1`).
- The usage reads' manifests and activity were read in the repository; the answer shapes are those of `shared/contract/rate_limit.go`.
- The registry's `INTERNAL_CALLERS` list in the de-v2 values still names `janus-outbound-policy-1` although it calls no internal capability; the repository's `infra-wiring.md` says only `janus-intake-1` is listed. Neither was checked against a running cluster.
