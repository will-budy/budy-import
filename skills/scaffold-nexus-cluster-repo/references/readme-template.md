# README template for a cluster repository

Every cluster repository has a `README.md` at the root. It is the **front door**, not the manual: short, stable, accurate, and linked to the places that hold detail. Keep it under ~120 lines. Detail lives in `AGENTS.md` (how to work in the repo), `docs/design/` (decisions), `docs/contracts/` (caller guides) and the wiki service doc.

Rules:

- State the **status** (`bootstrapping`, `active`, `deprecated`). Bootstrapping repos say plainly what exists and what does not, and mark stubs as stubs.
- Never describe something that is not built as if it were. Mark planned items `(planned)`.
- Every table row must be a real, verifiable fact (task queue, image, chart). Do not leave placeholders in a merged README.
- Link the wiki service doc and `scaffold-nexus-cluster-repo`.
- Update the README in the same PR that changes the component list, endpoint, services or commands.

## Template

````markdown
# <cluster>

<One sentence: what this cluster does and for whom.>

| | |
| --- | --- |
| **Type** | Nexus-first cluster: one gateway and one or more components, plus optional non-Nexus components |
| **Status** | bootstrapping — see "Current state" |
| **Namespace** | `ob1-tf-eks-de-v2-<short>-1-ns-1` |
| **Nexus endpoint** | `ob1-nexus-<cluster>-endpoint-1` |
| **Image repo** | `ob1-ecr-repo-v2/ob1_tf_aws_ecr_<cluster>_repo-1` (all components) |
| **Chart** | `<cluster>-repo-1` in `ob1-helm-chart-repo-v1` (umbrella only) |
| **Service doc** | <link to the wiki per-service document> |
| **Standard** | wiki skill `scaffold-nexus-cluster-repo` |

## What it does

<2–4 sentences. What problem it solves, what it owns, what it explicitly does not own.>

## Architecture in one screen

```text
external Temporal callers ── Nexus ──▶ gateway-1 (<cluster>-gateway-1-tq)
                                          │  authorize · validate · route
                                          ▼  child workflow (per task queue)
                                   <component>-1 (<cluster>-<component>-1-tq)
```

- The gateway is the only externally reachable component; it holds no business logic or state.
- Components are independent Go modules/workers, each released on its own.
- Capabilities (names + JSON Schemas) are data in `charts/gateway-1/files/capabilities/`.

## Components

| Component | Kind | Task queue | Image tag prefix | Status |
| --- | --- | --- | --- | --- |
| `gateway-1` | gateway | `<cluster>-gateway-1-tq` | `gateway-1-` | <built / planned> |
| `<name>-1` | component | `<cluster>-<name>-1-tq` | `<name>-1-` | <built / planned> |

## Nexus contract

Module: `shared/contract` (tag `shared/contract/vX.Y.Z`).

| Service | Operations | Status |
| --- | --- | --- |
| `<Domain>ServiceV1` | `<Op>`, `DescribeCapabilities` | <built / planned> |

Caller snippet:

```go
client := workflow.NewNexusClient(contract.NexusEndpoint, contract.<Domain>ServiceV1Name)
```

## Develop

```bash
make build test vet lint helm-lint helm-template
npm run changeset      # required for any component change (label no-changeset for docs/CI only)
```

Requires Go <version>, Node <version>, Helm, and access to the private Budybot modules (see `AGENTS.md`). Keep the root `package-lock.json` committed beside the root `package.json` `workspaces`: without it Changesets cannot see the workspaces and the first Release PR job fails.

## Release

CI/CD is the shared `platform-actions@v1` pipeline: Changeset → Release PR → images, module and git tags → chart-release PR (`automation/chart-release/*`) → chart publish → GitOps CHANGELOG PR; Kargo then promotes (`kargo_managed: true`). See the wiki *Application Cluster CI/CD Standard*. Rules: the chart is published only by CI's chart PR, never hand-bump the umbrella `Chart.yaml`; changesets name catalog packages exactly (CI validates); the root `package-lock.json` is committed beside `workspaces`. The cross-repo order for a first release (netpol, de-v2 app, chart publish, release branches, Kargo train, RBAC) is in the skill's `references/gitops-and-bring-up.md`.

## Current state

<Bullet list: what is built, what is next. Delete lines as they become false.>

## More

- `AGENTS.md` — how to work in this repo and add a component
- `docs/design/` — architecture and locked decisions
- Wiki service doc — <link>
````

## Non-Nexus components

A repo with a UI/BFF or hosted software keeps this README shape and adds one row per such component to Components, plus a short section: for a UI/BFF the routes handled and the session boundary; for hosted software the version, how it is configured and upgraded, backup/restore, and the thin platform wrapper (auth, tenancy, Nexus surface if any).
