---
name: Studio Services Cluster — Nexus Contracts
code: studio-services-cluster-1-nexus-contracts
version: 0.1
status: draft
last_updated: 2026-10-28
---

# Studio Services Cluster — Nexus Contracts

How other clusters and Digital Teammate workflows call the cluster. The Go types are in the `contract` module of `studio-services-cluster-1_repo-1` (`shared/contract`), which is the authoritative source for payloads; the JSON Schemas the gateway enforces are in `charts/gateway-1/files/capabilities/artifact-store-1.yaml`.

## Endpoint and operations

| | |
| --- | --- |
| Nexus endpoint | `ob1-nexus-studio-services-cluster-1-endpoint-1` (never versioned) |
| Service | `ArtifactServiceV1` |
| Operations | `Execute` and `DescribeCapabilities` |
| STS audience | `urn:budy:nexus:ob1-nexus-studio-services-cluster-1-endpoint-1:ArtifactServiceV1` |
| Component | `artifact-store-1` |

`Execute` takes `{component, capability, payload, idempotencyKey?, auth: {token}}` and returns `{ok, data?, error?: {code, message}}`. The caller's tenant and user come only from the STS token. A caller-supplied tenant or user is ignored. Platform-scoped tokens (no tenant) are refused with `PERMISSION_DENIED`.

`DescribeCapabilities` returns the capability list and, with `includeSchemas`, each capability's JSON Schema. It needs a valid token and nothing else.

## Capabilities

Every call is `Execute` with `component: "artifact-store-1"`. `id` is an artifact id of the form `art_<ULID>`. Every capability acts inside the caller's tenant. Permissions are checked against the authorization model and extend from the caller's session tier, which the token's session boundary sets: reading needs a viewer-boundary session or above, and writing, sharing and archiving an editor-boundary session or above (a digital teammate or an admin). The creator (owner) of an artifact may do anything with it at that tier. Any other user needs a relation granted in the authorization model: read capabilities (`getArtifact`, `listRevisions`, `getInputs`) need `can_view` (a direct `viewer`, or the tenant default when it is switched on), `updateArtifact`, `patchArtifact` and `setInputs` need `can_edit` (`editor`), `createShare`, `listShares` and `revokeShare` need `can_share` and `archiveArtifact` needs `can_archive` (both `owner`). `listArtifacts` lists the caller's own artifacts. Until `authz-manager-1` writes per-object tuples only the owner and the tenant default (off by default) apply.

| Capability | Payload | Result |
| --- | --- | --- |
| `describeTypes` | none | `types[]`: name, version, state, `contentSchema`, `inputs`, `operations` |
| `createArtifact` | `type`, `typeVersion?`, `title`, `content`, `message?` | `artifact`, `revision` |
| `getArtifact` | `artifactId`, `revision?` (default latest) | `artifact`, `revision`, `content` |
| `listArtifacts` | `type?`, `includeArchived?`, `limit?` (1 to 200), `cursor?` | `artifacts[]`, `nextCursor?` |
| `listRevisions` | `artifactId`, `limit?`, `cursor?` | `revisions[]` (newest first), `nextCursor?` |
| `updateArtifact` | `artifactId`, `baseRevision`, `content`, `title?`, `message?` | `artifact`, `revision` |
| `patchArtifact` | `artifactId`, `baseRevision`, `operations[]`, `message?` | `artifact`, `revision` |
| `setInputs` | `artifactId`, `values{}`, `asOf?` | the stored update: `seq`, `values`, `asOf`, `updatedAt`, `updatedBy` |
| `getInputs` | `artifactId`, `history?` (0 to 4) | `latest?`, `history[]` |
| `archiveArtifact` | `artifactId` | `artifact` (hidden, shares off; idempotent) |
| `createShare` | `artifactId`, `auth` (`link`, `basic`, `link+basic`), `username?`, `revisionPin?`, `expiresAt?` | `share`, `url?`, `token?`, `password?` (shown once) |
| `listShares` | `artifactId` | `shares[]` (no secrets) |
| `revokeShare` | `artifactId`, `shareId` | `share` (idempotent) |

`content` is the JSON form of the content: a JSON string holding Markdown for `doc@1`, the spec object for `dashboard@1`. `describeTypes` lists the patch operations of each type:

- `doc@1`: `replaceSection`, `insertSection`, `deleteSection` (sections are addressed by heading text, with `level` or `occurrence` when ambiguous).
- `dashboard@1`: `setWidget`, `removeWidget`, `setRefresh`, `setLayout`, `declareInput`, `removeInput`.

## Errors

| Code | Meaning | Caller action |
| --- | --- | --- |
| `INVALID_ARGUMENT` | The request or the content violates the schema or a type rule; the message says which. | Fix the request. Do not retry unchanged. |
| `NOT_FOUND` | The artifact, revision or share does not exist for this caller (another tenant's artifact looks the same). | Do not retry. |
| `PERMISSION_DENIED` | The caller may not do this (no relation that allows the capability on this artifact, or a platform-scoped token). | Do not retry. |
| `CONFLICT` | `baseRevision` is not the latest, or the idempotency key was reused for a different request. | Re-read (`getArtifact`) and retry with the new base. |
| `UNAVAILABLE` | A dependency is down; the component already retried. | Retry later. |
| `UNIMPLEMENTED`, `INTERNAL` | Unknown capability; unexpected failure. | Do not retry; report. |

Permanent failures are non-retryable application errors inside the cluster; callers only ever see the `Response`.

## Idempotency

Send an `idempotencyKey` on every write (`createArtifact`, `updateArtifact`, `patchArtifact`, `setInputs`). A repeat with the same key and the same request returns the first result; the same key with a different request is `CONFLICT`. Without a key, a retry inside one workflow execution is still deduplicated, but two separate calls are two writes. `createShare` is deliberately not idempotent: its token and password are returned once and never stored in clear, so a repeat creates another share.

## Limits (defaults, set in deployment values)

Title 200 characters; revision message 500; `doc@1` body 1 MiB; `dashboard@1` spec 256 KiB with at most 100 widgets and 100 inputs; one `setInputs` call and the stored value set 256 KiB; tables 5,000 rows; series 10,000 points; 50 active shares per artifact.

## Caller guidance

```go
// Create a dashboard, then push data into it from a workflow. Each call is one Execute.
create := contract.CreateArtifactRequest{Type: contract.TypeDashboard, Title: "Support", Content: spec}
// ... Execute(component, contract.CapabilityCreateArtifact, create, idempotencyKey)
set := contract.SetInputsRequest{ArtifactID: id, Values: map[string]json.RawMessage{"open": json.RawMessage(`42`)}}
// ... Execute(component, contract.CapabilitySetInputs, set, idempotencyKey)
```

On `CONFLICT` from an update or patch, re-read the artifact and decide whether to reapply the change on the new revision. On `INVALID_ARGUMENT` from `setInputs`, the dashboard does not declare that input (or declares a different type): patch the spec with `declareInput` first.

## Versioning policy

A breaking change to a capability is a new capability name; a breaking change to the service is `ArtifactServiceV2`; a breaking change to an artifact type is a new type version (`doc@2`) that sits beside the old one. Published schemas are never changed silently.

## Reading artifacts (HTTP)

Readers use `https://artifacts.budybot.ai` rather than Nexus: `/a/<id>` (bearer token or session cookie, or Basic credentials for a basic share), `/s/<token>` (link share), `POST /session` (bearer token to cookie). `Accept: application/json` returns the stored content. See the [HLD](hld.md).
