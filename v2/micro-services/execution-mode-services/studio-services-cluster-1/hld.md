---
name: Studio Services Cluster — HLD
code: studio-services-cluster-1-hld
version: 0.1
status: draft
last_updated: 2026-10-28
---

# Studio Services Cluster — High Level Design

## Overview

The Studio Services Cluster (`studio-services-cluster-1`) is where artifacts are created. An artifact is a typed, versioned piece of work product that Digital Teammates (DTs), workflows and people produce and read together. Two types exist: `doc` (Markdown) and `dashboard` (a declarative spec whose data is pushed in separately). The cluster stores artifacts, keeps their revisions, controls who may read them and renders them as web pages.

It is a Nexus-first cluster. DTs and workflows in other clusters call a generic gateway (`gateway-1`) that authenticates the STS token, validates the payload against a capability schema and starts a child workflow on the component's task queue; the component, `artifact-store-1`, owns every write. A second component, `artifact-web-1`, is a read-only HTTP service for people: it authenticates a reader, reads the artifact straight from the store and renders HTML. Both components use the same store library, so "latest", validation, tenancy and share checks exist once.

Artifact content is written to one S3 object per revision; metadata (artifacts, revisions, dashboard input updates, shares, idempotency records) lives in PostgreSQL. Revisions are immutable, a dashboard's spec (design) is separate from its inputs (data), and readers without a platform identity get access through link or basic-auth shares.

## Architecture Diagram

```text
 DT / workflow (other clusters)                     browser, customer
        │ Nexus Execute                                    │ https://artifacts.budybot.ai
        ▼                                                  ▼
 ┌─ studio-services namespace ─────────────────────────────────────────────────────────────┐
 │  gateway-1                                         artifact-web-1  (HTTP, read-only)     │
 │   1 STS token (JWKS)                                 /a/<id>  /s/<token>  /session       │
 │   2 payload schema                                   auth: STS bearer or cookie, link,   │
 │   3 child workflow                                   basic share; rendering              │
 │        │                                                   │                              │
 │        ▼                                                   │                              │
 │  artifact-store-1  (Temporal worker)                       │                              │
 │   ArtifactStoreWorkflowV1 → Execute activity               │                              │
 │        │                                                   │                              │
 │        └──────────────────┐        ┌───────────────────────┘                              │
 │                           ▼        ▼                                                      │
 │                       shared store library (tenancy, revisions, types, shares)            │
 └────────────────────────────┬─────────────────────┬────────────────────────────────────────┘
                              ▼                     ▼
                  RDS PostgreSQL (metadata)   S3 bucket (content, one object per revision)
```

External systems: the auth cluster's STS (token verification over JWKS), Temporal, RDS, S3, Vault (database credentials).

## Deployment Model

| Property | Value |
| --- | --- |
| Type | Umbrella chart `studio-services-cluster-1-repo-1` in namespace `ob1-tf-eks-de-v2-studio-services-1-ns-1`; sub-charts per component |
| Language | Go |
| `gateway-1` | Temporal worker with the Nexus service; reads the capability manifests from a ConfigMap |
| `artifact-store-1` | Temporal worker, Pinned worker versioning; also runs as a pre-upgrade migration Job and a daily purge CronJob (same image, different argument) |
| `artifact-web-1` | Deployment with a ClusterIP Service behind the Istio ingress at `artifacts.budybot.ai`; health on port 3000 |
| Storage | One RDS PostgreSQL database and one S3 bucket for this cluster |
| Disabled by default outside dev | Stage and prod ship switched off until promoted |

## Core Interfaces

Architectural contracts, not implementation types:

- **Artifact type.** A type version turns the JSON form callers send into stored bytes (validating it), turns stored bytes back into JSON, applies typed patch operations, and, for types with inputs, declares and validates inputs. A registry holds the type versions a build knows and exactly one active version per type.
- **Object store.** Put, get and delete of immutable content objects by key.
- **Authorizer.** Decides whether an identity may read, write, share or archive an artifact in its own tenant. Everyone is checked, the owner included, against the OpenFGA model `artifact-store-1` through `go/authz` (fail closed: a deny is a deny, an outage is `UNAVAILABLE`, never an allow). The store's record of the creator is handed to the model as a contextual `owner` tuple (until `authz-manager-1` can persist owner tuples), and every check carries the token's session boundary as the contextual `session_<boundary>` tuple, so each permission extends from the platform's `active_*` session tiers: a viewer-boundary session can read and cannot write, share or archive, and a token without a boundary holds no tier. The seed job is the one exception: an operator-run job with no session that uses an owner-only authorizer. One implementation, `storeauthz`, serves both components.
- **Share evaluation.** Resolves a token or a username and password to a live share (not revoked, not expired, artifact not archived), enforces password attempt limits and counts views.

