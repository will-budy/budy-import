# Mission registry (`mission-registry-1`)

The platform's answer to **"what is a published workflow?"**

- **A publication is an act of publishing**, recorded as `pub_<ULID>`: it publishes one workflow of a digital teammate's (DT's) Dynamo worker, at a commit, as its *automation* (the workflow the publication's triggers start), together with that workflow's tree (the workflows it calls and the activities they call) and its triggers. "Automation" is the role the workflow has in this publication, not a kind of workflow: any published workflow can be the automation of a publication. Publishing the same workflow again, at a new commit or with other triggers (a schedule and on demand), is a new publication that replaces the earlier one.
- **A mission is a grouping of a DT's publications**, with metadata: today a name and a description, which say its theme (managing people, month-end close). It belongs to one DT of one tenant. The engagements that produced its publications are filed under it too.

The Mission registry holds the missions and is the publish-time ledger and orchestrator of publications. It records each publication and fans it out to the runtimes that keep a slice of it: Janus (connections and request rules), events-cluster (triggers) and nainai (the worker version). It is **not a runtime dependency**: nothing reads the registry while a workflow executes.

Status (November 2026): built, released together with release-qa-1 (switched off until it is tested). That covers missions, `createPublication` with the events and Janus steps of the saga, and the console's Mission registry area. Observing the worker version on nainai and retirement are not built yet. The design, decisions R1 to R18, and "how to move it" are in `docs/design/mission-registry.md` in `Budybot/dt-consulting-services-1_repo-1`. Bring-up and checks are in `docs/design/mission-registry-test-plan.md`.

## Shape

| | |
| --- | --- |
| Component | `mission-registry-1` in `dt-consulting-services-1_repo-1` |
| Service | A component of `DTConsultingServiceV1` on `ob1-nexus-dt-consulting-services-1-endpoint-1`, with no separate Nexus service. Call `Execute` with `{"component":"mission-registry-1","capability":...}` |
| Capabilities | `createMission` and `getMission`: a DT names and describes a mission, and the registry mints its id (`msn_<ULID>`). Names are unique per DT. `createPublication` and `getPublication`: a Publication manifest and its source (repository, commit, path). It returns a publication (`pub_<ULID>`) and starts the publish saga |
| Workflows | `MissionRegistryWorkflowV1` (entry) and `PublishWorkflowV1`, whose workflow id is the publication id. Every saga step passes that id to the runtimes as its idempotency key |
| Database | `ob1-mission-registry-db-1`, its own standard three-role database. Tables: `mission`, `mission_request`, `publication` (with `mission_id`), `published_id` (claimed ids) and `step`. Row-level security is on every table: the worker's role sees every row, and the read role sees only the rows of `app.tenant_id` |
| Callers | A DT in an editor session (for itself), and release-qa-1 (for a DT of its tenant). The dt-consulting-services console reads missions and publications directly through the read role, under row-level security for the session's tenant |

Separability: the registry shares no code, table, role or identity with the rest of dt-consulting-services-1. To move it to another cluster, copy the component, its chart, its manifest and its contract file, then repoint the callers. The database stays as it is.

## Missions and engagements

1. A DT creates its missions in the console, or with `createMission`.
2. Every engagement is opened under one of them: `brief.missionId` is required.
3. When the engagement releases, release-qa-1 files each publication under the engagement's mission (`metadata.mission`). The builder never names one.
4. The registry refuses a mission that is not an active mission of the publishing DT.

## The Publication manifest

`publication.yaml` sits at the root of the DT worker repository. It holds one YAML document per publication, separated by `---` as kubectl reads them. Each document is `apiVersion: publication.budy/v1alpha1`, `kind: Publication`, with exactly one automation. The coding agent writes it.

## Published ids

Temporal type names **are** the published ids (D18):

| Prefix | Is |
| --- | --- |
| `pwf_` | a workflow type |
| `pact_` | an activity type |

Each is followed by a ULID (a 26-character Crockford base32 id that sorts by creation time). Whether a workflow is a publication's automation or a workflow it calls is decided by the publication, not by its id.

- **The builder mints them** at build time. The registry validates them and claims each one for its tenant, DT and kind on first publication.
- **An id is claimed forever** by its tenant, DT and kind: another DT, another tenant or another kind never uses it (D19). Reuse across DTs goes through npm and Go packages.
- **The same DT reuses its ids.** A workflow or activity keeps its id when its code changes (the code is versioned in git and the worker is versioned in Temporal), and a later publication may use ids an earlier one used.
- **One live publication per id (v1).** An id may sit in the tree of only one live publication of a DT at a time; the registry refuses a publication whose tree overlaps another live publication's, except the one it replaces. So a change to a workflow or activity changes exactly one publication's behaviour.
- **Open: shared trees.** Letting two publications share a workflow or activity needs a check that a change to the shared piece is right for every publication using it (the research of the engagement making the change would have to find and review them). Until that exists, sharing is refused.

## The publish saga

```text
record publication (pending → publishing)
  → Janus registerPublication, per automation   ⟲ retirePublication   (skipped when no connection is declared)
  → events-cluster registerTriggers (paused)    ⟲ removeTriggers
  → nainai: observe the worker version          (not built: recorded skipped; nainai is push-driven and never commanded)
  → events-cluster unpauseTriggers; record active
```

**Failure:** a step refused after its retries undoes the accepted steps in reverse order. The publication is then recorded `failed` with the refusing runtime's reason, which goes back to the DT as feedback.

## What each runtime receives

| Runtime | Receives |
| --- | --- |
| [janus-cluster-1](../janus-cluster-1/info.md) | `registerPublication` / `retirePublication` on `publish-1`: tenant, DT, the automation, its workflows, each activity's connection ids, and the worker's namespace and service account (D72) |
| [events-cluster-1](../events-cluster-1/info.md) | `registerTriggers` (paused), `unpauseTriggers`, `removeTriggers`: the automation's workflow type (its `pwf_` id), its typed triggers (schedule, internal, webhook with its `response` mode, email) and the worker name. Events keeps the handles it issues; the registry records each trigger's id, kind and state and an email trigger's address, never a webhook URL or secret (a person reads those with Reveal in the events console) |
| [nainai-cluster-1](../nainai-cluster-1/info.md) | Nothing yet: a worker deploys when its image is pushed. Observing the worker version is a to-do |

## Not built

- Retirement, and retiring the previous publication when a republish becomes active.
- Reading the manifest from GitLab at the commit.
- The pre-merge checks in the worker repository's CI (schema, ids that match the registered types, rules with tests).
