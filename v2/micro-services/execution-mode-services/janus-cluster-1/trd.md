---
name: Janus Cluster — TRD
code: janus-cluster-1-trd
version: 1.1
status: in-review
last_updated: 2026-11-20
---

# Janus Cluster — TRD

How `janus-cluster-1` is built (see [Not verified](#not-verified) for the few unchecked points): the code layout, configuration, schema, capability shapes, wiring and operations. The requirements are in the [PRD](prd.md), architecture and decisions in the [HLD](hld.md), the caller contract in [nexus-contracts](nexus-contracts.md), the service summary in [info](info.md). The repository's own `docs/content/` keeps the deeper per-component notes this document points at.

**Scope.** Everything that is built and tested: the gateway, the connection registry, the connect page backend (`intake-1`), the console, the catalog editor, the Nango provider, the Janus Vault and OpenFGA wiring, and **outbound enforcement**: `outbound-policy-1` (the ext_authz decision point, the gateway's control plane and the worker API), the Envoy `outbound-gateway-1`, the audit bucket, the rate limits and `janus-redis-1`. The one piece not yet built is **request-content rules**: checking the content of an outbound call (path, method, body) against rules from the publish (D25, D30, D31); it is on the roadmap and its inputs (the rules' compiled form, the publish schema) are designed. The DT Dynamo worker hooks and operator settings are described only where Janus depends on them.

**Status of verification.** Facts below were read from the code, charts and GitOps repositories. Items that could only be inferred are collected under [Not verified](#not-verified).

## Implementation Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language (cluster) | Go 1.26 (one module per component, `go.work` for local work) | Nexus-first clusters are Go; consistent with the platform's shared kit |
| Console | TypeScript on Node 26 (`>=26.13 <27`), Fastify 5, React 19, Vite 8, `@budybot/console-kit` 0.6.0 | The platform console standard; the kit supplies session, STS verification, adapters and the write routes |
| Orchestration | Temporal (Worker Deployment Versioning, **Pinned**); one workflow per component, `<Component>WorkflowV1`, one activity (`Execute`) | A component is only reached through the gateway as a child workflow; behaviour changes by shipping a new build |
| Gateway | Shared kit `budy-common-modules` `go/capability/gateway/{stsauth,dispatch}`, version `capability v0.3.0` | No business logic in `gateway-1`; it loads capability manifests and validates payloads |
| Database | PostgreSQL (`ob1-janus-db-1`), `pgx`, `goose` migrations embedded in the registry image, run by a chart Job | One schema owner (the registry); publish-1 and vault-manager-1 read and write their own tables |
| Secrets | Janus Vault (`janus-vault-cluster-1`, KV v2 mount `janus-connections`); platform Vault for service secrets via VSO | Tenant credentials are isolated from the platform Vault |
| Authorization | OpenFGA (`janus-openfga-1`), model `components/publish-1/authz/janus.fga` | A dedicated instance; the bootstrap Job owns the store and model |
| Third-party credentials | Nango (hosted, `api.nango.dev`) for OAuth | Nango holds the OAuth tokens; Janus holds ids only |
| Outbound gateway | Envoy 1.34.1 (stock image through the ECR Docker Hub cache), a plain de-v2 application; xDS (ADS) served by `outbound-policy-1` with `go-control-plane` 0.14 | No custom Envoy build; TLS listener and certificates change without a restart (D71) |
| Request rules | Open Policy Agent (Rego) embedded in `outbound-policy-1`, base compiled into the image, rules from a ConfigMap (`RULES_DIR`) | Default deny; published rules add to `allow` and `deny` and never define a default (D31, D32) |
| Outbound PKI | Janus Vault PKI engine, mounts `janus-pki-root-1` and `janus-pki-outbound-1`; public suffix list `golang.org/x/net/publicsuffix` (ICANN section) | Keys generated in the Vault; registrable-domain grouping |
| Rate-limit store | Redis (Bitnami chart, `janus-redis-1`), client `go-redis/v9` | Atomic Lua script on the server's clock; no persistence |
| Audit store | S3 (`aws-sdk-go-v2`), SSE-S3, IRSA roles | Write-only for the writer, read-only for the console |
| Packaging | One parameterized `Dockerfile` for every Go component (`COMPONENT`, `BINARY_TARGET`); the console has its own | Non-root, read-only root filesystem, `emptyDir` on `/tmp` |
| Release | changesets, the shared `app-cluster-ci` / `app-cluster-release` workflows (`@v1`) | See [CI/CD and release](#cicd-and-release) |

## Project Structure

```text
janus-cluster-1_repo-1/
├── shared/contract/          MODULE  public contract: endpoint, service, component and capability names, payload types, the intake
│                                     session token, the Nexus callback receiver (nexuscallback/), request validation helpers
├── components/
│   ├── gateway-1/            Go  cmd/worker, internal/worker: thin wiring over the shared gateway kit (manifests from charts/gateway-1/files/capabilities)
│   ├── connection-registry-1/ Go  cmd/worker; internal/{workflow,activities,capabilities,nango,store,usage,worker}; store/migrations/00001..00015
│   ├── intake-1/             Go  cmd/server; internal/{app,config,server,registry,nango,sts,vault}: the connect page's HTTP backend
│   ├── oauth-provider-1/     Go  cmd/server: internal OAuth providers (built, not wired to a provider; see the HLD's open questions)
│   ├── publish-1/            Go  cmd/worker + authz/: registerPublication / retirePublication, writes OpenFGA tuples
│   ├── vault-manager-1/      Go  cmd/worker: the only writer of the Janus Vault's configuration; works the secret-destruction queue
│   ├── outbound-policy-1/    Go  cmd/worker; internal/{policy,extauthz,rules,runtoken,workerapi,certs,xds,registry,vaultauth,clients,
│   │                             cache,cached,ratelimit,auditsink,usage,metrics,activities,capabilities,worker}: the outbound decision point,
│   │                             gateway control plane (certificates, xDS), worker API and the two usage capabilities
│   ├── openfga-bootstrap-1/  Go  cmd/bootstrap: creates the store and writes the model (a Job and a CronJob, not a worker)
│   └── console-1/            TS  src/server (Fastify + console-kit), src/web (React), test/
├── charts/
│   ├── janus-cluster-1/      umbrella chart "janus-cluster-1-repo-1" (the only published chart)
│   ├── <component>/          one sub-chart per component
│   ├── gateway-1/files/capabilities/   one <component>.yaml manifest per routed component
│   └── janus-catalog-1/      Tool and Skill resources published to the context catalog (not a component)
├── deploy/                   janus-vault-bootstrap/, outbound-gateway-1/ (the Envoy bootstrap, the source of truth for the de-v2 copy; `validate.sh` and the `envoy-validate` workflow), outbound-policy-rules/ (examples)
├── configs/runtime/          runtime config manifests (paths fixed by the platform)
├── docs/content/             per-component design and operations notes
└── .github/{components.json,workflows/}   the component catalog (the only thing CI reads about the repo's shape) and two thin workflow callers
```

| Component | Kind | Binary / entry | Ports | Task queue / purpose |
|---|---|---|---|---|
| `gateway-1` | Temporal worker + Nexus handler | `cmd/worker` | health `3000` | `janus-cluster-1-gateway-1-tq`; authenticates, validates, routes |
| `connection-registry-1` | Temporal worker + usage API | `cmd/worker` (`worker` runs; `migrate` argument applies migrations) | health `3000`, usage `8081` (`USAGE_ADDR`) | `janus-cluster-1-connection-registry-1-tq` |
| `publish-1` | Temporal worker | `cmd/worker` | | `janus-cluster-1-publish-1-tq` |
| `vault-manager-1` | Temporal worker | `cmd/worker` | | `janus-cluster-1-vault-manager-1-tq` |
| `outbound-policy-1` | Temporal worker + ext_authz + xDS + worker API | `cmd/worker` | health `3000`, ext_authz `9001` (`EXT_AUTHZ_ADDR`), xDS `9002` (`XDS_ADDR`), worker API `8090` (`WORKER_API_ADDR`), metrics `9464` (`METRICS_ADDR`) | `janus-cluster-1-outbound-policy-1-tq` |
| `intake-1` | HTTP | `cmd/server` | app `8080`, health `3000`, Nexus callback `3001` | none (not a worker) |
| `oauth-provider-1` | HTTP | `cmd/server` | app `8080`, health `3000` | none |
| `console-1` | HTTP | `node` (`src/server/main.ts`) | web `3000` (`CONSOLE_PORT`), Nexus callback `3001` | none |
| `openfga-bootstrap-1` | Job / CronJob | `cmd/bootstrap` | | none |
| `outbound-gateway-1` | Envoy (de-v2 application, not a chart component) | stock image | proxy `3128`, health `8081` | none |
| `janus-redis-1` | Redis (de-v2 application, Bitnami chart) | stock image | `6379` | none |

Naming: every component name ends in `-1` (the generation suffix). The Nexus endpoint is `ob1-nexus-janus-cluster-1-endpoint-1`, service `ConnectionServiceV1`, operations `Execute` and `DescribeCapabilities`, Temporal namespace `ob1-temporal-janus-cluster-1-ns-1`. The Go constant and the chart's derived name must agree (a test enforces it).

## Types and constants (`shared/contract`)

The contract module is the only module tagged for external use. Cross-reference: field documentation is in the HLD; these are the names an implementer needs.

| File | Contents |
|---|---|
| `components.go` | `ComponentConnectionRegistry1`, `ComponentPublish1`, `ComponentOutboundPolicy1`, `ComponentVaultManager1`; `Capabilities(component)` (the names each offers; the manifest test compares them with the YAML): registry 25, publish-1 3, vault-manager-1 1, outbound-policy-1 3, 32 in all; `CapabilityGetConnectionRateLimitUsage`, `CapabilitySystemGetConnectionRateLimitUsage` |
| `connections.go` | capability name constants (including `CapabilitySystemSetConnectionRateLimits`); `Connection`, `ConnectionType`, `TypeProviderLink`, `Provider`, `Placement`, request and response types; `ConnectionsMount = "janus-connections"`; `ConnectionVaultPath(tenant, id)`; `ConnectionReaderRole = "janus-conn-reader"`; `ConnectionReadPolicyGlob = "janus-conn-*-read"`; `MetadataKeyRE`, `MaxMetadataKeys = 20`, `MaxMetadataValue = 500`; `LooseBool` (JSON boolean or the strings `"true"` / `"false"`) |
| `connect_page.go` | the connect page routes: `RouteSessionInspect`, `RouteCredentials`, `RouteSessionConnect`, `RouteSessionStatus` (all `POST /v1/connections/...`), `RouteNangoWebhook` |
| `intakesession.go` | `IntakeSession`, `SignIntakeSession`, `VerifyIntakeSession`, `ErrIntakeSessionInvalid`, `ErrIntakeSessionExpired` |
| `catalog_editor.go` | request and answer types of the `system*` editor capabilities, audit row, limits |
| `connect_page_caps.go` | `inspectConnection` types |
| `credential_spec.go` | `OutboundSpec`, `OutboundCredential`, `OutboundMode*`, the limits of a spec, `CodeCredentialModeContext` |
| `rate_limit.go` | `RateLimit`, `RateLimitOverride`, the scopes, the bounds, `ParseRateLimitWindow`, `ValidateRateLimits`, `ValidateRateLimitOverrides`, `CodeRateLimited`, `RateLimitedBody`, `GetConnectionRateLimitUsageRequest` and its answer |
| `outbound.go` | the worker API (`OutboundAPIPort` 8090, run-token request and answer, error codes `RunToken*`), `PublicationWorker`, `HeaderConnection`, the `x-janus-*` headers, the PKI mount and role names, `OutboundExcludedDomains`, `OutboundHost` |
| `outbound_domains.go` | `CertGroup`, `OutboundCertGroups`, `OutboundCertDomain`, `MaxNamesPerCertificate` (50) |
| `outbound_audit.go` | `OutboundAuditRecord` and its key layout, the capture levels, `ConnectionUsagePath`, `ConnectionUsageRequest`, `RegistryChangeChannel` (`janus_registry_changed`) |
| `vaultstate.go` | the `describeVaultState` answer, including the outbound PKI state |
| `nexuscallback/` | the Go Nexus callback `Receiver` (see [Nexus callback](#nexus-callback-implementation)) |

`Connection` (JSON): `id`, `tenant`, `name`, `typeCode`, `providerCode`, `providerRef?`, `state`, `currentRevision`, `host?`, `pathPrefix?`, `createdBy`, `createdAt`, `updatedAt`, `lastUsedAt?`, `reason?`, `metadata?`, `rateLimitOverrides?`, and, in `revokeConnection`'s answer only, `providerDeletion` (`not_needed`, `done`, `pending`). States: `pending`, `active`, `needs-reauth`, `revoked`. `ConnectionType`: `id`, `code`, `name`, `description`, `category`, `state` (`active` | `retired`), `credentialKind`, `host?`, `pathPrefix?`, `scopes` (kept for old readers) and `defaultScopes`, `placement {in, name, format}`, `outbound?` (the credential spec), `rateLimits?`; **platform scope only**: `normaliser`, `updatedAt`, `links[]`, `activeProvider`. A tenant answer carries no provider.

### ID and key construction

```go
// Connection id: "conn_" + 26 Crockford base32 characters from 16 random bytes (ULID-length, not ordered).
//   components/connection-registry-1/internal/activities/activities.go (`newID`)

// Vault path of a connection's secret fields (under the KV mount janus-connections):
func ConnectionVaultPath(tenant, connectionID string) string { return "tenants/" + tenant + "/connections/" + connectionID }

// Intake session ("link" payload): base64url(json(IntakeSession)) + "." + base64url(hmac-sha256(key, that json)).
//   IntakeSession{c: connection id, t: tenant, y: type code, k: credential kind, p: provider, a: actor, n: nonce, e: expiry}
//   TTL 60 minutes (activities.DefaultLinkTTL). Key: INTAKE_SESSION_KEY_FILE, shared by the registry (signs) and intake-1 (verifies).

// Nexus callback URL: <origin>/internal/nexus/callback/<id>.<sig>
//   id  = base64url(32 random bytes)  (43 characters), sig = base64url(hmac-sha256(per-process random key, id))
```

**Connection naming** (`request_connection.go`, `connectionBaseName`, `nextName`):

- A type with a **fixed host** (`ConnectionType.Host != ""`) is named by the type's name: `Google Calendar`.
- A **generic type** (no fixed host) is named `<type name> – <host><path>` with an en dash and spaces; the path is included only when it is not empty and not `/`: `API key – welcomehome.com`, `Bearer token – api.example.com/v2`.
- The first connection of that base name keeps it; later ones get the number after the highest in use for that tenant, type and base: `... 2`, `... 3`. **Every state counts**, so a revoked connection keeps its number and numbers are never reused.
- The whole name is at most 200 runes: the base is cut to leave room for a space and five digits (`nameNumberRoom = 6`) and a long host/path is cut with `…`.
- Uniqueness is enforced by the unique index `connection_name_idx (tenant_id, connection_type_id, lower(name))`. On a unique violation the name is picked again (`maxNameTries = 5`), then the capability fails `UNAVAILABLE` ("could not pick a free connection name; try again").

## Database Schema

PostgreSQL database `ob1-janus-db-1`. The registry owns the schema; migrations are `goose` SQL files embedded in the registry image (`internal/store/migrations`), applied by the chart's **migration Job** (`<release>-connection-registry-1-migrate`, Helm hook `pre-install,pre-upgrade` which ArgoCD runs as a PreSync hook, weight `-5`, the registry binary with the argument `migrate`, database admin credentials from VSO). Enabled by `migration.enabled: true` in the GitOps base values, so pending migrations apply whenever the chart upgrades.

### Tables (after migration 00015)

| Table | Purpose | Key columns |
|---|---|---|
| `credential_kind` | the shape of a secret: `oauth2`, `api_key`, `basic`, `bearer` | `code` PK (CHECK), `collection` (`form` \| `redirect`), `secret_fields`, `default_placement` |
| `connection_provider` | what holds and refreshes a credential | `id` PK (`vault-static-1`, `nango-1`), `name`, `kind` (`internal` \| `third-party`), `config_ref`, `state` (`active` \| `disabled`) |
| `provider_credential_kind` | which kinds a provider can hold | PK `(provider_id, credential_kind)` |
| `connection_type` | what callers think in (`google-calendar`, `generic-api-key`, ...) | `id` PK, `name`, `description` (NOT NULL, CHECK non-empty), `category`, `credential_kind` FK, `placement` jsonb, `default_scopes` text[], `normaliser`, `host`, `path_prefix`, `state` (`active` \| `retired`), `outbound` jsonb (NULL or an object: the credential spec), `rate_limits` jsonb (an array, default `[]`), `created_at`, `updated_at` |
| `type_provider` | a provider offering a type; settings hold `integrationKey` | PK `(connection_type_id, provider_id)`, `state` (`active`, `available`, `deprecated`, `retired`), `settings` jsonb; **unique partial index `type_provider_one_active (connection_type_id) WHERE state = 'active'`** |
| `connection` | a tenant's instance of a type | `id` PK, `tenant_id`, `name`, `connection_type_id`, `provider_id` (composite FK to `type_provider`), `provider_ref`, `state`, `current_revision`, `host`, `path_prefix`, `creator_kind`/`creator_id` (`created_by`), `dt_id`, `request_key`, `request_reason`, `rate_limit_overrides` jsonb (an array, default `[]`), timestamps. `last_used_at` moved to `connection_usage` in 00014 |
| `connection_usage` | when each connection's credential was last placed on an allowed outbound call (D77) | `connection_id` PK FK `ON DELETE CASCADE`, `last_used_at`; written only by the usage API, never moved backwards; no change trigger, so reports never wake the outbound caches |
| `connection_revision` | immutable credential revisions | PK `(connection_id, revision)`, `vault_path`, `vault_version` (0 when the secret is not in the Janus Vault, e.g. Nango), `created_by`; **trigger `connection_revision_immutable` blocks UPDATE and DELETE** |
| `connection_metadata` | display-only facts about a connection, empty at first | PK `(connection_id, key)` FK `ON DELETE CASCADE`, `value`, `source`, `updated_at` |
| `publication`, `publication_grant` | Janus's slice of a Mission publish: grants and request rules; `fga_tuples jsonb` = every tuple the store may hold for it | `publication_grant` PK `(publication_id, activity_id, connection_id)` |
| `audit` | one row per registry lifecycle event (`connection.create`, `connection.link_minted`, `connection.complete`, `connection.metadata_changed`, `connection.revoke`, `connection.provider_deleted`); append-only by convention. Since 00014 it holds **no** per-call outbound rows (`credential.use` and `run_token.issue` were deleted): those are in the audit bucket (D77) | `id`, `at`, `tenant_id`, `actor`, `action`, `connection_id` (no FK), `run_id`, `activity_id`, `decision` (`''`, `allow`, `deny`), `detail` jsonb |
| `catalog_audit` | one row per successful catalog-editor write, written in the same transaction; **trigger `catalog_audit_immutable` blocks UPDATE and DELETE** | `actor`, `action`, `subject`, `before`/`after` jsonb, `request_id`, `request_hash`, `result` json |
| `vault_destroy_request` | work for vault-manager-1: Vault KV versions to destroy | `connection_id`, `vault_path`, `versions int[]`, `requested_at`, `completed_at`, `attempts`, `last_error`; partial index on pending rows |
| `provider_delete_request` | the Nango-side connection to delete after a revoke, tried once inline; kept as the record that it was asked for | `connection_id` PK (no FK), `provider_code`, `provider_ref`, `integration_key`, `requested_at`, `completed_at`, `attempts`, `last_error` (fixed words: `unauthorized`, `unavailable`, `not_configured`, `no_integration_key`, `other`); partial index on pending rows |

**Change notices.** Since 00014, statement-level triggers on `connection`, `connection_revision`, `connection_type`, `credential_kind`, `type_provider` and `publication` call `registry_changed_notify()` after any insert, update, delete or truncate, which sends `pg_notify('janus_registry_changed', <table name>)`. The notice goes out at commit, identical ones in one transaction are sent once, and the payload is informational.

Indexes worth knowing: `connection_tenant_idx (tenant_id, state)`, `connection_type_idx (connection_type_id, tenant_id)`, `connection_type_provider_idx (connection_type_id, provider_id)` (the editor's "is this link used" count), `connection_request_key_idx (tenant_id, connection_type_id, request_key) WHERE request_key <> ''` (unique), **`connection_name_idx (tenant_id, connection_type_id, lower(name))` (unique, every state)**, `catalog_audit_request_idx (action, request_id) WHERE request_id <> ''` (unique, the replay backstop), `catalog_audit_at_idx (at DESC, id DESC)`, `audit_tenant_at_idx`, `audit_connection_idx`, `publication_tenant_idx`, `publication_grant_connection_idx`.

Seed (migration 00002, then edited by 00006/00008): providers `vault-static-1` (internal; kinds `api_key`, `basic`, `bearer`) and `nango-1` (third-party; `oauth2`); types `google-calendar` (Nango, host `www.googleapis.com`, path prefix `/calendar/v3/`, scope `https://www.googleapis.com/auth/calendar`), and the generic types `generic-api-key`, `generic-basic-auth`, `generic-bearer-token` (Vault static; no fixed host); migration 00012 adds 12 service types (Pipedrive, ElevenLabs, Deepgram, Postmark, Brevo, Klaviyo, Linear, monday.com, ClickUp, PagerDuty, SerpApi, Google Maps) and 00015 sets default rate limits on some.

### Migrations

| # | File | What it does |
|---|---|---|
| 00001 | `schema` | `connection_type`, `connection_provider`, `type_provider` (+ one-active index), `connection`, `connection_revision` (+ immutability trigger), `publication`, `audit` |
| 00002 | `layers_and_seed` | `credential_kind`, `provider_credential_kind`; `connection_type.credential_kind` replaces `auth_scheme`; `connection.{name,host,path_prefix,last_used_at}`; `connection_revision.vault_version`; `vault_destroy_request`; `publication_grant`; the seed |
| 00003 | `request_key` | `connection.request_key` + the unique request-key index (an idempotent `requestConnection`) |
| 00004 | `publication_fga_tuples` | `publication.fga_tuples` (widened before an OpenFGA write, narrowed after, so a failed write is reconcilable) |
| 00005 | `catalog_editor` | `connection_type.state`; `catalog_audit` (+ immutability trigger, unique replay index); `connection_type_provider_idx` |
| 00006 | `type_description` | `connection_type.description`: seeds real sentences, sets `description = name` for editor-made rows, adds `CHECK (btrim(description, E' \t\r\n') <> '')`, drops the default |
| 00007 | `connection_names_and_reason` | `connection.request_reason`; renumbers existing duplicate names (oldest keeps its name, later get the smallest free number from 2); unique `connection_name_idx` |
| 00008 | `reset_connections_names_and_metadata` | **Destructive on purpose** (nothing was in use). In order: (1) queue every stored secret version in `vault_destroy_request` (grouped by connection and path, only `vault_version > 0`) so nothing is orphaned in the Janus Vault; (2) one `audit` row `registry.connections_reset` with counts; (3) delete `publication_grant`; (4) **disable** the `connection_revision_immutable` trigger, delete `connection_revision`, **re-enable** it (inside the migration transaction, the only way to delete them); (5) delete `connection`; (6) rename the three generic types to `API key`, `Basic auth`, `Bearer token` (only if still named as seeded); (7) create `connection_metadata`. Keeps `audit` and the `publication` rows. Does **not** delete Nango-side connections or the OpenFGA tuples publish-1 wrote. The Down restores the type names and drops the table; deleted rows are not restored. It runs once per database. |
| 00009 | `provider_delete_request` | the table above (Nango deletion on revoke) |
| 00010 | `credential_use_batch` | idempotency table of the old audit sink; dropped again in 00014 |
| 00011 | `type_outbound` | `connection_type.outbound` jsonb (NULL or an object), the credential spec |
| 00012 | `service_api_key_types` | seeds 12 service types for API-key services whose key does not go in `X-API-Key` (host and placement fixed per type), and rewrites the descriptions of `generic-api-key` and `generic-bearer-token` |
| 00013 | `audit_read_indexes` | indexes and a read grant for the console's old audit read; superseded by 00014 |
| 00014 | `connection_usage_and_change_channel` | deletes `credential.use` and `run_token.issue` audit rows; drops `credential_use_batch`, the 00013 indexes and the read grant; creates `connection_usage` (copying `connection.last_used_at`, then dropping it); creates `registry_changed_notify()` and the six triggers |
| 00015 | `rate_limits` | `connection_type.rate_limits` and `connection.rate_limit_overrides` (jsonb arrays, default `[]`); default limits for seeded types where the vendor documents one (about 80% of the vendor's documented limit; verify before relying on them) |

## Capabilities of `connection-registry-1`

25 capabilities: 8 tenant reads, 3 tenant writes, 3 internal, 4 system reads, 7 system writes (`contract.Capabilities`; `capabilitytest.Verify` compares the list with the manifest).

Every capability is a Nexus `Execute` call `{component, capability, payload, auth:{token}}` answered `{ok, data | error:{code, message}}`. The gateway validates `payload` against the manifest schema (`charts/gateway-1/files/capabilities/connection-registry-1.yaml`, `additionalProperties: false` everywhere) **before** the registry sees it. The registry additionally decodes strictly and re-asserts identity. Error codes are the kit's `dispatch.Code`: `INVALID_ARGUMENT`, `PERMISSION_DENIED`, `NOT_FOUND`, `FAILED_PRECONDITION` (a stale `expectedUpdatedAt` or lost concurrent write; the console maps it to 409), `UNAVAILABLE`, `UNIMPLEMENTED`, `INTERNAL`. A refusal message starts with the field or reason (`reason:`, `name:`, `type_retired:`, `id:`, `conflict:`).

| Capability | Caller | Request | Answer |
|---|---|---|---|
| `describeConnectionTypes`, `listConnectionTypes` | tenant | `{}` | types (tenant view; no `normaliser`, `links`, `activeProvider`) |
| `getConnectionType` | tenant | `{code}` | one type |
| `listConnections` | tenant | `{typeCode?, state?, limit?≤200, cursor?}` | the tenant's connections, metadata only |
| `getConnection`, `listConnectionRevisions`, `listConnectionAudit` | tenant | `{connectionId}` / `{connectionId?, limit?}` | the connection (with `reason`, `metadata`); revisions (versions and times, never values); audit |
| `createConnection` | tenant | `{typeCode, name, host?, pathPrefix?}` | pending connection with `mode: form` (`intakeUrl`, `intakeSession`) or `mode: redirect` (`connectUrl`). The name must be unused for tenant+type in any state (`name:`). Normally replaced by `requestConnection` |
| **`requestConnection`** | tenant | below | `{connection, link:{url, message, expiresAt}, reused, reusedFromRequestedAt?}` |
| `revokeConnection` | tenant | `{connectionId}` | revokes, queues the secret versions in `vault_destroy_request` and, for a `nango-1` connection with a provider reference, a `provider_delete_request` that it tries once inline (`DELETE /connections/{ref}?provider_config_key=<integrationKey>`; a 404 counts as done). Answer carries `providerDeletion`: `not_needed`, `done` or `pending` (a failure keeps the row pending, the revoke still succeeds, and a repeated revoke retries); idempotent |
| `listPublications` | tenant | `{automation?, limit?}` | publications and which connections each activity uses |
| `completeConnection` | **internal** | `{connectionId, providerRef?, vaultPath?, vaultVersion?, actor?}` | pending → active; a non-pending connection is refused (this is what makes a link single use) |
| `inspectConnection` | **internal** (intake-1) | `{connectionId}` | the connection, its type and provider (code, kind, non-secret integration key); never a provider reference or Vault path |
| `setConnectionMetadata` | **internal** | `{connectionId, set?{k:v}, remove?[k]}` | the connection's metadata after the change |
| `systemListConnectionTypes`, `systemListProviders`, `systemConnectionTypeUsage` | platform | `{}` | full types with `links`, providers with credential kinds, per-type tenant/connection counts |
| `systemUpsertConnectionType` | platform, boundary editor/admin | `{id, name, description, credentialKind, placement{in,name,format}, outbound?, rateLimits?, defaultScopes?, normaliser?, host?, pathPrefix?, category?, expectedUpdatedAt?}`. `outbound`: absent stores none; `mode inject` takes 1 to 5 `credential` entries `{in: header\|query, name, value}`, at most 10 `staticHeaders` and 20 `stripHeaders`; `mode context` is accepted by the registry and refused at call time. `rateLimits`: absent or null keeps the stored list (a new type gets none), `[]` removes them, at most 8; a change reconciles the connections' overrides in the same write | the type as stored, with links |
| `systemSetConnectionTypeState` | platform, editor/admin | `{id, state: active\|retired, expectedUpdatedAt?}` | the type |
| `systemDeleteConnectionType` | platform, editor/admin | `{id, expectedUpdatedAt}` (required) | `{id, deleted}`; refused (`id:`) if any connection of the type exists in any state |
| `systemSetTypeProvider` | platform, editor/admin | `{connectionTypeId, providerId, state, settings{integrationKey?}, expectedUpdatedAt?}` | the link; `active` demotes the type's other active link in the same transaction |
| `systemRemoveTypeProvider` | platform, editor/admin | `{connectionTypeId, providerId, expectedUpdatedAt?}` | `{.., removed}`; refused while a connection uses the link |
| `systemCheckTypeProvider` | platform, any boundary | `{connectionTypeId, providerId, integrationKey?}` | `{ok, checks[{name, ok, detail}]}` (fixed sentences only) |
| `systemListCatalogAudit` | platform, any boundary | `{limit?, cursor?}` | newest first, `before`/`after` per row, `nextCursor` |
| `systemSetConnectionRateLimits` | platform, editor/admin | `{connectionId, rateLimitOverrides[{name, limit}], expectedUpdatedAt?}` | the connection (id, type, state, `updatedAt`, overrides). The list replaces every override; validated with `ValidateRateLimitOverrides` against the connection's real type |

There is **no provider-editing capability**: providers are added in code (a registry migration, as `00002` does).

### `requestConnection`

```jsonc
// request (manifest: additionalProperties false; the registry also rejects any other field, e.g. `name`, with `name: not accepted`)
{ "typeCode": "generic-api-key",        // required, 1..64
  "reason": "Read the sales API",       // required, trimmed, 1..500, plain text (a newline is a control character)
  "idempotencyKey": "k-123",            // optional, <= 128; the DT tool sends the runtime placeholder
  "host": "api.example.com",            // generic types only (a host is required for them)
  "pathPrefix": "/v2",                  // optional
  "forceNew": false }                   // boolean, or the strings "true" / "false" (a tool template can only send strings)

// answer
{ "connection": { ...Connection, "reason": "...", "metadata": {} },
  "link": { "url": "https://<connectBaseUrl>/connections/connect#s=<session>", "message": "...", "expiresAt": "<RFC3339, +60 min>" },
  "reused": false, "reusedFromRequestedAt": null }
```

Processing:

1. Tenant scope required (`this capability needs a tenant-scoped caller`). `reason` and `forceNew` validated (`reason: is required; ...`, `reason: is at most 500 characters`, `reason: must be plain text without control characters`). A retired type is refused `type_retired: ...`. The registry needs `CONNECT_BASE_URL` (and `INTAKE_BASE_URL` for form kinds): unset fails `UNAVAILABLE` (`connect_base_url_not_configured`, `intake_base_url_not_configured`) and **stores nothing**.
2. **Idempotency key hit first**: the same `(tenant, type, key)` finds its own connection again, even with `forceNew`, and mints a fresh link; `reused` is false. If that connection is no longer pending: `INVALID_ARGUMENT conflict: this idempotencyKey already created a connection that is <state>; use a new key to request another`.
3. **Reuse** unless `forceNew`: inside one transaction holding an advisory lock on `(tenant, type, host, pathPrefix, creator)` (`pg_advisory_xact_lock(hashtextextended(...))`), a pending connection of the same tenant, **same user** (`creator_id`), type, host and path prefix created within the last 60 minutes (`PendingWindow.Since`) is returned: `reused: true`, `reusedFromRequestedAt = created_at`, a **fresh signed link for that same connection** (older links stay valid until their own expiry), and `link.message` starts "A connection request for <Type> (<name>) made N minutes ago is still pending, so this is the link for that same connection instead of a new one. To start another connection of the same type, request again with forceNew set to true; the pending one stays as it is." The reuse keeps the **first** request's reason; the new reason goes only into the audit row.
4. Otherwise insert a new `pending` connection with the generated name (see naming) and `request_reason`; `forceNew` always takes this path and leaves the old pending connection untouched.
5. Write the audit row `connection.link_minted` (type, `reused`, `forceNew`, expiry, reason) and log `connection requested`.
6. A refusal for an unknown or retired type, a missing host for a generic type, or a bad field never creates a row.

`setConnectionMetadata` rules: keys `^[a-z][a-z0-9_.-]{0,63}$`; values plain text 1..500 characters, trimmed, newline counts as a control character; at most 20 keys per connection (enforced under a row lock: 30 racing writes leave exactly 20 keys); `set` and `remove` are exclusive per key; an unchanged key is not rewritten and writes no audit row; one `connection.metadata_changed` audit row per change with **key names only, never values**; errors `NOT_FOUND`, or `INVALID_ARGUMENT` starting `set:` / `remove:`. Nothing writes metadata yet; the intended writer is a provider on completion (`account_label`).

### Authorization inside the registry

| Rule | Where |
|---|---|
| Component name must be `connection-registry-1`; `req.User` required; tenant scope needs a tenant id; scopes other than `tenant` and `platform` refused | `assertCaller` (activities.go) |
| Tenant capabilities: tenant scope, tenant from the gateway-fixed identity (never a request field) | `tenantOf` |
| `system*` reads: platform scope | `systemOnly` |
| `system*` writes: platform scope **and** `ComponentRequest.SessionBoundary` of `editor` or `admin`; first thing each does, before the payload is read | `catalogWriter` (catalog.go) |
| Internal capabilities (`completeConnection`, `inspectConnection`, `setConnectionMetadata`): platform scope **and** `req.User` in `INTERNAL_CALLERS` (the STS token's `sub`) | `internalOnly` |
| `requestConnection` checks tenant scope only. The `editor` boundary for connecting is enforced by **console-1's adapter** (`requiresBoundary: "editor"`), not by the registry | console `connect.ts` |

`INTERNAL_CALLERS` is the comma-separated env var built from the chart value **`registry.internalCallers`** (not under `nango:`). It names `janus-intake-1`, the only caller of the internal capabilities. If it is empty or unset every internal call answers `PERMISSION_DENIED: this capability is internal`.

### Idempotency and workflow ids

- **Gateway workflow id.** When a call carries no `idempotencyKey` the gateway derives the workflow id (`gateway-<hash>`) from tenant, user, capability, boundary and a hash of the payload. Two identical calls in flight at once therefore share an id and the second fails with **`Workflow execution is already running`** (HTTP 500 from the Nexus handler). With a key, the id derives from the key. **Every caller that can issue identical calls concurrently must send a fresh key per try**: the console sends `read-<uuid>` for reads (and the browser's `Idempotency-Key` for writes); `intake-1` sends `intake-call-<32 hex>` on every try of a registry call.
- **Catalog editor writes** are idempotent: the call's dedupe key is the caller's idempotency key (the console sends one per intended edit), else `run:` + the **workflow run id**, never the bare workflow id (the same edit made at different times shares a workflow id and must still execute). Each write looks its call up in `catalog_audit` first, inside the same transaction under a `pg_advisory_xact_lock` of `(action, key)`, and replays the stored `result` byte for byte on a hit. A key reused for a different request (`request_hash` mismatch) is refused `INVALID_ARGUMENT idempotencyKey: ...`.
- **Optimistic concurrency**: `expectedUpdatedAt` must equal the stored `updated_at` or the write fails `FAILED_PRECONDITION` (console: 409 `conflict`). The console always sends it when editing, never when creating (creating an existing id is a console-side 409).
- **Temporal retries**: the registry workflow runs one activity with `StartToCloseTimeout 10s`, `MaximumAttempts 3`, backoff 200 ms → 2 s; failures return as a typed `Response`, never a workflow failure.

## Session boundary

The STS token carries `session_boundary` (formerly `sessionBoundary`; `viewer`, `editor`, `admin`); `ComponentRequest.SessionBoundary` (`capability` module v0.3.0, the version the registry and gateway are pinned to) delivers it to the component. The console reads it from the session and lists a write adapter for a principal only when its scope and boundary are met (the bootstrap `adapters` array), so a viewer sees disabled controls with the reason, and the server refuses the call (`403 boundary_required`) before any gateway call. Platform sessions come from the portal's platform Google groups; the highest boundary is the group's.

## Nexus callback implementation

`gateway-1`'s `Execute` is a **workflow-run Nexus operation**: Temporal answers the HTTP call `201 {"token": "<operation token>"}` immediately and later **POSTs the result** to the callback URL the caller sent as `?callback=<url>`. Headers on that POST: `Nexus-Operation-Token`, `Nexus-Operation-State` (`succeeded` | `failed` | `canceled`). A `200` is also accepted and carries the answer directly. The caller sends `Operation-Timeout: <whole seconds>s`, never shorter than its own wait.

| Item | Go (`intake-1`) | TypeScript (`console-1`) |
|---|---|---|
| Implementation | `shared/contract/nexuscallback.Receiver` (`Register()` returns the URL, a wait function and a cancel) | `src/server/callback.ts` `Callbacks` (`register()`, `wait()`, `accept()`, `server()`) |
| Path | `/internal/nexus/callback/<id>.<sig>` | same |
| Per-call id | 43 characters (base64url of 32 random bytes) | same |
| Signature | HMAC-SHA256 of the id with a key that lives **in this process only** (random at start) | same |
| Port | own listener, `NEXUS_CALLBACK_ADDR` default `:3001` (intake-1) | `NEXUS_CALLBACK_PORT` 3001 |
| Service | `janus-intake-1-callback` (stable name), port 3001 | `console-1-callback`, port 3001 |
| Body cap | 1 MiB | 8 MiB |
| Replicas | **one pod** per caller (the key and the pending map are per process); a callback delivered to another replica or after a restart is refused | one replica (`Recreate`; the chart refuses `replicaCount > 1`) |
| Errors | `FailedError{State}`, `ErrNoToken`, `ErrTokenMismatch` (an operation that ended failed or canceled, a 201 without a token, or another operation's token) | `CallbackError` `timeout` / `failed` / `token` |
| Timeouts | intake-1: 10 s per try, up to 3 tries (200 ms, 400 ms backoff), reads and the completion only on transient failures | console: 20 s read, 60 s write (`timeoutMs`) |

A valid-signature callback for an unknown or late call is acknowledged `204` and dropped. A bad signature or unknown path is refused (403/404) and counted.

`outbound-policy-1` has no callback listener, Service or Nexus client: its audit goes to S3 (D77), and it makes no Nexus call.

**What must exist for a callback to arrive** (the two Janus receivers):

1. Temporal's `component.callbacks.allowedAddresses` lists the Service and port (`argocd-eks-stack`, `v2/apps/platform/wrflw/temporal-cluster-3/values/base.values.yaml`): `console-1-callback.ob1-tf-eks-de-v2-janus-1-ns-1.svc.cluster.local:3001` and `janus-intake-1-callback...:3001` (`AllowInsecure: true`).
2. A Cilium ingress policy from Temporal's **history** pods on port 3001 (`console-1.allow-temporal-callback.yaml`, `intake-1.allow-temporal-callback.yaml`).
3. Egress from the caller to the Temporal frontend `7243` (and the STS `8080`) (`<component>.allow-required.yaml`).
4. **The workload's Istio `ALLOW` AuthorizationPolicy** (the namespace has a deny-all, so both receivers have one) must also admit Temporal's service account on 3001: `intake-1.allow-temporal-callback.authorizationpolicy.yaml` and the second rule of `console-1.allow-required.authorizationpolicy.yaml` (principal `cluster.local/ns/ob1-tf-eks-temporal-3-ns-1/sa/ob1-acd-eks-temporal-cluster-3-sa-1`, port `3001`, ports and principals only because L7 rules are not enforced by ztunnel). Without it Temporal's delivery is refused with 403 and the caller sees "Nexus Callback has failed ... handler error (UNAUTHORIZED)".
5. The namespace is `STRICT` mTLS (`strict-mtls.peerauthentication.yaml`, no port exceptions).

## Intake (`intake-1`)

HTTP backend of the connect page. Routes (all `POST`, `application/json`, session in the body, edge auth mode `capability`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`):

| Route | Request | Success | Notes |
|---|---|---|---|
| `/v1/connections/session/inspect` | `{session}` | 200 connection, type, provider, `mode` (`form` \| `redirect`), `fields[]`, `expiresAt` | refuses a connection that left pending (409 `already_completed`) |
| `/v1/connections/credentials` | `{session, fields{}}` | 201 `{state: "active"}` | validates the closed field set (4 KiB each, no control characters), reserves the session nonce, writes a **new revision** to the Janus Vault with KV check-and-set, then `completeConnection` |
| `/v1/connections/session/connect` | `{session}` | 200 `{connectUrl, expiresAt}` | creates the Nango connect session lazily (`POST /connect/sessions`, tags `connection_id`) |
| `/v1/connections/session/status` | `{session}` | 200 `{state, completed, typeName, completedAt?}` | also answers for a connection that already completed |
| `/v1/connections/webhooks/nango` | Nango's event | 200 | signature auth, below |

Errors: 401 `session_invalid` (forged or mismatched), 410 expired, 403 `origin_not_allowed`, 415, 429 `rate_limited` (+ `Retry-After`), 502 `vault_unavailable` / `provider_unavailable`, 503 `registry_unavailable` / `provider_not_configured`. A refused completion triggers a second `inspectConnection`: `revoked` → 404 `connection_not_found`, otherwise 409 `already_completed`. Rate limits (per minute, burst): IP 60/30, read 30/10, connect 10/5, credentials 10/5.

**Vault write**: KV v2 at `janus-connections/tenants/<tenant>/connections/<id>`, one key per field (`key`, `username`, `password`, `token`), check-and-set with the version this replica last stored (0 when unknown); on a refused CAS it reads the metadata version and retries once. Single use has two layers: the registry is authoritative (completing a non-pending connection is refused, and `inspect` runs before any write so a replay cannot overwrite an active credential) and an in-memory nonce set closes the window between inspect and completion. The registry client is `internal/registry` (Nexus HTTP, the callback receiver, STS workload token, STS `session:viewer` platform scope with `STS_SCOPE_ID=janus-platform-1`).

### Configuration (`intake-1`)

| Env var | Chart value / source | Meaning |
|---|---|---|
| `LISTEN_ADDR`, `HEALTH_ADDR` | `:8080`, `:3000` | listeners |
| `LOG_LEVEL` | `logLevel` (default `info`) | `debug`, `info`, `warn`, `error`; a typo stops the start |
| `INTAKE_SESSION_KEY_FILE` | `secrets.sessionKey` (key `session-key`) | HMAC key that verifies intake sessions (shared with the registry) |
| `VAULT_ADDR`, `VAULT_CA_FILE`, `VAULT_K8S_ROLE`, `VAULT_K8S_MOUNT` (`kubernetes`), `VAULT_KV_MOUNT` (`janus-connections`), `SA_TOKEN_FILE` | `vault.*` | Janus Vault login (projected token with audience `vault.tokenAudience`) and mount |
| `NEXUS_URL`, `NEXUS_ENDPOINT_ID`, `NEXUS_SERVICE` (`ConnectionServiceV1`), `NEXUS_CALLBACK_ADDR` (`:3001`), `NEXUS_CALLBACK_URL` | `nexus.*` | registry transport; setting `NEXUS_URL` without the rest (incl. an origin-only callback URL) fails at start |
| `STS_TOKEN_URL`, `STS_PROJECTED_TOKEN_PATH`, `STS_SCOPE_ID`, `STS_RESOURCE`, `STS_SCOPE` (`session:viewer`), `STS_SCOPE_TYPE` (`platform`) | `sts.*` | workload token exchange |
| `NANGO_BASE_URL`, `NANGO_CONNECT_URL` | `nango.baseUrl`, `nango.connectUrl` | Nango API; connect UI origin fallback |
| `NANGO_SECRET_KEY_FILE` | `secrets.nango` key `apiKey` | Nango **API key** (scoped: `environment:connect_sessions:write`) |
| `NANGO_WEBHOOK_SIGNING_KEY_FILE` | `secrets.nango` key `signingKey` | Nango **webhook signing key** (a different secret). **Neither file falls back to the other** |
| `CONNECT_ALLOWED_ORIGIN`, `CLIENT_IP_HEADER`, `CLIENT_IP_HOPS` | `connect.*` | the only CORS/request origin; which header carries the client address and how many hops from the right |

### Nango client and webhook verification

- **API calls (by component):** `intake-1` → `POST /connect/sessions` (needs `environment:connect_sessions:write`). `connection-registry-1` → `GET /integrations/{key}?include[]=credentials` for the editor's Check (only the scopes are kept; needs `environment:integrations:read_credentials`) and `POST /connect/sessions` for `createConnection` (a path the DT and console flow does not use). `connection-registry-1` also `DELETE /connections/{ref}?provider_config_key=<key>` on revoke (needs `environment:connections:delete`; a 404 counts as done). `outbound-policy-1` → `GET /connection/{ref}?provider_config_key=<key>` (the access token; needs `environment:connections:read_credentials`; the singular path is deprecated by Nango). Scope names come from Nango's documentation and are not verified against the dashboard (see Not verified); the repository's `docs/content/nango-keys.md` has the per-component key table and the order in which keys are created.
- **Webhook verification** (`internal/nango.Verify`): the `X-Nango-Hmac-Sha256` header is the hex HMAC-SHA256 of the **raw body** keyed with the **webhook signing key** (Nango dashboard: Webhooks > Signing key), compared in constant time. The older `X-Nango-Signature` is **not accepted**. The body is read with a 1 MiB cap before parsing. A completion event is `type: auth`, `operation: creation`, `success: true` with the connection id taken from the end-user tag `connection_id`; other events are acknowledged `200 {"ignored": true}`.
- On a refused signature the log carries `hmac_header_hex_len`, `legacy_header_hex_len`, `body_bytes`, `content_type`, `content_encoding`, `secret_len` and `secret_fp` (the first six hex digits of the key's SHA-256), never the key, a signature or any body text. Compare `secret_fp` with `printf %s "$KEY" | sha256sum | cut -c1-6`.

## Other components

### `connection-registry-1` configuration

| Env var | Meaning |
|---|---|
| `TASK_QUEUE` | default `janus-cluster-1-connection-registry-1-tq` |
| `LOG_LEVEL` | `debug` / `info` (default) / `warn` / `error`; a typo stops the start |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSSLMODE`, `PGUSER_FILE`, `PGPASSWORD_FILE`, `PGMAXCONNLIFETIME` | database (dynamic Vault credentials re-read per connection); unset `PGHOST` starts the worker answering `UNAVAILABLE` |
| `INTAKE_BASE_URL`, `CONNECT_BASE_URL` | public bases of intake-1 (form URLs) and the connect page (`requestConnection`'s link); https without credentials, query or fragment |
| `INTAKE_SESSION_KEY_FILE` | signs intake sessions |
| `INTERNAL_CALLERS` | from `registry.internalCallers` |
| `USAGE_ADDR` | chart `usage.port` (`:8081`); serves `POST /v1/connection-usage` (see [Connection usage API](#connection-usage-api)); empty or unset serves none and `lastUsedAt` is never written |
| `NANGO_BASE_URL`, `NANGO_SECRET_KEY_FILE` | Nango client (`secretKey` of its own Secret; scoped key `environment:integrations:read_credentials`, plus `environment:connections:delete` for the deletion on revoke) |
| `METRICS_ENABLED` | worker metrics |

Chart values: `database.{host,credentialsSecret,migratorCredentialsSecret}`, `registry.{intakeBaseUrl,connectBaseUrl,internalCallers,intakeSessionKeySecret}`, `nango.{baseUrl,secretKeySecret}`, `usage.{enabled,port,serviceName}` (Service `janus-connection-registry-1-usage`), `migration.{enabled,serviceAccount}`, `vso.*`, `logLevel`.

### `gateway-1`

Env: `TASK_QUEUE`, `CAPABILITIES_DIR` (the mounted manifests), `METRICS_ENABLED`. Manifest default `executionTimeout: 30s`. A manifest change rolls the pod (`checksum/capabilities` annotation); there is no runtime discovery. Manifests: `connection-registry-1` (capabilities above), `publish-1` (`describePublications`, `registerPublication`, `retirePublication`), `vault-manager-1` (`describeVaultState`), `outbound-policy-1` (`describePolicy`, `getConnectionRateLimitUsage`, `systemGetConnectionRateLimitUsage`). `describePolicy` reports whether ext_authz is serving and how many rule files are loaded; the two usage reads report a connection's live limit usage.

### `publish-1`

Env: `TASK_QUEUE`, database variables, `OPENFGA_URL`, `OPENFGA_API_TOKEN_FILE`, `OPENFGA_STORE_NAME` (resolved to the id at start, waiting a bounded time for the bootstrap Job; a missing or duplicated store stops the process), `OPENFGA_STORE_ID`/`OPENFGA_MODEL_ID` (unset by default), `PUBLISH_CALLERS` (identities allowed to call), `METRICS_ENABLED`. `registerPublication` / `retirePublication` write the publication row and its tuples idempotently, widening `publication.fga_tuples` before and narrowing after the OpenFGA write.

### `vault-manager-1`

Env: `TASK_QUEUE`, database variables, `VAULT_ADDR`, `VAULT_CA_FILE`, `VAULT_K8S_ROLE`, `VAULT_K8S_AUTH_MOUNT`, `VAULT_TOKEN_FILE`, `VAULT_TOKEN_AUDIENCE`, `RECONCILE_INTERVAL` (default 1 minute), `VAULT_COMPONENT_ROLES` (`false` skips the component Kubernetes-auth roles), `JANUS_NAMESPACE`, `JANUS_INTAKE_SERVICE_ACCOUNT`, `JANUS_OAUTH_PROVIDER_SERVICE_ACCOUNT`, `JANUS_OUTBOUND_POLICY_SERVICE_ACCOUNT`, `OUTBOUND_PKI_ENABLED` (chart `janusVault.outboundPKI`; when `true` the registry's host list must be readable). Each pass ensures the Janus Vault's mounts (`janus-connections`, `janus-platform`), policies and component roles, then works the `vault_destroy_request` queue (batch 50). Fixed policy `janus-connection-writer` gives the intake components `create` and `update` on `janus-connections/data/tenants/+/connections/+` and `read` on its metadata, never read, list or delete of a value. Roles: `ob1_janus_intake-1_role_1`, `ob1_janus_oauth-provider-1_role_1`, `ob1_janus_outbound-policy-1_role_1`, `ob1_janus_vault-manager-1_role_1`, `ob1_janus_raft-snapshot_role_1`. Policy `janus-outbound-policy-1` may only `update` `auth/token/create/janus-conn-reader`; that token role may attach only `janus-conn-*-read` policies, has no default policy and lives at most 15 minutes (the just-in-time read path of outbound enforcement). Policy `janus-outbound-pki-sign` (also on the outbound-policy-1 role, whose token TTL is 15 minutes and max TTL 1 hour) allows signing a CSR at `janus-pki-outbound-1/sign/outbound-gateway-1` and nothing else.

**Outbound PKI** (`internal/reconcile/pki.go`, in the same pass as the mounts, policies and destroy queue; a PKI failure is reported in the status and the other steps still run). Root mount `janus-pki-root-1`: ECDSA P-256 root, TTL `87600h`, generated inside the Vault, signs only the intermediate; "no root" is accepted only on Vault's own "no default issuer" answer, so a 403, a 5xx or a sealed Vault never generates a second root. Issuing mount `janus-pki-outbound-1`: intermediate TTL `2160h` (90 days), path length 0, excluded name constraints `OutboundExcludedDomains` (`budybot.ai`, `orangebox.ai`, `budy.bot`, `cluster.local`, `svc`, `internal`, `amazonaws.com`); an intermediate whose certificate lacks them is refused; rotated when 30 days are left (and when the current root did not sign it). Role `outbound-gateway-1`: `allowed_domains` is the registrable domains of the active host set (`OutboundCertGroups`), subdomains and wildcards allowed, rewritten only when the set changes, never emptied when the registry cannot be read, refused above 5,000 names. The bootstrap policy (`deploy/janus-vault-bootstrap/bootstrap.sh`) grants vault-manager-1 exact paths only on the two mounts and denies exported keys, `keys/*`, `issue/*`, `sign/*` and `root/sign-self-issued`; re-run it (idempotent) before turning `outboundPKI` on.

### `oauth-provider-1`

Env: `LISTEN_ADDR`, `HEALTH_ADDR`, `PUBLIC_BASE_URL`, `INTAKE_SESSION_KEY_FILE`, `VAULT_ADDR`, `VAULT_CA_FILE`, `VAULT_K8S_ROLE`, `VAULT_K8S_MOUNT`, `VAULT_KV_MOUNT`, `SA_TOKEN_FILE`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET_FILE`. Built, not wired to a registered internal OAuth provider: intake-1 answers `501 provider_not_supported` for such a type.

### `openfga-bootstrap-1`

Env: `OPENFGA_URL` (required), `OPENFGA_STORE_NAME` (default `janus-cluster-1`), `OPENFGA_API_TOKEN_FILE`, `OPENFGA_CREATE_STORE` (the sync Job `true`, the hourly drift CronJob `false`); the namespace is ambient, so there is no sidecar to wait for or quit. One run: read the key; `GET /healthz`; list stores and take the one named exactly `OPENFGA_STORE_NAME` (two with the name fails); create only when allowed; compare the store's latest model with Git's as canonical JSON and write a new model only when it differs (`written` / `unchanged`); retries on transport, 5xx and 429 (4 attempts), never on 401/403; keys and bodies are never logged. The Job is an ArgoCD Sync hook (wave 0). The model source is `components/publish-1/authz/janus.fga`, with generated `internal/model/janus.model.json` and a drift test; run `make openfga-model` to regenerate.

Model (schema 1.1): `user`, `tenant`, `janus_dt_1` (`owning_tenant`), `janus_mission_1` (`dt`), `janus_publication_1` (`mission`, `dt`, `running`), `janus_workflow_1` (`publication`), `janus_activity_1` (`publication`, `workflow`, `runnable_in = running from publication`), `janus_run_1`, `janus_connection_1` (`owning_tenant`, `user_activity`, `creator`, `dt_user`, `dt_manager`; `can_use = user_activity or dt_user or dt_manager`, `can_revoke = creator or dt_manager`). **No tuple is static**: every tuple is written by publish-1 at publish or supplied as a contextual tuple from the run token. OpenFGA preshared keys have no roles (any holder can do anything): one shared key today, with per-consumer VSO secrets so it can be split later. Details: `docs/content/openfga-operations.md`.

### `outbound-policy-1`

One binary, four roles: Temporal worker (the usage capabilities), ext_authz gRPC server, xDS server, worker API. Configuration (chart values in parentheses; `extAuthz.*` apply only with `extAuthz.enabled`):

| Group | Env var | Meaning |
|---|---|---|
| Worker | `TASK_QUEUE`, `METRICS_ENABLED`, `METRICS_ADDR` (`:9464`, `metrics.port`) | queue; Prometheus metrics on `/metrics` |
| ext_authz | `EXT_AUTHZ_ENABLED` (must be `true` to serve), `EXT_AUTHZ_ADDR` (`:9001`), `RULES_DIR` (ConfigMap `rulesConfigMap`), `RUN_TOKEN_AUDIENCE` (`janus-outbound-gateway`), `STS_ISSUER`, `STS_JWKS_URL` | listener, rules (Rego), run-token verification against the STS keys |
| Registry (read only) | `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSSLMODE`, `PGUSER_FILE`, `PGPASSWORD_FILE`, `PGMAXCONNLIFETIME` (`database.*`, `vso.app`) | the standard read role of `ob1-janus-db-1`; `CONNECTIONS_FILE` is the interim hand-kept snapshot, used only without `PGHOST` |
| OpenFGA | `OPENFGA_URL`, `OPENFGA_STORE_NAME` / `OPENFGA_STORE_ID` / `OPENFGA_MODEL_ID`, `OPENFGA_TOKEN_FILE` (`extAuthz.openfga.*`) | grant checks; the store is found by name, waiting up to three minutes for the bootstrap Job |
| Janus Vault | `VAULT_ADDR`, `VAULT_CA_FILE`, `VAULT_K8S_ROLE` (`ob1_janus_outbound-policy-1_role_1`), `VAULT_K8S_AUTH_MOUNT` (`k8s-1`), `VAULT_K8S_TOKEN_FILE` (projected, audience `janus-vault-cluster-1`), `VAULT_MOUNT` (`janus-connections`), `VAULT_TOKEN_ROLE` (`janus-conn-reader`), `VAULT_TOKEN_FILE` (interim, replaced by the login) | child tokens for credential reads; leaf signing |
| Nango | `NANGO_BASE_URL`, `NANGO_SECRET_KEY_FILE` (`extAuthz.nango.*`, both or neither) | access token read; unset denies `nango-1` connections (`provider_not_configured`) |
| Gateway control plane | `OUTBOUND_GATEWAY_ENABLED` (`extAuthz.gateway.enabled`; then every setting below is required), `XDS_ADDR` (`:9002`), `WORKER_API_ADDR` (`:8090`), `RUN_TOKEN_STS_URL`, `RUN_TOKEN_STS_TOKEN_FILE`, `RUN_TOKEN_TTL` (`5m`, between 1m and the STS maximum 15m), `CERT_SYNC_INTERVAL` (`30s`), `KUBERNETES_API_URL`, `RUN_CHECK_TEMPORAL_ADDRESS`, `RUN_CHECK_TEMPORAL_TOKEN_FILE` (`/var/run/secrets/temporal/token`) | xDS and certificates, worker API, run-token minting, the Temporal run check |
| Audit | `AUDIT_BUCKET` (empty: decisions are only logged and counted), `AUDIT_REGION` (`us-west-2`), `AUDIT_CAPTURE` (`deny` default, `all`, `none`), `AUDIT_FLUSH_INTERVAL` (`5m`), `AUDIT_MAX_OBJECT_BYTES` (5 MiB), `POD_NAME` (downward API) | S3 audit writer; credentials are the pod's IRSA web identity (`audit.roleArn`) |
| Usage | `REGISTRY_USAGE_URL` (default `http://janus-connection-registry-1-usage.<ns>.svc.cluster.local:8081`), `USAGE_REPORT_INTERVAL` (`60s`) | connection last-use reports |
| Cache | `CACHE_TTL` (`30s`; `0` off) | read cache (D78) |
| Rate limits | `RATE_LIMIT_REDIS_ADDR` (`rateLimit.redis.addr`) **or** `RATE_LIMIT_REDIS_SENTINEL_ADDRS` + `RATE_LIMIT_REDIS_MASTER` (both or neither; the chart refuses to render with both modes), `RATE_LIMIT_REDIS_PASSWORD_FILE` (`/var/run/janus-redis/password`, from Secret `janus-redis-1-password`, key `password`, re-read on every new connection), `RATE_LIMIT_TIMEOUT` (`100ms`), `RATE_LIMIT_REPLICAS` (the chart's `replicaCount`) | see [Redis usage](#redis-usage-and-availability-policy) |

IAM: with `audit.roleArn` set, the role becomes the existing role of the pod's `TemporalWorkerIdentity` (a ServiceAccount has one IRSA role), whose composition attaches the Temporal payload-storage policy and writes the `eks.amazonaws.com/role-arn` annotation.

**Capabilities** (Nexus `Execute` through the gateway; manifest `charts/gateway-1/files/capabilities/outbound-policy-1.yaml`; 3 in all):

| Capability | Caller | Request | Answer |
|---|---|---|---|
| `describePolicy` | any | `{}` | whether ext_authz is serving and how many rule files are loaded (`stub: false`; a worker without ext_authz answers a labelled stub) |
| `getConnectionRateLimitUsage` | tenant | `{connectionId}` (1 to 64 of `A-Za-z0-9_-`) | `ConnectionRateLimitUsage`: the tenant's connection-scoped limits only; another tenant's connection and an unknown id are both `NOT_FOUND` |
| `systemGetConnectionRateLimitUsage` | platform, any boundary | `{connectionId}` | `ConnectionRateLimitUsage` with `tenant` and every limit, shared ones included |

Both usage reads read the connection by id straight from the registry database (not through the call-path cache), take its effective limits and read the counters with a second, **read-only** script (`GET` of the previous and current bucket and the server's `TIME`; nothing is written); the estimate and the wait are computed in Go from the functions the refusal uses. They use the limiter's Redis client and timeout (five times it for a read), never touch the decision path's skip window or outage log, and answer `source: "unavailable"` with the limits and no counts when Redis is not configured or does not answer. `used` can exceed `limit` after a limit was lowered.

### `console-1`

Fastify server serving a React app; one session cookie (key `sessionSecret`, from the Janus-owned KV path `.../janus-cluster-1-console-1/session`, read once at start). Configuration (set by the chart): `CONSOLE_PORT`, `CONSOLE_PUBLIC_URL`, `CONSOLE_PORTAL_URL`, `CONSOLE_ACCEPTED_SCOPES` (`system,tenant`), `CONSOLE_LOG_LEVEL` (chart default `warn`), `CONSOLE_STS_ISSUER`, `CONSOLE_STS_JWKS_URL`, `CONSOLE_STS_AUDIENCE`, `CONSOLE_HANDOFF_REDEEM_URL`, `CONSOLE_HANDOFF_APP_ID`, `CONSOLE_HANDOFF_RESOURCE`, `CONSOLE_HANDOFF_TOKEN_PATH`, `CONSOLE_SESSION_SECRET_FILE`, `NEXUS_URL`, `NEXUS_SERVICE`, `NEXUS_ENDPOINT_ID` (the server-assigned endpoint id from the TemporalNexusEndpoint connection Secret, key `id`), `NEXUS_CALLBACK_PORT`, `NEXUS_CALLBACK_URL`, and, only with a bucket configured, `AUDIT_BUCKET` and `AUDIT_REGION` (`us-west-2`; chart `audit.bucket`, `audit.region`) plus `AWS_ROLE_ARN` and `AWS_WEB_IDENTITY_TOKEN_FILE` (added by the EKS pod identity webhook when the service account carries `audit.roleArn`). Without `AUDIT_BUCKET` the Outbound activity page answers `503 audit_not_configured`. No database and no other secret.

Routes (the console's own API; all behind the console-kit session; unknown query parameters 400; a tenant session gets 403 from `/api/system/*` and a platform session 403 from tenant routes without calling the gateway):

| Route | Scope | Boundary |
|---|---|---|
| `GET /api/connection-types[/:code]`, `GET /api/connections[/:id]`, `GET /api/audit`, `GET /api/publications` | tenant | any |
| `GET /api/connections/:id/rate-limit-usage` | tenant | any |
| `POST /api/connections/request` `{typeCode, reason, host?, pathPrefix?, forceNew?}` + `Idempotency-Key` (required) | tenant | **editor** |
| `DELETE /api/connections/:id` (empty body `{}`) + `Idempotency-Key` (required); answer `{id, name, typeCode, state, providerDeletion?}` | tenant | **admin** (enforced by the console; the registry does not ask) |
| `GET /api/system/types`, `/providers`, `/usage` | system | any |
| `GET /api/system/audit?limit=&cursor=` | system | viewer (explicit) |
| `GET /api/system/outbound-activity?window=&class=&tenant=&code=&q=&run=&around=` and `.../summary?window=&tenant=&around=` | system | viewer (explicit); reads the audit bucket directly, no gateway call (D76) |
| `GET /api/system/connections/:id/rate-limit-usage` | system | any (viewer too) |
| `PUT /api/system/connections/:id/rate-limits` `{rateLimitOverrides[{name, limit}], expectedUpdatedAt?}` | system | editor |
| `PUT /api/system/types/:id` (body carries the stored `outbound` spec through unchanged, since the form does not edit it, and sends `rateLimits` as the whole list), `PUT .../state`, `DELETE /api/system/types/:id` (body `{expectedUpdatedAt}`) | system | editor |
| `PUT` / `DELETE /api/system/types/:id/providers/:providerId`, `POST .../check` (`{}` or `{integrationKey}`) | system | editor |
| `/healthz`, `/auth/callback`, `/auth/logout` (204), `/api/bootstrap`, the static app | | console-kit |

Server rules worth knowing: reads send `read-<uuid>` as the gateway idempotency key; a request body with unknown fields is refused; the connect route returns only the connection's `id`, `name`, `typeCode`, `state`, `host`, `pathPrefix`, `reason`, `createdAt`, `metadata`, the link `{url, message, expiresAt}`, `reused` and `reusedFromRequestedAt` (never a provider, provider reference or Vault path); the link is never logged, never cached (`no-store`) and held only in component state until the dialog closes; only an `https` link (or `http` on localhost) without credentials is offered; the registry's error text never reaches the browser (the console's own sentences, field messages on a 400). The web app expires the session by its `expiresAt` (timer capped and re-armed, re-checked on `visibilitychange`/`focus`), shows a two-minute notice, and offers Sign out (`POST /auth/logout`, then the portal URL).

## Outbound enforcement

Architecture and reasons are in the [HLD](hld.md) (flow 7, decisions D68 to D79). This section is the implementation surface. Sources: `components/outbound-policy-1`, `shared/contract`, `deploy/outbound-gateway-1/envoy.yaml`, and the de-v2 applications `outbound-gateway-1` and `janus-redis-1`.

### ext_authz decision

Envoy sends each decrypted request to `outbound-policy-1:9001` (gRPC). The engine (`internal/policy`) runs these steps and stops at the first refusal. The refusal is an HTTP answer to the worker with `x-janus-decision: <code>` and the body `{"error":"<code>","message":"<reason>"}` (a reason the engine wrote, never a secret or token).

| Step | Code | HTTP | Notes |
|---|---|---|---|
| 1. Run token present and valid (RS256, STS keys, audience `janus-outbound-gateway`, class `run`, not expired) | `no_run_token`, `invalid_run_token` | 401 | headers `x-janus-run-token`, `x-janus-run-id`, `x-janus-activity` |
| 2. Connection for tenant, host and path (longest path prefix; the activity's granted candidates) | `no_connection` | 403 | read from the registry, cached |
| 2b. More than one granted candidate | `ambiguous_connection` | 403 | the call must carry `x-janus-connection: <connection id>`, one of the candidates |
| 2c. Connection `active` | `connection_not_active` | 403 | |
| 3. Grant: `run#runnable_in activity` and `activity#can_use connection` in Janus OpenFGA, with the token's facts as contextual tuples | `not_granted` | 403 | allowed checks are cached; a refusal never is |
| 4. Rules (Rego, base `internal/rules/base.rego`, default deny, rules from `RULES_DIR`) | `rule_denied`, `needs_body` | 403 | request-content rules (path, method, body) are not yet built: the rule set is one grant-only rule (`resources/base/outbound-policy-rules.configmap.yaml`) |
| 5. Rate limits (see [Redis usage](#redis-usage-and-availability-policy)) | `rate_limited` | 429 | body `RateLimitedBody`; headers `Retry-After`, `RateLimit-Policy: "<name>";q=<limit>;w=<seconds>`, `RateLimit: "<name>";r=0;t=<seconds>` |
| 6. Credential read and placement | `credential_unavailable` | 503 | a missing recorded Vault version (zero means the snapshot does not say), an unreadable secret, a provider that is not configured, a Nango token that cannot be fetched, a credential that does not fit the type; `credential_mode_context_not_supported` for `mode: context` |
| Any internal failure (lookup, authorization check, rule evaluation) | `policy_error` | 503 | fails closed |

On allow the engine returns headers to set, query parameters to set, and headers to remove (every `x-janus-*` header, plus the type's `stripHeaders`). Credential placement follows the type's compiled `OutboundSpec` (`internal/policy/credspec.go`, compiled once per distinct document): `stripHeaders` are removed first (unless the spec itself sets that header), then `staticHeaders` and the `credential` entries in order are set; placeholders by credential kind: `{token}` or `{access_token}` (oauth2, bearer), `{key}` or `{api_key}` (api_key), `{username}`, `{password}`, `{base64(username:password)}` (basic). A type with no spec is injected by its `placement` (`in`, `name`, `format` with exactly one placeholder). A Vault-backed connection is read with a child token (`auth/token/create/janus-conn-reader`, at most 15 minutes, the connection's read policy `janus-conn-*-read`) at exactly the recorded `vault_version`; a Nango-backed connection's token comes from `GET /connection/{ref}?provider_config_key=<key>`, cached for no longer than its own expiry less 60 seconds. Not built: `in: body` and `mode: context`.

### Worker API (port 8090, plain HTTP in the mesh)

| Route | Auth | Request | Answer |
|---|---|---|---|
| `GET /v1/trust-bundle` | none (public) | | the PEM of the root CA the certificates chain to |
| `POST /v1/run-tokens` | `Authorization: Bearer <projected service-account token>`, audience `janus-outbound-policy-1` | `{runId, workflowId?, workflow, activity, namespace?}` | `{token, expiresAt, tenant, automation, publication?, rootRunId?}` |

Processing of `POST /v1/run-tokens`, in order, each step failing closed:

1. **Pod identity.** Kubernetes TokenReview of the token (audience `janus-outbound-policy-1`; a token for another audience is refused): namespace and service account.
2. **Publication.** A live publication lists the activity, and the reported `workflow` is the publication's root workflow or one it calls. Published ids are global; more than one match is refused, never guessed.
3. **Worker.** The caller's `DynamoWorker` resources, listed in the caller's namespace (cached 60 s, refreshed at most every 5 s on a miss): exactly one runs as the caller's service account (`status.serviceAccountName`, else `spec.serviceAccountName`; one without a service account never matches, so `default` never matches) and names the publication's tenant (`spec.userOrgId`), DT and worker (`dynamo-worker-<n>`). A failure to read them is a retryable `unavailable`.
4. **Temporal.** `DescribeWorkflowExecution` in the resource's `spec.temporalNamespace` (a different reported namespace is `wrong_namespace`), with the pod's own Temporal token (plaintext gRPC; the mesh carries mTLS). The run must exist, be `RUNNING`, have the reported workflow type, and its root execution must be the publication's root workflow; the root run id is taken from the description, so child workflows share their publication's token. Cached 30 s for a running run only. Temporal being down is a retryable `unavailable`.
5. **Token.** STS `POST /v2/internal/run-tokens` (only `outbound-policy-1` is allowed to attest) signs it for tenant, DT, publication (in the `automation` claim), workflow and activity; TTL `RUN_TOKEN_TTL`.

| Code | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | no or invalid service-account token |
| `invalid_request` | 400 | malformed body |
| `not_published` | 403 | no live publication contains this activity in this workflow |
| `wrong_worker` | 403 | the caller is not the worker the publication names |
| `ambiguous` | 403 | the activity resolves to more than one publication |
| `wrong_namespace` | 403 | the reported Temporal namespace is not the worker's |
| `run_not_live` | 403 | Temporal has no such running run of this publication |
| `unavailable` | 503 | STS, the registry, Kubernetes or Temporal failed: retry |

### Certificates and xDS

- **Groups.** `contract.OutboundCertGroups(hosts)` groups the registry's active hosts by registrable domain (ICANN public suffix plus one label; a private suffix such as `myshopify.com` groups under its ICANN parent; a host that is itself a public suffix has no group). A group's names are the apex (in part 0) and one `*.<parent>` per distinct parent of an active host below the apex. At most `MaxNamesPerCertificate` (50) names per certificate; a domain needing more is split into numbered parts, each wildcard in exactly one. `OutboundHost` accepts only public DNS names of two labels or more, lower case, without port, never an IP, wildcard or a name under `OutboundExcludedDomains`.
- **Issuance** (`internal/certs`). Every `CERT_SYNC_INTERVAL` the manager compares the active groups with its certificates: it issues for a new group or changed names, renews at one third of life left (72-hour leaves, so about every 48 hours), re-verifies a kept certificate for a new host, and drops a group that no longer exists. The leaf key is generated in memory, the CSR is signed at `janus-pki-outbound-1/sign/outbound-gateway-1`, and the leaf is verified like a worker would (chain to the root, name, server auth, the intermediate's constraints) before use. A group that cannot be issued keeps its previous certificate. On start every group is issued before xDS is served.
- **xDS** (`internal/xds`, ADS on `XDS_ADDR`, cluster `janus_xds` in the Envoy bootstrap). The snapshot holds the internal listener `tls_terminator` (one filter chain per server-name set, matched by SNI, each with the group's SDS secret), the route configuration whose virtual hosts list only the **active exact hosts**, and the dynamic-forward-proxy filter whose DNS cache config must be identical to the bootstrap cluster's (`egress_dns`). Envoy keeps its last configuration while the xDS server is away.

### outbound-gateway-1 (Envoy)

Source of truth: `deploy/outbound-gateway-1/envoy.yaml` in this repository (validated in CI with `envoy --mode validate`, `validate.sh`, workflow `envoy-validate.yml`); the de-v2 application `charts/apps/outbound-gateway-1/resources/base/envoy.yaml` is a copy: change here first, then copy. Static parts: listener `proxy` on 3128 (CONNECT only, handed to the internal listener `tls_terminator`; plain HTTP answers 403), listener `health` on 8081 (`/ready`), clusters `tls_terminator`, `egress_upstream` (dynamic forward proxy, V4 only, `auto_sni`, `auto_san_validation`, trusts the system roots) and `outbound_policy` (ext_authz gRPC to Service `janus-outbound-policy-1-ext-authz`, `failure_mode_allow: false`). Refused by construction: plain HTTP, an SNI with no filter chain, a `Host` header other than the SNI's host, any ext_authz failure, and every CONNECT before the first xDS snapshot.

```yaml
# de-v2 charts/apps/outbound-gateway-1/resources/base/deployment.yaml (skeleton)
kind: Deployment
metadata: {name: outbound-gateway-1}
spec:
  replicas: 1
  template:
    metadata:
      labels: {budybot.io/netpol: janus-outbound-gateway-1}
    spec:
      serviceAccountName: outbound-gateway-1
      securityContext: {runAsNonRoot: true, runAsUser: 101, seccompProfile: {type: RuntimeDefault}}
      containers:
        - name: envoy
          image: <ecr>/ob1-ecr-docker-hub-v1/envoyproxy/envoy:v1.34.1
          args: ["-c", "/etc/envoy/envoy.yaml", "--log-level", "info"]
          ports: [{name: proxy, containerPort: 3128}, {name: health, containerPort: 8081}]
          resources: {requests: {cpu: 100m, memory: 128Mi}, limits: {cpu: "1", memory: 512Mi}}
          securityContext: {allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: {drop: [ALL]}}
# Service outbound-gateway-1: port 3128. Argo CD Application outbound-gateway-1-app, project apps-janus-cluster-1-acd-proj-1,
# destination namespace ob1-tf-eks-de-v2-janus-1-ns-1, automated sync with prune and selfHeal.
```

### Audit records and the bucket

- **Layout** (`shared/contract/outbound_audit.go`, UTC): `<class>/dt=YYYY-MM-DD/hour=HH/<pod>-<flushUnixMillis>-<seq>.ndjson.gz`, `<class>` is `deny` or `allow`; the date and hour are the flush's, so a reader of a window reads its hours and the next hour. Line schema `OutboundAuditRecord` version 1: `v`, `kind` (`call` or `run_token`), `decision`, `code`, `reason` (at most 300 characters), `at`, `lastAt`, `count`, `tenant`, `connectionId`, `host`, `method`, `path` (at most 512, no query string), `runId`, `sampleRunIds` (at most 5), `activity`, and for run-token records `workflow`, `workflowId`, `namespace`, `serviceAccount`, `publication`, plus `pod`. Never a header value, token, credential or query string.
- **Writer** (`internal/auditsink`). A bounded in-memory queue (4096 records) that never blocks or fails an ext_authz answer (a full queue drops and counts). A background loop writes one object per class every `AUDIT_FLUSH_INTERVAL` (5 minutes) or at 5 MiB buffered, and once more at shutdown (bounded at 10 seconds). Identical denies in one flush (same kind, tenant, connection, host, code, reason, activity and method, and for run-token records publication, workflow, namespace and service account) collapse into one record with a count, first and last time and sample run ids; an allow is never collapsed. A failed `PutObject` is retried with backoff, then dropped and counted. Capture `deny` writes refusals and failures; `all` also writes allows; `none` writes nothing. Without `AUDIT_BUCKET` decisions are only logged and counted.
- **Bucket** (cloud-management `janus-outbound-audit-s3.tf`, one per account): `ob1-tf-budy-janus-outbound-audit-bucket-<account id>`, versioning off, public access blocked, `BucketOwnerEnforced`, SSE-S3, TLS-only policy, a lifecycle rule per prefix (expiry per class prefix, `deny/` and `allow/`, set in the Terraform) and abort of incomplete multipart uploads after 1 day, `force_destroy` off. Writer role `ob1_tf_aws_eks_janus-outbound-audit-writer_1_role_1`: `s3:PutObject` on `deny/*` and `allow/*` for service account `outbound-policy-1`. Reader role `ob1_tf_aws_eks_janus-outbound-audit-reader_1_role_1`: `s3:ListBucket` (prefix `deny/*`, `allow/*`) and `s3:GetObject` on the same prefixes for service account `console-1`. If the bucket moves to a customer-managed KMS key the reader also needs `kms:Decrypt`.
- **Reader** (`console-1`, D76). Lists the hour prefixes that overlap the window plus the next hour, skips objects whose flush time precedes the window, reads newest first and filters in memory. Bounds per query: 400 objects, 64 MiB decompressed (16 MiB per object, reserved before each read), 500 rows, 4 concurrent bucket calls per process, 5000 listed keys per hour; the answer says when a bound cut it (`truncated`). Parsed objects are kept in an LRU of 32 MiB; an hour's listing is kept 10 minutes once closed and 20 seconds before that.

### Connection usage API

`POST /v1/connection-usage` on the registry's usage port (8081, Service `janus-connection-registry-1-usage`), plain HTTP, `application/json`, body at most 256 KiB: `{connections: [{connectionId, lastUsedAt}]}`, at most 1000 entries. No application authentication: the Istio `AuthorizationPolicy` on that port admits only `outbound-policy-1`'s principal (ports and principals only). The registry keeps the later of the stored and reported time in one statement, ignores unknown ids, refuses an entry one by one (empty id, longer than 64, control characters, a missing time or one more than two minutes ahead) and answers `{updated, rejected?}`. `outbound-policy-1` reports every `USAGE_REPORT_INTERVAL` (60 s), keeps a failed batch for the next tick, and bounds the pending set at 10,000 connections (oldest dropped and counted).

### Read cache and change notices

`CACHE_TTL` (30 s) caches, per pod: the connection rows per tenant and host, the publications of an activity, allowed OpenFGA checks, the Vault credential of a recorded version, the Nango token, and the run check's describe of a running run. Refusals, errors and runs that are not running are never cached; concurrent misses on one key share one backend call. A dedicated database connection with the registry reader's settings runs `LISTEN janus_registry_changed`; every notification drops every cache, and while that connection is down (and at start, until it is listening) all caches are bypassed. Without a database (the interim connections file) the TTL alone applies. The usage reads bypass the cache.

## Redis usage and availability policy

**Instance.** `janus-redis-1`, de-v2 Argo CD application `janus-redis-1-app` (project `apps-janus-supporting-1-acd-proj-1`) in the Janus namespace: Bitnami `redis` chart, pinned by hand, `architecture: standalone`, one pod, `persistence` off, `appendonly no`, `save ""`, `maxmemory-policy volatile-ttl`, `maxmemory` and the pod's memory requests and limits set by chart values. Image `bitnami/redis` through the ECR Docker Hub cache, pinned by digest. Metrics off, `networkPolicy` off (k8s-security owns it). Pod label `budybot.io/netpol: janus-redis-1`; service account `janus-redis-1` (created in `resources/base`, no token mounted). Service `janus-redis-1-master` on 6379.

**Password.** Vault path `app-kv-secrets-1` `v1/de-v2/<ns>/janus-redis-1/root-user`, key `password` (random, written by hand before the first sync), delivered by VSO (`VaultAuth` role `ob1_tf_vault_janus-redis-1_role_1`, `VaultStaticSecret` `janus-redis-1-password`, `refreshAfter: 1h`) as Secret `janus-redis-1-password`; Redis reads it as `requirepass`, `outbound-policy-1` mounts the same Secret. After a change restart the StatefulSet and `outbound-policy-1` together.

**Keys** (`internal/ratelimit`). Per limit and window, buckets of the window's length: `janus:rl:c:<connectionId>:<name>:<bucket>` (scope `connection`) and `janus:rl:t:<typeId>:<name>:<bucket>` (scope `type`), each with a TTL of two windows. A connection without limits makes no Redis call.

**Decision script.** One atomic Lua call per decision (`EVALSHA`, `EVAL` when the server lost the script): reads the server's `TIME` (so pods with different clocks count into the same buckets), computes `estimate = prev * (window - elapsed) / window + cur` for every limit, and increments the current buckets (and `PEXPIRE`s them) only when `estimate + 1 <= limit` for all of them; otherwise it counts nothing and returns the refusing limit with the longest wait. The wait is the earliest time the estimate admits a call: within the current bucket `window * (1 - (limit - 1 - cur) / prev) - elapsed`; when the current bucket alone is full, the rest of the bucket plus `window * (1 - (limit - 1) / cur)`; rounded up to whole seconds, at least 1. The reason in the audit names the limit without the wait (`rate limit hourly (1000/1h, connection) reached`) so refusals of one limit collapse. Client: `go-redis/v9`, pool of 4, `RATE_LIMIT_TIMEOUT` 100 ms per call, no retries.

**Availability policy: fail open.** A Redis error or timeout does not refuse the call. The pod answers from an in-memory limiter with the same algorithm at its share of each limit, `ceil(limit / RATE_LIMIT_REPLICAS)` and at least 1, and skips Redis for 5 seconds before trying it again; with no Redis configured every call is counted that way (one warning at start). Rationale in the HLD (decision D79). A vendor's own 429 is not touched. Every other dependency of the decision path fails closed.

**Usage reads** never use the skip window and never count (see the capabilities above). A restarted Redis comes back empty, which only starts the windows over.

## Observability of the outbound path

Prometheus on `METRICS_ADDR` (9464, `/metrics`), `outbound-policy-1`:

| Metric | Labels | Meaning |
|---|---|---|
| `janus_outbound_policy_decisions_total` | kind, decision, code | every decision and run-token outcome |
| `janus_outbound_policy_rate_limit_checks_total` | result (`allowed`, `limited`) | limiter checks |
| `janus_outbound_policy_rate_limit_limited_total` | scope | refusals by scope |
| `janus_outbound_policy_rate_limit_fallback_total` | | calls answered by the in-memory fallback |
| `janus_outbound_policy_rate_limit_redis_up` | | 1 when Redis answers |
| `janus_outbound_policy_rate_limit_check_duration_seconds` | | limiter latency |

The audit writer, cache, usage reporter and gateway control plane also export counters (writes, drops, hits, reports, certificate state); names are in `internal/metrics`. Every decision also has one structured log line (ids, code and host; never a header, token, credential or query string).

## Vault paths and policies

| Vault | Mount / path | Written by | Read by | Content |
|---|---|---|---|---|
| **Janus Vault** (`janus-vault-cluster-1`) | KV v2 `janus-connections/tenants/<tenant>/connections/<id>` | intake-1 (and oauth-provider-1) via role `ob1_janus_intake-1_role_1`, policy `janus-connection-writer` | outbound-policy-1 through a 15-minute child token (`janus-conn-reader`, per-connection read policies), just in time for one call | tenant credential fields, one KV version per revision |
| Janus Vault | `janus-platform` | vault-manager-1 | | provider keys (reserved) |
| Janus Vault | `janus-pki-root-1`, `janus-pki-outbound-1` (PKI) | vault-manager-1 (root, intermediate, role) | outbound-policy-1 signs CSRs at `janus-pki-outbound-1/sign/outbound-gateway-1` (policy `janus-outbound-pki-sign`); anyone reads the public root | the outbound CA; keys never leave the Vault |
| **Platform Vault** (`vault-cluster-2`), `app-kv-secrets-1`, base `v1/de-v2/ob1-tf-eks-de-v2-janus-1-ns-1/` | `connection-registry-1/intake-session-key` (`key`), `connection-registry-1/nango` (`secretKey`), `janus-cluster-1-intake-1/nango` (`secretKey` = API key, `webhookSigningKey` = signing key), `janus-cluster-1-outbound-policy-1/nango` (`secretKey`), `janus-cluster-1-console-1/session` (`sessionSecret`), `janus-cluster-1-outbound-policy-1/openfga-key` and the other OpenFGA key paths, `janus-redis-1/root-user` (`password`) | the owner | VSO into Kubernetes Secrets | service secrets |

`intake-1-nango` (VSO `VaultStaticSecret` in `resources/base/intake-nango.vss.yaml`) maps `apiKey` ← `secretKey`, `signingKey` ← `get .Secrets "webhookSigningKey"` (an empty value, not a literal, when the field is missing). The janus Vault's own bootstrap (initialization, recovery keys, break-glass) is in `docs/content/janus-vault-operations.md` and `deploy/janus-vault-bootstrap/`. The root token is documented as revoked; custody of recovery keys is the owner's.

## Chart and GitOps wiring

**Umbrella chart** `charts/janus-cluster-1` (published as `janus-cluster-1-repo-1` to OCI on ECR): top-level values keys `global`, `temporal`, `config`, `gateway-1`, `connection-registry-1`, `publish-1`, `outbound-policy-1`, `vault-manager-1`, `intake-1`, `oauth-provider-1`, `openfga-bootstrap-1`, `console-1`, `janus-catalog-1`. Temporal resources (namespace, connection, Nexus endpoint and its connection Secret) are created by the umbrella through Crossplane. `config.logLevel` configures the **Temporal worker library** only; intake-1 and the registry read their own `logLevel`.

**GitOps** (`ob1_mn_gh_de-v2_gitops_repo_1`, `charts/apps/janus-cluster-1/`): `app.yaml` (ArgoCD Application `janus-cluster-1-app`, project `apps-janus-cluster-1-acd-proj-1`), `values/` layers (default, base, profile and per-deployment files) and `resources/base/` (VSO secrets `intake-nango`, `intake-session-key`, `outbound-policy-nango`, `vault-auth`, and the ConfigMap `outbound-policy-1-rules`). Layers apply in that order, later wins. The outbound settings are in `base`: `outbound-policy-1.extAuthz.enabled`, `extAuthz.gateway.enabled`, `extAuthz.gateway.runToken.stsUrl`, `extAuthz.openfga.*`, `extAuthz.vault.*`, `extAuthz.nango.*`, `audit.capture: deny`, `rateLimit.redis.addr` (`janus-redis-1-master...:6379`) and `passwordSecret`, and `vault-manager-1.janusVault.outboundPKI: true`. The per-deployment values carry the audit bucket and the two IRSA role ARNs (`console-1.audit.*` reader, `outbound-policy-1.audit.*` writer) of the AWS account.

**Other de-v2 applications** (`charts/apps/`): `outbound-gateway-1` (`outbound-gateway-1-app`, project `apps-janus-cluster-1-acd-proj-1`; plain manifests: Deployment, Service `outbound-gateway-1` on 3128, ServiceAccount, the Envoy ConfigMap) and `janus-redis-1` (`janus-redis-1-app`, project `apps-janus-supporting-1-acd-proj-1`; Bitnami chart plus `resources/base`; pinned by hand). Worker-side settings are in `charts/apps/nainai-cluster-1` (`operator-1.defaults.platform.janus`: `proxyURL`, `noProxy`, `apiURL`; tokenAudience default `janus-outbound-policy-1`): the operator appends `HTTPS_PROXY`/`https_proxy`, `NO_PROXY`/`no_proxy`, `NODE_USE_ENV_PROXY=1`, `JANUS_OUTBOUND_API_URL` and `JANUS_SA_TOKEN_FILE=/var/run/secrets/janus/token`, and mounts the projected token volume `janus-token`; those names are reserved (a template that sets them fails to render), and `JANUS_CA_FILE`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE` and `SSL_CERT_DIR` are reserved too because the worker images carry the Janus roots (`certs/janus/janus-root.pem`, the Janus roots) as their only trust.

**ArgoCD projects** (`ob1_mn_gh_argocd-critical-stack_repo_1`, `v2/env/_base/bootstrap/projects/applications/`): `apps-janus-cluster-1-acd-proj-1` (the Janus namespace, the Temporal namespace and Nexus endpoint kinds), `apps-janus-supporting-1-acd-proj-1` (Janus Vault and OpenFGA namespaces). **`apps-de-v2-services-acd-proj-1` must list `ob1-tf-eks-de-v2-janus-1-ns-1` as a destination**: the `backend-services-cluster-1` chart's `api-gateway-1` renders a `ReferenceGrant` in that namespace so the gateway can route `/v1/connections/*` to `intake-1`; without the destination ArgoCD refuses the resource and the whole app does not sync (fixed in argocd-critical-stack PR 197).

**Edge routing** (`backend-services-cluster-1`, chart `api-gateway-1`): `contracts/intake` declares `inspectConnectionSession`, `/credentials`, `/session/connect`, `/session/status` (auth `capability`: the signed session in the body) and `POST /v1/connections/webhooks/nango` (signature auth); all five route to backend `intake-1` (Service `intake-1`, namespace `ob1-tf-eks-de-v2-janus-1-ns-1`, port 80 → pod 8080) and are listed as `unauthenticated` in the gateway's `AuthorizationPolicy` (so no bearer token is needed). The edge replies for a denied path are rewritten to `401 application/problem+json` ("Sign in to continue"): a **403 from Istio RBAC and a missing token look identical** at the edge.

**Network and mesh policy** (`ob1_mn_github_k8s-security_gitops_repo_1`, `v1/objects/netpol/manifests/de-v2-janus-1-ns-1/`): namespace default deny; `ingress/` `console-1.allow-istio-ingress-gateway`, `console-1.allow-temporal-callback`, `intake-1.allow-api-gateway-1` (+ `.authorizationpolicy`: principal `cluster.local/ns/ob1-tf-eks-api-gateway-ns-1/sa/api-gateway-1-istio`, port 8080), `intake-1.allow-temporal-callback` (+ `.authorizationpolicy`), `console-1.allow-required.authorizationpolicy`, `connection-registry-1.allow-outbound-policy-1` (+ `.allow-required.authorizationpolicy`, usage port 8081, principal `.../sa/outbound-policy-1`), `outbound-policy-1.allow-outbound-gateway-1`, `outbound-policy-1.allow-workers` (8090), `outbound-policy-1.allow-required.authorizationpolicy` (9001, 9002, 8090), `outbound-gateway-1.allow-workers` (+ `.authorizationpolicy`, 3128) and `outbound-gateway-1.deny-tenant-other-ports.authorizationpolicy`, `janus-redis-1.allow-required` (+ `.authorizationpolicy`), `namespace-wide.default-deny` and the namespace-wide deny-all `AuthorizationPolicy`; `egress/` per-component `*.allow-required` (registry, console, intake, oauth-provider, publish, vault-manager, outbound-policy, outbound-gateway, gateway, janus-redis-1), `janus-components.allow-janus-vault`, `janus-components.allow-janus-openfga-1`, `temporal-workers.allow-external-payload-store-and-vault`, `namespace-wide.allow-required`, `namespace-wide.deny-missing-label`; `strict-mtls.peerauthentication.yaml`. The clusterwide policy `egress-dynamo-worker-allow-required` (`v1/objects/rbac/cluster/manifests/dynamo-worker-netpol/`) limits DT Dynamo workers (label `budybot.io/netpol: dynamo-worker-netpol-1`, namespaces labelled `managed-by=user-org`) to DNS for `**.cluster.local`, the Temporal frontend (7233, 7243, 15008), `outbound-gateway-1` (3128, 15008) and the outbound-policy-1 worker API (8090, 15008), and denies the API server, the host, other nodes and the metadata address. Pods are matched by the label `budybot.io/netpol: janus-<component>`; Gatekeeper `budy-netpol-identity` lists the allowed identities. The generated `inventory/` must be regenerated in the same commit (`python3 tools/policy-inventory/policy_inventory.py --write`).

## CI/CD and release

Shared pipeline pinned at `@v1`, driven by `.github/components.json`.

- **Pull request** (`ci.yml` → `app-cluster-ci.yml`): `detect`, `changeset` (a `.changeset/*.md` file or label `no-changeset`, package names must equal catalog packages, a dry run of `changeset version`), `validate-chart`, `check-go` per Go module (vet, test, build; the registry's store tests run against Postgres), `check-node` for console-1, `catalog-chart` (`scripts/lint-catalog-chart.sh`: the Tool and Skill resources; `setConnectionMetadata` and the other internal capabilities are forbidden in any tool), and the aggregate `ci-required`. A superseded run shows `cancelled` and the aggregate reports failure: it is not a real failure.
- **Release** (`release.yml`, on push to `main`): a merged changeset opens the Release PR, which may change only `package.json`, `CHANGELOG.md` and `.changeset/**`. Merging it builds and pushes the changed images (`<component>-<version>-<sha7>`), tags `shared/contract/v<version>`, creates `<component>/v<version>` tags, and opens the **chart-release PR** (the only thing that bumps the umbrella chart; CI owns chart versions, never hand-bump). A chart-only change needs the label `no-changeset`; after it merges CI opens the chart PR from the shared `resolve-chart-release` + `chart-release-pr`. Merging the chart PR publishes the chart and opens a CHANGELOG-only PR in de-v2.
- **Local**: `make test`, `make lint-catalog-chart`, `make openfga-model`, `npm run changeset`. Commit the root `package-lock.json` (changesets needs it to see the workspaces); console-kit comes from GitHub Packages with `min-release-age=7`, so a new kit version needs its lockfiles regenerated through a disposable workflow when offline.

## Logging

Structured `slog` lines (text format through the process default logger for Go; JSON for the console). IDs, outcomes and fixed-word causes only: **never** a session, link, credential, Vault path contents, webhook body or signature, client address, request path or header, or the text of a dependency's error (tests assert this for intake, the registry and the console).

| Component | `LOG_LEVEL` | Info | Debug | Warn | Error |
|---|---|---|---|---|---|
| `intake-1` | env `LOG_LEVEL`, default `info` | `startup` (hosts and ids only, once), `connection_completed` | `session_inspected`, `session_status`, `provider_session_created`, `credential_written`, `webhook_received`, `webhook_ignored`, `callback_delivered` | `request_refused` (with `reason`), `rate_limited`, `vault_cas_conflict`, `completion_refused`, `webhook_refused`, `webhook_unknown_connection`, `webhook_completion_refused`, `callback_refused` | `provider_session_failed`, `provider_not_configured`, `vault_write_failed`, `registry_unavailable` (with `cause`), `webhook_refused` for `secret_not_configured` |
| `connection-registry-1` | env `LOG_LEVEL`, default `info` | `connection requested`, `connection completed`, `connection revoked`, `vault destruction queued` | `catalog write`, `connection metadata changed` | `connection request refused`, `connection create refused`, `connection completion refused`, `connection revoke refused` (code + fixed refusal text), `nango connect session failed`, `nango integration check failed` | an internal failure (`code=INTERNAL`) |
| `console-1` | `CONSOLE_LOG_LEVEL`, chart default `warn` | `connection requested` (outcome `created`/`reused`/`forced`) | registry call timings and statuses | `connection request refused`, `registry call failed` | |

`outbound-policy-1` writes one structured line per decision and run-token outcome (code, host, connection id and run id; never a header, token, credential or query string) and logs dependency degradation (for example Redis unreachable, once per skip window) as warnings; its durable trail is the audit bucket, not the log.

Every intake line has `event` and `request`. The request id is the edge's `X-Request-Id` when it matches `^[A-Za-z0-9._:-]{8,64}$`, otherwise a fresh 16-hex id; it is answered in the same header and **sent to the gateway on every registry try**, so intake's lines, the gateway's and Temporal's share it. The registry's `request` field is the idempotency key the gateway passed, else `run:<workflow run id>` (the capability request carries no console or edge request id). `registry_unavailable` carries a fixed-word **cause**: `no_identity_token`, `gateway_unreachable`, `gateway_timeout`, `gateway_status_<code>`, `answer_unreadable`, `no_callback` (the wait ended with nothing), `operation_failed` (the callback said failed or canceled), `callback_token_mismatch`, `no_operation_token`. A refused identity (401/403) is logged separately ("the registry refused this service's identity") and carries no cause.

## Testing

| Suite | What it covers | How it runs |
|---|---|---|
| `shared/contract` | validation helpers, intake session sign/verify, capability name lists vs manifests, the callback receiver, `LooseBool` | `go test` |
| `connection-registry-1/internal/activities` | every capability against an in-memory fake repository: identity checks, naming (host-aware bases, numbering, truncation, unicode), reuse and `forceNew`, key hits, reason rules, metadata rules and the 20-key limit, the catalog editor (replay, stale writes, retired and delete rules), logging (no link, session or reason in a line) | `go test -race` |
| `connection-registry-1/internal/store` | the PostgreSQL repository and **every migration** (up, down, up again; 00007 renumbering; 00008 with seeded revisions and grants: the destroy queue holds the right path and versions, the immutability trigger is back and still blocks deletes, an editor-renamed type is left alone, metadata cascades); concurrency (30 racing metadata writes) | needs `TEST_DATABASE_URL` (a scratch PostgreSQL 16); skipped without it; CI provides one |
| `internal/capabilities` | each manifest schema accepts and refuses the payloads it should (`capabilitytest.Verify`) | `go test` |
| `intake-1` | every route and failure mode with a recognisable secret, session and token asserting none reaches a log line or an error body; the registry client against a fake Temporal (201 + callback before and after the answer, failed/canceled/mismatched token, retries and distinct per-try keys, causes); config and app wiring; the Nango client and `Verify` | `go test` |
| `console-1` | server routes (scope and boundary, write mapping, error sentences, the connect route and the link-never-logged check), the shared rule modules, static-render tests of the pages and dialogs, the session timer rules; about 330 tests | `vitest`, `tsc --noEmit`, `vite build` |
| `openfga-bootstrap-1` | the bootstrap run against a fake OpenFGA; the model drift test (the `.fga` source vs the embedded JSON) | `go test` |
| `outbound-policy-1` | the decision engine against fakes (every step and code, credential injection, the credential spec, Nango, selection among granted connections), the ext_authz mapping, the rate limiter (window maths, the Lua script against `miniredis`, the read-only peek, the in-memory fallback and Redis skip window), the audit writer (collapse, bounds, flush, retry, drop), the cache and its bypass, the usage reporter, the worker API, the certificate manager and xDS snapshots, the two usage capabilities and the manifest check; registry queries and an end-to-end test (a certificate issued and pushed over ADS, the trust bundle served, a run token issued to a published worker) run against Postgres with the real migrations. Target 90% statement coverage | `go test` (the Postgres tests need `TEST_DATABASE_URL`; CI provides it, `db-tests.yml`) |
| `vault-manager-1` PKI | the PKI reconcile (`internal/reconcile/pki_test.go`): root, intermediate, rotation, the role from the host set | `go test` |
| Envoy bootstrap | `deploy/outbound-gateway-1/envoy.yaml` and the xDS-served listener shape | `envoy --mode validate` through `validate.sh`, workflow `envoy-validate.yml` |
| `console-1` Outbound activity | the bucket reader against a fake bucket of real gzipped NDJSON (hour prefixes, next-hour rule, bounds, caches, coalescing, summary), the S3 calls against a fake client, the refresh loop with fake timers | `vitest` |
| Not covered | browser behaviour of the console (focus, the native dialogs, clipboard, CSS truncation) is not exercised by the HTML-render tests; the catalog Helm lint needs `helm` and runs in CI; no test runs a real Envoy, gateway and worker together in CI (the Envoy configuration is only validated); no test reads a real bucket, exchanges a real web identity token or talks to a real Redis, Temporal or Nango for the outbound path | see runbooks |

## Runbooks

### Confirm a connect flow

1. As a tenant user with an `editor` session open the console, Connection types → **Connect** on a type, enter a reason. Expect the answer with a link; a second Connect within the hour returns the same pending connection with the reuse notice; **Start another** creates a numbered second one.
2. Open the link: the connect page loads (`session/inspect` 200 in intake's log at debug level as `session_inspected`). For an API-key type enter the key (`credential_written`, `connection_completed via=form`, the connection shows `active`). For a Nango type the page sends you to Nango's connect UI; after approval Nango's webhook (`webhook_received`, `connection_completed via=webhook`) moves it to `active`.
3. Check Temporal: the gateway workflow for each call shows the child `ConnectionRegistryWorkflowV1` completing, and the Nexus callback state `Succeeded`.

### Confirm the outbound path

1. **Control plane.** `describeVaultState` shows the outbound PKI; `GET http://janus-cluster-1-outbound-policy-1-api.<ns>:8090/v1/trust-bundle` answers the root; the gateway's log shows the LDS update; `outbound-gateway-1` is Ready (it is not until the first xDS snapshot).
2. **Refusals.** A call through the proxy with no run token answers 401 `no_run_token`; with a token for an activity that is not granted the connection, 403 `not_granted`. Each appears in the console's Outbound activity page (class `deny`, a window around the time).
3. **A granted call.** A granted Google Calendar call from a published worker succeeds. With `audit.capture: all` its allow appears under the bucket's `allow/` prefix within one flush interval, and the connection's *Last used* in the console moves within a minute.
4. **Rate limits.** Give a type a low limit (for example 2 per minute), exceed it: the call answers 429 `rate_limited` with `Retry-After`; the worker retries after that wait; **Check current usage** on the connection shows the full limit and the wait. With Redis stopped, calls still pass (fail open) and `..._rate_limit_fallback_total` grows.
5. **Revoke.** Revoke the connection: the next call is refused with a fixed code without waiting 30 seconds, because the change notice drops the caches.

### Known failures (cause → fix)

| Symptom | Cause | Fix |
|---|---|---|
| Connect page `session/inspect` returns `401 application/problem+json` "Sign in to continue", intake has no logs | the gateway did not have the intake routes: `apps-de-v2-services-acd-proj-1` lacked the Janus namespace as a destination, so the `api-gateway-1` ReferenceGrant failed and the app did not sync (no `intake-1` HTTPRoute; the gateway policy kept the old open-path list) | add `ob1-tf-eks-de-v2-janus-1-ns-1` to the project's destinations (argocd-critical-stack PR 197); check the Application's sync result |
| Gateway workflow returns `PERMISSION_DENIED: this capability is internal` | `INTERNAL_CALLERS` unset in the registry because `internalCallers` sat under `nango:` in the GitOps values | put it under `connection-registry-1.registry.internalCallers` |
| Workflow completes but intake shows `registry_unavailable` / the page waits; Temporal shows "Nexus Callback has failed ... handler error (UNAUTHORIZED)" | an Istio `ALLOW` policy on intake-1 listed only the API gateway and denied Temporal's delivery to port 3001 (403) | the Temporal-callback AuthorizationPolicy (k8s-security PR 629); any new ALLOW policy on a callback receiver needs the same rule |
| `cause=gateway_status_500` with the gateway log "Workflow execution is already running" | two identical gateway calls without an idempotency key shared a workflow id (a retry of a call still running, or concurrent polls) | send a fresh `idempotencyKey` per try (done in console reads and intake) |
| Nango webhook `webhook_refused reason=invalid_signature` while the connect session works | the webhook was verified with the API key; Nango signs with the separate **webhook signing key** | store the signing key in `webhookSigningKey` and use the two-file configuration; compare `secret_fp` |
| `UNAVAILABLE connect_base_url_not_configured` / `intake_base_url_not_configured` | the registry has no public base URLs | set `registry.connectBaseUrl` / `intakeBaseUrl` in the chart values |
| New pod in `CreateContainerConfigError` after a chart upgrade | the chart reads a Secret key the Secret lacks (for example `apiKey` / `signingKey` before the VSO template added them) | upgrade the GitOps resources first (keep the legacy key while the old chart runs), then the chart |
| Console "service not answering" 503 | historical: `Execute` answers 201 and the console treated it as unavailable | the callback listener, allowlist and policies above |

## Not verified

- **Nango scope names** (`environment:connect_sessions:write`, `environment:integrations:read` / `read_credentials`, `environment:connections:read` / `read_credentials`, `environment:connections:delete`) come from Nango's public documentation; confirm in the dashboard when creating each key. Whether the integration Check strictly needs `read_credentials` was not tested.
- **Shared-kit behaviour** (`budy-common-modules`): the gateway's workflow-id derivation, the edge `401` rewriting and the STS verification are described from this repository's docs and observed behaviour, not from the kit's source.
- **Worker side.** The behaviour of the TypeScript and Go DT Dynamo workers and of the Dynamo operator is taken from their repositories' READMEs, changelogs and tests, not run.
- **Vendor limits.** The default rate limits seeded by migration 00015 come from vendors' documentation as the migration records it and were not checked against the vendors' pages.