## Schema Definitions

### Artifact

| Field | Meaning |
| --- | --- |
| `id` | `art_<ULID>`; time-sortable and opaque |
| `tenantId`, `owner` | From the verified token; every query filters by tenant |
| `type`, `typeVersion` | Pinned at creation; a new type version never changes existing artifacts |
| `title` | Free text, up to 200 characters |
| `latestRevision`, `createdAt`, `updatedAt`, `archivedAt` | Revision pointer and lifecycle |

### Revision

Immutable. `revision` (1..n), a content hash and size, the type version it was validated against, who wrote it and an optional message. The content itself is the S3 object. A revision also records the type's declaration of the inputs it accepts, so pushing inputs never reads S3.

### Dashboard spec (`dashboard@1`)

| Field | Meaning |
| --- | --- |
| `defaultRefreshSeconds` | Page refresh: 0 (off) or 30 to 86400; default 300 |
| `layout.columns` | 1 to 24, default 12 |
| `inputs` | Named inputs of type `number`, `string`, `boolean`, `table` (ordered, typed columns) or `series` (points of time and number); each may have a label and a unit |
| `widgets` | `stat`, `table`, `chart` (line or bar) or `markdown`, each placed by column and height, each bound to one declared input of a type it can show |

### Input update

`seq`, the merged value set, an optional caller-supplied `asOf`, `updatedAt`, `updatedBy`. The store keeps the five newest per artifact. A push validates its keys against the latest revision's declaration, merges onto the previous values and records the full result.

### Share

`auth` is `link` (a 256-bit token in the URL, stored hashed), `basic` (username and generated password at the artifact URL) or `link+basic`. Shares give the `view` role only, may pin a revision, expire and be revoked. Secrets are returned once.

## Component Breakdown

- **`gateway-1`.** Generic: authenticates, validates, routes. No business logic, no state; it learns components and capabilities from manifests.
- **`artifact-store-1`.** One workflow and one activity. The activity's first act is to assert the tenant; it then dispatches the capability to the store, maps store errors to typed responses (infrastructure detail never reaches callers) and lets the workflow retry only unavailable dependencies.
- **`artifact-web-1`.** Authenticates a reader, asks the store for content, renders. Documents go through a CommonMark renderer with raw HTML disabled and a sanitiser on its output. Dashboards are server-rendered pages that load two vendored libraries (a chart library and a small AJAX/refresh library) and fetch their own URL again on an interval to swap the dashboard in place. Strict security headers, rate limiting, structured view logs.
- **Store library.** Types, revisions, inputs, shares, idempotency, purge; owns the PostgreSQL schema and the S3 layout.

## Key Flows

### A DT creates and shares a dashboard

```text
DT ──Execute createArtifact──▶ gateway-1 ──child workflow──▶ artifact-store-1
                                                              │ assert tenant, validate spec
                                                              │ write S3 object r1, insert artifact + revision (one transaction)
DT ◀──{artifact, revision}─────────────────────────────────────┘
DT ──Execute createShare (link)──▶ … ──▶ store: random token, hash stored ──▶ DT gets URL + token once
workflow ──Execute setInputs──▶ … ──▶ store: validate against declaration, merge, keep last 5
```

### A customer opens a share link

```text
browser ──GET /s/<token>──▶ artifact-web-1
                              │ token → share (live? pinned revision?) ; basic password if required
                              │ read content from store, render HTML ; count view
browser ◀──page (CSP, no-store)─┘
browser ──GET /s/<token> every N seconds (refresh)──▶ dashboard element swapped in place
```

### Concurrent writers

Two writers holding the same `baseRevision`: the artifact row is locked while the next revision is written, so one write wins and the other gets `CONFLICT`, re-reads and decides whether to reapply.

