---
name: studio-services-cluster-1
kind: service
description: Studio Services Cluster: creates, versions, shares and renders the artifacts (documents, dashboards) that Digital Teammates and humans produce and review together.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/studio-services-cluster-1_repo-1
status: active
tags: [execution-mode, application-cluster, go, temporal, artifacts, collaboration]
interfaces: [nexus, http]
runtime:
  language: go
  framework: temporal
  deployment: eks
links:
  design: [hld.md]
  runbooks: []
  dashboards: []
  api_contracts: [nexus-contracts.md]
  builds: []
  release_candidates: []
---

# studio-services-cluster-1

The Studio Services Cluster is where artifacts are created. Digital Teammates (DTs) and workflows create, update and share artifacts through the cluster's Nexus contract; people and customers read them as web pages. An artifact has a type, immutable revisions and, for dashboards, structured inputs that workflows push without involving a language model. The first two types are `doc` (Markdown) and `dashboard` (a declarative spec with pushed inputs).

> **Status: implemented, not deployed (October 2026).** The repository contains the gateway, the artifact store worker and the web service, with charts and CI. The infrastructure they need (database, bucket, Vault roles, network policy, ingress) is not provisioned yet; see the HLD.

## Boundary

| Owns | Does not own |
| --- | --- |
| Artifact records: metadata, revisions, ownership, shares | Authentication of callers (the auth cluster's STS) |
| Artifact content, in this cluster's own S3 bucket | Tenant membership and platform roles (authz-manager-1) |
| Artifact types, their schemas and typed patching | Producing the content (the Digital Teammates and workflows that call it) |
| Rendering artifacts as web pages at `artifacts.budybot.ai` | The application UI and its navigation (the platform UI links to artifact pages) |
| Share links and basic-auth shares for readers without a platform identity | Sharing with other users inside a tenant (later, see the HLD) |
| Retention: archive, purge | |

## Shape

| | |
| --- | --- |
| **Repository type** | Nexus-first: gateway + components, plus one HTTP component |
| **Components** | `gateway-1` (Nexus), `artifact-store-1` (Temporal worker: writes and DT reads), `artifact-web-1` (HTTP: page rendering, shares, sessions; read-only) |
| **Storage** | PostgreSQL on RDS for metadata (Vault-issued credentials); one S3 bucket for content |
| **Capabilities** | `describeTypes`, `createArtifact`, `getArtifact`, `listArtifacts`, `listRevisions`, `updateArtifact`, `patchArtifact`, `setInputs`, `getInputs`, `archiveArtifact`, `createShare`, `listShares`, `revokeShare` (see [Nexus contracts](nexus-contracts.md)) |
| **Rendering** | Go (goldmark and bluemonday for documents, `html/template`, htmx and Chart.js for dashboards); no Node at build or run time |

## Names (derived from the standard)

| | |
| --- | --- |
| Kubernetes namespace | `ob1-tf-eks-de-v2-studio-services-1-ns-1` |
| Nexus endpoint (control surface) | `ob1-nexus-studio-services-cluster-1-endpoint-1` |
| Nexus service | `ArtifactServiceV1` |
| Components, task queues | `gateway-1`, `artifact-store-1` (`studio-services-cluster-1-artifact-store-1-tq`), `artifact-web-1` |
| Netpol labels | `budybot.io/netpol: studio-services-gateway-1`, `studio-services-artifact-store-1`, `studio-services-artifact-web-1` |
| Umbrella chart | `studio-services-cluster-1-repo-1` |
| Image repository | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_studio-services-cluster-1_repo-1` |
| Public host | `artifacts.budybot.ai` (`artifact-web-1`) |

## Callers and callees

- Inbound: Digital Teammate workers and other clusters' workflows through the Nexus endpoint; people and customers through `artifacts.budybot.ai` (an STS-authenticated owner, a share link, or basic-auth credentials).
- Outbound: the auth cluster's STS (JWKS, token verification), PostgreSQL, S3, Temporal. No call to the object storage cluster.

## Decisions (October 2026)

These resolve the questions the bootstrap version of this page asked.

1. **Artifact model.** Typed artifacts with immutable integer revisions and a `latest` pointer; a type version is immutable and a breaking change is a new version (`doc@2`). Content is one S3 object per revision.
2. **Storage.** This cluster owns its storage: a dedicated bucket for artifact content and RDS for metadata. The object storage cluster is not used.
3. **Collaboration semantics.** Writers name the revision they started from (`baseRevision`); a stale write fails with `CONFLICT` and the writer re-reads. Dashboard inputs are a separate, latest-only channel (the last five updates are kept) and do not create revisions.
4. **Human access.** The cluster renders pages itself. An STS-authenticated owner uses a bearer token or a session cookie; readers without an identity use link or basic-auth shares. Sharing with other people inside a tenant comes later.
5. **Tenancy and authorization.** Tenant is enforced at the gateway and again in the store. Per-object authorization follows the [Component Authorization Module Standard](../../../gitops/authorization-module-standard.md): both components ask the shared OpenFGA store through `go/authz` with a model of their own (`artifact_1:{tenant}/{id}`; `owner`, `editor`, `viewer` for a user or a whole tenant, `can_view`, `can_edit`, `can_share`, `can_archive`), failing closed. Every permission extends from the platform's session tiers (`active_viewer`, `active_digital_teammate`): the components send the token's session boundary with every check. The creator is recorded by the store and handed to the model as a contextual owner tuple; the share relations wait for tuples.
6. **Service name.** `ArtifactServiceV1` stays.

## Open questions

1. The auth cluster must mint STS tokens with the audience `artifact-web-1` for the browser flow (or another audience is configured).
2. Sharing inside a tenant needs a typed operation in `authz-manager-1` that writes owner and share tuples. Platform side: the `authorize:` field in the capability manifest (the session boundary reaches the components already).
3. Primary owner (`tbd`).

## Detailed Docs

| Name | Type | Link |
| --- | --- | --- |
| HLD | design | [High Level Design](hld.md) |
| Nexus contracts | api contract | [Nexus contracts](nexus-contracts.md) |
| PRD / TRD | design | not written yet; the repository's `docs/design/` is the working implementation-level document |
| Repository | source | `Budybot/studio-services-cluster-1_repo-1` |
| Group index | index | [Execution Mode Services](../info.md) |