## Storage

| Store | What | Notes |
| --- | --- | --- |
| PostgreSQL | artifacts, revisions, type versions, input updates, shares, idempotency records | Credentials issued by Vault and mounted as files; re-read per connection and connections recycled so rotation needs no restart; schema applied by a migration Job as a separate role |
| S3 | one immutable object per revision, `tenants/<tenant>/artifacts/<id>/revisions/<n>` | Versioning on as a safety net with a 30-day lifecycle rule on non-current versions; never the revision model |

Retention: archiving hides an artifact and switches its shares off immediately; a daily job hard-deletes artifacts archived for more than 30 days (with their objects), shares revoked or expired for more than 90 days and idempotency records older than 7 days.

## Dependencies

| Dependency | Use |
| --- | --- |
| Auth cluster STS | Verifies bearer tokens over HTTP (JWKS); issues tokens with the `artifact-web-1` audience for the browser flow |
| Temporal | Gateway to component dispatch |
| RDS PostgreSQL, S3 | Storage |
| Vault | Database credentials |
| Istio ingress, DNS | `artifacts.budybot.ai` |
| OpenFGA read-only proxy (component listener, 8082) | Per-object checks of both components; model module `artifact-store-1` in `auth-store-2`. `authz-manager-1` writes the share tuples later |

## Design Principles

1. **One store library, two front doors.** Writes and DT reads go through Temporal; reads for people go straight to the store. Neither bypasses tenancy or share checks.
2. **Tenancy twice.** The gateway fixes the identity from the token; the component and the store assert the tenant again before touching data. Another tenant's artifact is "not found".
3. **Revisions are immutable; `latest` is a pointer.** Writers state the revision they started from.
4. **Spec and data are separate.** A dashboard's design is versioned content; its data is a latest-only channel.
5. **Types are versioned and pinned.** A breaking change is a new type version, never an edit.
6. **Nothing untrusted runs.** No author-supplied script; documents are sanitised; pages load scripts only from their own origin.
7. **Secrets are never stored in clear.** Share tokens are hashed, passwords use argon2id, both are shown once.
8. **Defaults in code, limits in configuration.** Size limits and retention are environment settings changed by deployment values.

## Design Decisions Log

| Question | Resolution |
| --- | --- |
| Where does content live? | This cluster's own S3 bucket; not the object storage cluster. |
| Postgres for content or JSON? | No. Content is always S3; only small, bounded dashboard input updates are JSON in PostgreSQL. |
| S3 bucket versioning as the revision model? | No: opaque ids, no author or message, no concurrency control. Revisions are explicit objects and rows; bucket versioning is a safety net. |
| Who renders? | This cluster, in Go. |
| First types | `doc` and `dashboard`; a `webpage` type (arbitrary HTML and JavaScript) needs a sandbox origin and comes later. |
| Dashboard data | Pushed by workflows as structured inputs; the page never queries data sources. The last five updates are kept; the page refreshes every five minutes by default. |
| Update modes | Replace the content, apply typed patch operations, or push inputs. |
| Share types | Link, basic and both; view only. |
| Browser identity | The internal STS token as a bearer header or, for navigations, a host-only session cookie created by `POST /session`. |
| Cross-tenant access | None. Authenticated readers are in the artifact's tenant. |
| Per-object authorization | OpenFGA through `go/authz` with our own model, extending from the platform's `active_*` session tiers; the owner comes from the store's record as a contextual tuple until `authz-manager-1` can write owner tuples. |
| Customer editing | Not over HTTP in v1. |
| Limits and retention | Starting defaults (see the Nexus contracts and Storage); limits are environment settings. |
| Access logs | A structured log line per view; a separate S3-based component only if "who viewed what" becomes a feature. |

## Open Questions / TRD Scope

1. Can the internal STS mint tokens with the `artifact-web-1` audience for browser users?
2. A typed `authz-manager-1` operation for artifact owner and share tuples for sharing inside a tenant; the `authorize:` manifest field (platform). The session boundary in `ComponentRequest` is built (`go/capability` v0.3.0).
3. The ingress header that carries the real client address, for rate limiting.
4. A TRD in the platform format (implementation detail currently lives in the repository's `docs/design/`).
