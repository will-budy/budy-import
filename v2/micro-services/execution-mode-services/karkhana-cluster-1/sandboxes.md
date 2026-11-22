---
name: Karkhana sandboxes
code: karkhana-cluster-1-sandboxes
version: 0.2
status: draft
last_updated: 2026-11-13
---

# Sandboxes: design

How a caller gets a sandbox from Karkhana, what runs it, and what is recorded. This page is the contract the
components are built against and, since the first build, describes them as they are on each repository's `main`
(checked 2026-11-13). The service page is [karkhana-cluster-1](info.md).

## Status

Checked against `origin/main` of each repository on 2026-11-13. "Pinned in dev" means what the de-v2 GitOps repository's
`main` asks Argo CD for in dev; whether Argo CD has synced it was not verified. There is no end-to-end test of the whole
path on a cluster yet.

| Piece | State |
| --- | --- |
| Operator `sandbox-operator-1` 0.4.0 | Released as chart `sandbox-service-1-repo-1` 0.3.6 (image `sandbox-operator-1-0.4.0-1075142`), the first release of the new operator. Pinned in dev (`sandbox-service-1-app`); stage and prod still pin 0.3.5, the earlier sandbox-service-1 chart. |
| `SandboxType` `claude-coder-1` | In platform-crs `v1/stacks/de-v2-sandbox-type`, image `claude-code-1-0.1.0`. |
| Runner and image | `sandbox-runner-1` and image type `claude-code-1` 0.1.0 are in sandbox-shell-1 (the type names the image `...sandbox-shell-1_repo-1:claude-code-1-0.1.0`; that the image is pushed was not verified). |
| Network profile `sandbox-coder-1`, operator and manager policies | Merged in k8s-security. No GitLab rule (see Pending). |
| Authorization model | Merged in authz-config: the conditional coder grant, the `glassbox` relation, the `sandbox-operator-1` service user, the `KarkhanaServiceV1` topology. |
| Billing entity and workload sessions | auth-cluster-1 0.1.101 (STS `glassbox_id`, authz-manager-1 `/v1/workload-sessions`) is pinned in dev. The `workload-session` UserType and the coder role's `workload_session` class are in platform-crs `authz-types/profile/dev` only. |
| `sandbox-manager-1` | Released in the karkhana-cluster-1 chart 0.1.3 (`sandbox-manager-1-0.1.0`). Dev values enable it, but dev still pins chart 0.1.1, so it has not been promoted to dev. Its migration Job creates the `sandbox` tables the operator needs. |

Pending (not done, or open and not merged):

| Item | Repository and number | Effect until done |
| --- | --- | --- |
| `sandbox-1` workload session kind (dev only) and the operator's token audience `authz-manager-1` | de-v2 #2414 (open) | authz-manager-1 has no `sandbox-1` kind, and the operator's token for it carries the audience of the released chart's default (`auth.budy.internal`), which authz-manager-1 does not accept for workload callers. The chart default itself was corrected in sandbox-service-1 #59 (merged, not yet released; the next chart release carries it). |
| GitLab from sandboxes | de-v2 #2415 (token-broker-1 in dev), de-v2 #2418 (dev sandboxes clone through token-broker-1), k8s-security #589 (sandbox egress to GitLab), all open | No GitLab proxy in front of token-broker-1 is deployed, the operator's `git.url` is empty, token-broker-1 is not enabled in dev and `sandbox-coder-1` has no GitLab egress. `putFiles` works; the `git` source of `requestSandbox` is stored but nothing clones. |
| Promote the karkhana-cluster-1 chart with `sandbox-manager-1` (0.1.3) to dev | Kargo release train `karkhana-cluster-1` | No sandbox can be requested. |
| Manager fixes | karkhana-cluster-1 #8 and #9 (open; titles: "limits, queued work and resume against the observed phase", "a sandbox with an identity must name its teammate") | Not described on this page; not verified. |
| Session credentials in a side container | sandbox-service-1 #58, sandbox-shell-1 #17 (open) | Not described on this page; the runner and pod are as in sections 6 and 8. |
| Removal of the old sandbox path | context-cluster-1 #608 (shell provider, ContextServiceV2 sandbox operations, SandboxServiceV2), crossplane-providers-mono #391 (per-tenant sandbox identity), dt-workbench #364 (sandbox tools in the catalog; published Retain records need a retirement step), all open | The old operations still exist. Held until the new path works in dev. |
| A caller | dt-consulting-services-1 `delivery-lead-1` is planned (its README, phase 2) | Nothing in the repositories checked calls `KarkhanaServiceV1` yet. |

What each environment needs before the operator works there. Stage and prod pin older charts and have none of the
Karkhana pieces switched on: the stage and prod karkhana-cluster-1 profiles set `global.enabled: false`, and the OpenFGA
store id for the manager is set for dev-1 only. The release trains (kargo-config, projects `sandbox-service-1` and
`karkhana-cluster-1`) auto-promote dev to stage to prod after a bake of 1 hour in dev, 4 hours in stage and 15 minutes
after prod, and nothing in them waits for the rows below, so check them before a promotion.

| Needed in the environment | Where it lives |
| --- | --- |
| The `sandbox` schema and its three roles (`-sandbox-rw-role`, `-sandbox-ro-role`, `-sandbox-operator-rw-role`), then the manager's migration Job (admin credentials), which creates the tables and grants | argocd-eks-stack `standard-db-custom-grants-1` (`ob1-karkhana-db-1.sql`); karkhana-cluster-1 chart `sandbox-manager-1`. The DB host differs per tier: CNPG in dev and stage, RDS in prod (de-v2 `profiles/*`). |
| Vault roles for the operator, the manager and the migration Job; the VSO global auth `sandbox-shared-vso-1-global-vault-auth-1` (operator) and `karkhana-shared-vso-1-global-vault-auth-1` (manager) | vault-gitops `services.catalog.tf` (`sandbox_operator_1`, `karkhana_cluster_1_sandbox_manager_1`, `..._job`); k8s-security |
| The Claude Code OAuth token, written by hand: Vault `app-kv-secrets-1`, `v1/de-v2/ob1-tf-eks-de-v2-sandbox-1-ns-1/sandbox-operator-1/claude-code-oauth-1`, key `token` | Vault of that environment |
| The `SandboxType` resource and the CRD (the operator chart's `crds/`) | platform-crs `de-v2-sandbox-type`; chart |
| The karkhana-cluster-1 chart with `sandbox-manager-1` enabled, its OpenFGA store id, and the authorization model with `active_svcrole_dtcs_coder_1` | de-v2 `charts/apps/karkhana-cluster-1` (`profiles/*`, `env/*`); authz-config |
| auth-cluster-1 0.1.100 or later running there, then `config.workloadSessionKinds` with `sandbox-1`, then the platform-crs `workload-session` UserType and the coder role's `workload_session` class (today `authz-types/profile/dev` only) | de-v2 `charts/apps/auth-cluster-1` (dev only, #2414); platform-crs `authz-types`. stage and prod pin auth-cluster-1 0.1.94. |
| The operator's token audience set to `authz-manager-1` (until a chart release carries the new default) | de-v2 `charts/apps/sandbox-service-1` `identity.tokenAudience` (#2414) |
| Network policy (sandbox profile, operator, manager), the OPA reservation of the `sandbox-coder-1` label | k8s-security |

## 1. Summary

A caller asks `KarkhanaServiceV1` for a sandbox of a named type. `sandbox-manager-1` checks the caller and writes one row
of desired state to Postgres. `sandbox-operator-1` watches those rows and makes Kubernetes match them: a pod with a
persistent workspace in the tenant's namespace, under its own ServiceAccount. The operator writes back status, an event
trail and usage. There is no custom resource per sandbox, no Service and no ingress: nothing calls into a sandbox.

```text
caller ── STS token ──▶ gateway-1 ──▶ sandbox-manager-1 ──▶ Postgres (schema sandbox)
                                                              ▲   │ LISTEN/NOTIFY + resync
                                              status, usage   │   ▼
                                                        sandbox-operator-1 ──▶ pod, PVC, ServiceAccount, Secret
                                                                                (tenant namespace)
```

## 2. Decisions

| # | Decision |
| --- | --- |
| D1 | Desired state lives in Postgres, written only by `sandbox-manager-1`. The operator reconciles from it. Temporal carries the request to the manager and nothing else: no lifecycle workflow. |
| D2 | The only custom resource is `SandboxType` (`karkhana.budy/v1alpha1`, cluster-scoped): the catalog of what a sandbox can be. |
| D3 | Sandboxes run in the tenant's namespace. The operator resolves it from the `UserOrg` whose `spec.userOrgShortName` is the tenant (`status.tenantNamespace.name`) and refuses a namespace that is not labelled `platform.budy.ob1.ai/managed-by: user-org` or is terminating. The manager has no Kubernetes access. |
| D4 | Tenant and requester come from the verified STS token the gateway passes (tenant scope only; platform-scoped callers are refused), never from the payload. The billing entity is the token's `glassbox_id`, or the tenant when the token carries none (section 9). |
| D5 | Each sandbox has its own ServiceAccount and its own short-lived platform user, homed in the tenant (section 8). A sandbox never holds more than its requester and its type allow. |
| D6 | A sandbox has a persistent workspace volume. Pausing deletes the pod and keeps the volume; resuming starts a pod in the same zone. |
| D7 | Zone and region are recorded from the first schedule. A resume never moves a sandbox to another zone. |
| D8 | Network reach is a property of the type: `networkProfile` becomes the pod's `budybot.io/netpol` label and one cluster-wide policy per profile grants the destinations. |
| D9 | The operator is the only writer of Kubernetes objects. Its ClusterRole is fenced by an admission policy to tenant namespaces and to objects it labels (with one exception for `pods/exec`, section 6). |
| D10 | Usage is metered by the operator in the platform's standard record ([usage metering standard](../../../ref/usage-metering-standard.md)). Karkhana does not price or enforce. |
| D11 | Only holders of a role listed in the type's `allowedRoles`, in an editor session, may use it. Today that is the dt-consulting-services coder (`svcrole-dtcs-coder-1`). Only that service role may call `KarkhanaServiceV1` at all (authz-config `entities/services/nexus-topology.yaml`). |

## 3. Components

| Component | Repository | Runs in | Does |
| --- | --- | --- | --- |
| `gateway-1` | karkhana-cluster-1 | `ob1-tf-eks-de-v2-karkhana-1-ns-1` | Verifies the STS token, validates the payload against the capability schema, dispatches. |
| `sandbox-manager-1` | karkhana-cluster-1 (`components/sandbox-manager-1`, sub-chart `sandbox-manager-1` of the umbrella chart `karkhana-cluster-1-repo-1`) | same | Authorization, limits, writes desired state, reads status. Owns the database migrations (a Job with the admin credentials). Temporal worker, task queue `karkhana-cluster-1-sandbox-manager-1-tq`. |
| `sandbox-operator-1` | `ob1_mn_gh_sandbox-service-1_repo-1` (chart `sandbox-service-1-repo-1`) | `ob1-tf-eks-de-v2-sandbox-1-ns-1` | Reconciles Postgres rows into Kubernetes objects; status, events, usage; cleanup; validates `SandboxType` objects. |
| `sandbox-runner-1` | `ob1_mn_gh_sandbox-shell-1_repo-1` (`cmd/sandbox-runner-1`, in every image type, for example `claude-code-1`) | the sandbox pod | Process 1 of the sandbox: runs commands detached, writes files, keeps the sandbox's STS tokens fresh, clones the git source on first start when configured. |

The row types, state names and capability payloads are Go types in the karkhana contract module
(`github.com/Budybot/karkhana-cluster-1_repo-1/shared/contract`). The operator does not import that module yet: it keeps
a mirror in `internal/model` (name for name, field for field) to be replaced by an import. The mirror's `file_1` row
does not carry `request_key` and `ordinal`, which only the manager reads.

## 4. Capabilities (`sandbox-manager-1`)

The manifest is `charts/gateway-1/files/capabilities/sandbox-manager-1.yaml` (workflow `SandboxManagerWorkflowV1`, default
execution timeout 30 s); the manager's activities and the manifest must offer exactly the nine capabilities below.

All are tenant scope. All check that the caller holds a role in the type's `allowedRoles` on the tenant, in an editor
session (see Authorization). A sandbox belongs to its requester: every capability that names a sandbox or a command also
requires that the caller is that sandbox's requester in that tenant, and answers "not found" otherwise. There is no
administrative access to another requester's sandbox.

| Capability | Input | Result |
| --- | --- | --- |
| `requestSandbox` | `type`, `idempotencyKey`, `ttlSeconds?`, `zone?`, `git? {projectPath, branch}`, `labels?` | `sandboxId`, `phase`, `created`. The same key from the same requester with the same type returns the existing sandbox (`created` false). The same key with another type, or a key another requester of the tenant used, is a conflict. |
| `getSandbox` | `sandboxId` | `sandboxId`, `type`, `desiredState`, `phase`, `generation`, `observedGeneration`, `ttlSeconds`, `runningSeconds`, `zone`, `region`, `expiresAt`, `lastCommandAt`, `lastError`, `git`, `labels`, `createdAt`, `updatedAt`. |
| `listSandboxes` | `phase?`, `limit?` (default 50, at most 200) | The caller's sandboxes in the tenant, newest first. A sandbox is listed when its type is served and the caller holds a role for it, or when its type was retired. The eligibility is part of the SQL query, so the limit counts eligible rows only. |
| `pauseSandbox` / `resumeSandbox` / `deleteSandbox` | `sandboxId` | `sandboxId`, `desiredState`, `phase`, `generation`. Repeating a request changes nothing, except that a resume of an idle-paused sandbox (phase `paused` or `pausing`, desired state still `running`) is a change. A deleted sandbox cannot be paused or resumed (conflict). `deleteSandbox` frees the sandbox's place against the type's limits; the workspace is removed. |
| `runCommand` | `sandboxId`, `script`, `env?`, `timeoutSeconds?`, `idempotencyKey` | `commandId`, `state`, `created`. Refused unless the sandbox's desired state is `running`. The same key in the same sandbox returns the same command. Commands of one sandbox run one at a time, in the order queued. |
| `getCommand` | `commandId` | `commandId`, `sandboxId`, `state` (`queued`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`), `exitCode`, `outputTail` (64 KiB at most), `logPath` (in the workspace), `timeoutSeconds`, `cancelRequested`, `createdAt`, `startedAt`, `finishedAt`. |
| `putFiles` | `sandboxId`, `files[] {path, content, mode?}` | `sandboxId`, `files[] {fileId, path, state}`. The files are queued; the operator writes them. |

Payload limits (the manifest schema and the manager both enforce them):

| Field | Limit |
| --- | --- |
| `idempotencyKey` | 1 to 128 characters of letters, digits and `. _ : / @ = -`, starting with a letter or digit. |
| `ttlSeconds` | Positive, at most the type's `maxTTLSeconds`; 0 or absent means the type's `defaultTTLSeconds`. |
| `zone` | An availability zone such as `us-west-2b`. |
| `git.projectPath` | A GitLab project path: at least two segments of letters, digits, `_`, `-`, `.`, each starting with a letter, digit or `_`, none ending in `.`, `.git` or `.atom`, no `..`; at most 255 characters. |
| `git.branch` | Valid by the rules of `git check-ref-format --branch` (no control characters, space or `~ ^ : ? * [ \`, no leading `-` or `/`, no `//`, `..`, `@{`, trailing `.`, component starting with `.` or ending in `.lock`, not `@`); at most 255 characters. |
| `labels` | At most 16; key 1 to 63 characters (letters, digits, `. _ / -`), value at most 128 printable characters. |
| `script` | At most 64 KiB, UTF-8 text without NUL. |
| `env` | At most 64 entries, name `[A-Za-z_][A-Za-z0-9_]*` of at most 128 characters, value at most 4096 bytes, 32 KiB in total, names starting `SANDBOX_` reserved. Non-secret only: it is stored with the command and readable with it. |
| `timeoutSeconds` | 1 to 86400; default 3600. |
| `putFiles` | 1 to 64 files, 256 KiB of content in total; `path` relative, clean, at most 1024 characters, inside the workspace and not under `.sandbox/`, no duplicates; `mode` a string of octal permission bits from `0400` to `0777` (for example `"0644"`, the default), no setuid, setgid or sticky bit. Accepted for any sandbox that is not deleted, including a paused one; the files are written when the pod is running. |

Limits enforced by the manager before a row is written: the type's `limits.maxPerTenant` and `limits.maxPerRequester`
(sandboxes of that type whose desired state is not `deleted`; counted and inserted under a per-tenant advisory lock), and
`ttlSeconds` no greater than the type's maximum.

`putFiles` queues its files once per request. The manager's own key for a request is the workflow id, run id and activity
id; it is stored in `file_1.request_key` with the file's `ordinal`, so when the manager retries the activity it finds the
rows and queues nothing new. `putFiles` takes no caller key: a caller that repeats the request queues the files again.

**Authorization.** The type's catalog entry maps each allowed role to an OpenFGA relation on `tenant:<t>` (for
`svcrole-dtcs-coder-1`, `active_svcrole_dtcs_coder_1`, which is the coder grant and an editor session). The caller passes
when it holds any one of the relations, checked with `go/authz` against the read-only OpenFGA proxy, with the session of
its token. The coder grant is conditional (`non_expired_grant`, for workload sessions), so every check carries
`current_time` (UTC, RFC 3339, to the second); the same holds for the token broker. A check that cannot be answered is
refused, never allowed. The manager reads the catalog (per type: `allowedRoles` with their relations, `limits`,
`lifetime`) from a file rendered from the chart's `catalog` values and mounted at `/etc/sandbox-manager/catalog.json`; it
cannot read `SandboxType` objects, so **the catalog values and the `SandboxType` resources must be kept in step by hand**.

**Retired types.** A sandbox whose type has left the catalog stays reachable by its requester for `getSandbox`,
`getCommand`, `listSandboxes`, `pauseSandbox` and `deleteSandbox` (ownership is enough); `resumeSandbox`, `runCommand` and
`putFiles` are refused.

No capability cancels a command yet: `command_1.cancel_requested` exists, the manager may set it, and the operator
honours it, but no capability sets it.

## 5. `SandboxType`

The CRD is in the operator chart (`crds/karkhana.budy_sandboxtypes.yaml`, short name `sbxtype`). The deployed instance is
platform-crs `v1/stacks/de-v2-sandbox-type/claude-coder-1.yaml`:

```yaml
apiVersion: karkhana.budy/v1alpha1
kind: SandboxType
metadata:
  name: claude-coder-1
spec:
  description: Claude Code for the dt-consulting-services coder
  image: 745404749629.dkr.ecr.us-west-2.amazonaws.com/ob1-ecr-repo-v2/ob1_tf_aws_ecr_sandbox-shell-1_repo-1:claude-code-1-0.1.0
  workspace: {path: /workspace, size: 20Gi, storageClassName: sandbox-gp3-1}
  resources:
    requests: {cpu: "1", memory: 2Gi}
    limits: {cpu: "2", memory: 4Gi}
  lifetime:
    defaultTTLSeconds: 14400      # 4 hours
    maxTTLSeconds: 28800          # 8 hours
    idleTimeoutSeconds: 1800      # pause after 30 minutes without a running command
    pausedRetentionSeconds: 604800  # delete a paused sandbox after 7 days
  placement:
    nodeSelector: {budy.io/nodepool: "true", budy.io/compute-type: standard}
    tolerations: [{key: budy.io/nodepool-required, operator: Exists, effect: NoSchedule}]
  networkProfile: sandbox-coder-1
  secrets:
    - name: claude-oauth-token
      secretRef: {name: claude-code-oauth-1, key: token}   # a Secret in the operator's namespace (VSO)
      env: CLAUDE_CODE_OAUTH_TOKEN
  identity:
    kind: sandbox-1
    roles: [svcrole-dtcs-coder-1]
    audiences: ["urn:budy:nexus:ob1-nexus-gitjib-cluster-1-endpoint-1:GitjibBrokerV1"]
  allowedRoles: [svcrole-dtcs-coder-1]
  limits: {maxPerTenant: 10, maxPerRequester: 10}
```

Schema notes: a `secrets` entry sets exactly one of `env` (an environment variable) or `file` (an absolute path, mounted
read-only, mode 0400); at most 16 entries. `networkProfile` matches `sandbox-<name>-<n>`. `requests` for cpu and memory
are required, because usage is metered from them.

The TTL bounds a sandbox's total running time; time spent paused does not count, and a paused sandbox is removed after
`pausedRetentionSeconds`. The idle timeout is measured from the later of the last command and the start of the run, and a
sandbox with a queued or running command is never idle. Every field is validated by the CRD schema, and the operator's
`SandboxType` controller sets a `Validated` condition for the spec's generation after the checks a schema cannot make:
requests positive and not above limits, a positive workspace size, default TTL not above the maximum, unique secret names,
environment names and files, no `SANDBOX_` environment name, no file under `/run/budy`, `/tmp`, `/var/run/secrets/budy` or
the workspace, `maxPerRequester` not above `maxPerTenant`. The operator refuses to start a sandbox of a type that is
missing or not validated (phase `failed`, reason `sandbox type`); pause and delete still work. Types are deployed from
platform-crs.

## 6. What the operator creates

All in the tenant namespace, all named from the sandbox id (`sbx-` and 20 lower-case base32 characters, `[a-z2-7]`):

| Object | Name | Notes |
| --- | --- | --- |
| ServiceAccount | `<id>-sa-1` | `automountServiceAccountToken: false`. The pod mounts one projected token, audience `auth.budy.internal`, at `/var/run/secrets/budy/sts/token` (lifetime `sts.sandboxTokenExpirationSeconds`, 3600 by default, at least 600). |
| PersistentVolumeClaim | `<id>-pvc-1` | ReadWriteOnce; size and class from the type. Kept across pauses, deleted with the sandbox. |
| Secret | `<id>-secret-1` | Created only when the type has `secrets`: a copy of the values they name, keyed by the entry name. Deleted on pause and on delete. |
| Pod | `<id>-pod-1` | One container `sandbox`, the type's image, command `sandbox-runner-1 init`. uid and gid 1000 (`fsGroup` 1000), non-root, no privilege escalation, all capabilities dropped, read-only root, seccomp `RuntimeDefault`, restart policy `Always`, termination grace 30 s, no service links. Volumes: the workspace at the type's path, `emptyDir` `/run/budy` (64 Mi) and `/tmp` (1 Gi), the projected token. Ready when `sandbox-runner-1 ready` answers. Node selector and tolerations from the type; a required node affinity for the recorded zone (or the requested one) when there is one. |

Environment of the container: `SANDBOX_ID`, `SANDBOX_TENANT`, `SANDBOX_TYPE`, `SANDBOX_WORKSPACE`; when the operator has an
STS URL, `SANDBOX_STS_URL`, `SANDBOX_STS_AUDIENCES` (the type's identity audiences, as JSON), `SANDBOX_STS_SESSION`
(`editor`) and `SANDBOX_K8S_TOKEN_FILE`; when the request has a `git` source and the operator has a git URL,
`SANDBOX_GIT_URL`, `SANDBOX_GIT_PROJECT`, `SANDBOX_GIT_BRANCH` and `SANDBOX_GIT_AUDIENCE` (the operator's `git.audience`,
else the type's first audience); then the type's secrets.

Labels on every object: `app.kubernetes.io/managed-by: sandbox-operator-1`, `karkhana.budy/sandbox-id`,
`karkhana.budy/sandbox-type`. The pod also carries `budybot.io/netpol: <networkProfile>` and
`budy.io/user-org-short-name: <tenant>` (the tenant namespace denies egress to pods without it).

### Operator behaviour

- **Ownership.** When a create finds the object already there, the operator adopts it only if it carries all three labels
  (managed-by, sandbox id, sandbox type). Otherwise the sandbox fails with reason `name conflict`, the object is left
  untouched, and the periodic resync looks again (no backoff). The Secret is written with a JSON patch whose `test`
  operations require the labels, so the API server checks ownership atomically; the operator never reads Secrets in tenant
  namespaces. Teardown and the sweep never delete an object without the labels, and a Secret delete carries the UID
  recorded when it was created.
- **Phase changes.** A phase change and its `event_1` row are written in one transaction. A failed step records phase
  `failed` with the reason in `last_error` and is retried with the controller's backoff; the move out of `failed` happens
  when a step succeeds.
- **Runs.** A run opens when the pod is ready (start time: the pod's Ready transition) and closes when the pod stops. The
  measured totals stay in memory until the close has succeeded, so a failed close finds them on the retry. The meterer
  updates the cumulative totals of open runs only. Measured usage of a run is counted only while the run is open: it
  starts from zero when the run opens and is re-attached to the open run after an operator restart.
- **Provision timeout.** A pod not ready 10 minutes after creation is deleted and the sandbox fails (`pod not ready`, with
  the scheduling or container reason).
- **Concurrency.** One active replica (leader election by a Lease); four sandboxes reconciled in parallel.

### Operator permissions

- A ClusterRole with: pods (create, delete, get, list, watch), `pods/exec` (create), persistentvolumeclaims and
  serviceaccounts (create, delete, get, list, watch), secrets (create, patch, delete only: no read outside its own
  namespace), `sandboxtypes` (get, list, watch) and `sandboxtypes/status` (get, update, patch), `userorgs` (get, list,
  watch), namespaces and nodes (get, list, watch), persistentvolumes (get, to read the CSI volume handle), and
  `metrics.k8s.io` pods (get, list).
- A `ValidatingAdmissionPolicy` `sandbox-operator-1-fence`, matched to the operator's ServiceAccount: create, update and
  delete of pods, persistentvolumeclaims, serviceaccounts and secrets are admitted only in a namespace labelled
  `platform.budy.ob1.ai/managed-by: user-org` and only on an object labelled `app.kubernetes.io/managed-by:
  sandbox-operator-1` (an update also needs the label on the stored object). `pods/exec` is a CONNECT request whose object is
  the exec options, not the pod, so the pod's labels cannot be checked: it is admitted only in such a namespace and only for
  a pod named `<sandbox id>-pod-1`.
- A Role in its own namespace: Secrets (get, list, watch: the ones the types name), its leader-election Lease, and Events.

### Commands

The caller's command is a row. The operator starts it in the pod through `sandbox-runner-1 exec` (a short `pods/exec`, 30 s
at most, SPDY transport by default), which runs it detached and writes its output and exit code under
`<workspace>/.sandbox/commands/<commandId>/`. The operator polls with `sandbox-runner-1 status` and copies the state, the
exit code and the output tail to the row; a command that ends by itself records a `command` event. A command therefore
survives an operator restart, and a long run holds no stream open. Commands run in `seq` order, one at a time. A command
the runner does not know after a pod replacement ends `failed`; one the pod restart interrupted carries a note. When a
sandbox is deleted, queued commands end `cancelled` and a running one `failed`. Files from `putFiles` are written with
`sandbox-runner-1 put` while the pod is running, and their content is removed from the database once written or failed.

## 7. Lifecycle

Desired state (`sandbox_1.desired_state`): `running`, `paused`, `deleted`.
Observed phase (`sandbox_status_1.phase`):

```text
pending → provisioning → running ⇄ pausing → paused ⇄ resuming → running
   any ── desired deleted, TTL reached or paused retention reached ──▶ deleting → deleted
   failed: a step could not complete; the reason is in last_error and the operator retries with backoff
```

- **Provisioning:** resolve and verify the namespace, check the type, create the workload session (section 8) and wait
  until it is active, create ServiceAccount, PVC and Secret, then the pod. If the request names a zone the pod is required
  there; otherwise the scheduler chooses. When the pod is scheduled the operator records region and zone from the node and
  never changes them. When the pod is ready the run opens, `expires_at` is set to the run's start plus the remaining running
  budget, and the phase is `running`. Without an identity service URL the sandbox starts without an identity and without
  STS environment, and an `identity` event says so.
- **Pause:** by request (`desired_state` `paused`), or by the operator when no command has run for `idleTimeoutSeconds`
  (the desired state stays `running`; `observed_generation` is held at the generation seen when the pause began). The pod and
  the Secret are deleted, the run closes (stop reason `paused` or `idle`) and the identity is released. The volume stays.
- **Resume:** the same steps as provisioning with the existing volume and a node affinity for the recorded zone. An
  idle-paused sandbox resumes when the manager writes a newer generation (`resumeSandbox`) or a command is queued. A pod
  that cannot be scheduled in the zone is not moved: after the provision timeout the sandbox is `failed`.
- **Interruption:** a pod lost to a node (spot reclaim, drain) is recreated in the recorded zone; the run that ended is
  closed (`interrupted`), an `error` event `pod lost` is written, the phase goes back to `provisioning` and a new run opens.
  A pod that ended `Failed` or `Succeeded` (evicted, finished) is deleted and recreated.
- **Expiry:** the running budget (`ttl_seconds`, the closed runs plus the open one) is used up: the sandbox is deleted (stop
  reason `expired`). A paused sandbox is deleted `pausedRetentionSeconds` after `paused_at` (stop reason `deleted`).
- **Delete:** the pod is removed, the run closed, the commands finished (queued ones cancelled, a running one failed), the
  identity released, then the Secret, ServiceAccount and PVC are removed; the row is kept for the record and its usage stays.
- **Cleanup:** every object and every volume the operator creates, and the workload session, is a row in `resource_1`. A
  sweep every 10 minutes compares the rows with the labelled pods, volumes and ServiceAccounts in the cluster, both ways:
  labelled objects of a deleted or unknown sandbox older than 10 minutes are deleted; a row whose object is gone is
  released; the Secret of a deleted or paused sandbox is deleted by its row (Secrets cannot be listed); and an object
  carrying the label but no row is reported once as a `cleanup` event. Objects without the sandbox-id label are never
  touched.

The operator learns of changes by `LISTEN` on the channel `sandbox_1` (a trigger notifies with the sandbox id on every
insert or update of `sandbox_1`, every insert of `command_1` or update of its `cancel_requested`, and every insert of
`file_1`), by watches on the pods and volumes it labels, and by a full resync of every sandbox that is not `deleted`, every
60 seconds and after every reconnect of the listener, which is also how it recovers after a restart. Each sandbox row has
a `generation` the manager increments and the operator echoes as `observed_generation`.

## 8. Identity

A sandbox acts as itself, not as its requester and not with a token handed to it.

1. On start the operator asks authz-manager-1 (`POST /v1/workload-sessions`, authenticated with the operator's projected
   ServiceAccount token whose audience is `authz-manager-1`, `identity.tokenAudience`) for a **workload session** of kind
   `sandbox-1`: the tenant, the namespace, the ServiceAccount, the requester, the roles the type lists, the `glassboxId`,
   an expiry and the sandbox id as the reference. The expiry is the remaining running budget plus 5 minutes of grace. It
   polls `GET /v1/workload-sessions/{id}` until the state is `active`.
2. authz-manager-1 creates a user of the `workload-session` UserType homed in that tenant whose only identity is that
   ServiceAccount, and grants it the roles with that expiry (a conditional grant, `non_expired_grant`, so OpenFGA ends it by
   itself). A role is granted only if the kind's configuration allows it and the requester holds it on the tenant now and
   until the expiry; the namespace must be the tenant's; the ServiceAccount must be bound to no other user. The user has no
   access to any other tenant. A session whose requester later loses a role, or whose tenant is retired, is ended by the
   maintenance task.
3. In the pod, `sandbox-runner-1` exchanges the projected Kubernetes token (audience `auth.budy.internal`) at the STS
   (`POST /v2/oauth2/token`, token exchange, tenant scope, session `editor`) for STS tokens for the audiences the type
   lists, writes them under `/run/budy/tokens/` (an `index.json` maps each audience to its file) and renews them at two
   thirds of their lifetime, with exponential backoff from 1 s to 60 s on failure. Tools read them from there. The runner's
   git credential helper hands the token of `SANDBOX_GIT_AUDIENCE` to git for the host of `SANDBOX_GIT_URL`; once a GitLab
   proxy exists, GitLab access uses that STS token through gitjib's token broker and no GitLab credential reaches the
   sandbox. That path is not deployed yet (Status).
4. On pause and on delete the operator releases the session (a resume creates a new one for the same reference). If the
   operator is down, the expiry ends it.

The workload session is a general authz-manager-1 capability: `sandbox-1` is one entry of its configuration
(`config.workloadSessionKinds`: the callers that may create, read and release, the roles a session may carry, its maximum
lifetime from creation, and the namespaces). The entry for `sandbox-1` is: caller the operator's ServiceAccount
(`system:serviceaccount:ob1-tf-eks-de-v2-sandbox-1-ns-1:sandbox-operator-1`), roles `[svcrole-dtcs-coder-1]`,
`maxLifetime: 8h5m` (the type's maximum TTL of 8 hours plus the operator's 5-minute grace), namespaces `["$tenant"]`. It is
written in de-v2 #2414 (open), for dev only. authz-manager-1 refuses a `workload-session` UserType that has creators or is
tenant-managed. A create for a kind and reference whose earlier session is past its expiry but not yet swept ends that
session and creates the replacement. The operator's service user `sandbox-operator-1` holds the `requester` relation on the
create and release operations (authz-config `bundles/authz-manager-policy.yaml`).

## 9. Billing entity and usage

- `glassbox_id` is a standard STS claim: the entity that pays for what a session does. It is a digital teammate of the
  tenant (the default for a teammate's own session) or the tenant itself. A service acting in a tenant names it when it
  exchanges, and the STS checks that it belongs to the tenant. For a workload session it is fixed: authz-manager-1 records
  it as a `glassbox` tuple on the session's user (the tenant, or a digital teammate of it that is neither admin nor owner)
  and the STS stamps that value on every session it mints for that user. An OpenFGA model without `user#glassbox` (OpenFGA
  `relation_not_found`) means "no fixed billing entity" and the default applies; any other OpenFGA error fails closed.
- The manager stores the caller's `glassbox_id` on the sandbox, or the tenant when the token carries none; the workload
  session carries it, so the sandbox's own sessions are stamped with it too. gitjib's token broker uses the claim to pick the
  teammate: it is matched against a DigitalTeammate's `spec.name` (the generated teammate id), and the tenant id leaves the
  teammate to the request.
- The operator writes `usage_1` rows with service `karkhana-cluster-1`, resource reference `sandbox/<id>` and attributes
  `type`, `zone` and `region`:

  | Meter | Unit | Written for a window when |
  | --- | --- | --- |
  | `sandbox.cpu-request-seconds` | `seconds` | a pod held its CPU request: the request in cores times the seconds a run overlapped the window |
  | `sandbox.memory-request-gib-seconds` | `gib-seconds` | the same, for the memory request in GiB |
  | `sandbox.storage-gib-seconds` | `gib-seconds` | the volume existed, also while the sandbox is paused (from the volume's `resource_1` row) |
  | `sandbox.cpu-used-seconds`, `sandbox.memory-used-gib-seconds` | `seconds`, `gib-seconds` | `metrics.k8s.io` answered and a sample fell in the window |

  Windows are five minutes, aligned to the clock (:00, :05, ...) in UTC, and a window is written once it has closed, at the
  next check (the operator checks every 30 seconds, `usage.interval`, which is also the metrics sampling interval). The
  idempotency key is `sandbox/<id>/<meter>/<window start, RFC 3339 UTC>`; an existing key is skipped. At start the operator
  writes the windows closed while it was down, up to 288 windows per sandbox per pass, and it keeps writing for a sandbox for
  2 hours after its last run or volume. Used meters are sampled in memory, so a restart loses the measured usage of the
  windows still open; the request and storage meters are recomputed from `run_1` and `resource_1`. `run_1` holds one row per
  run (from a pod start to its stop) with the same totals, refreshed while the run is open.
- Glassbox reads `usage_1` with the schema's read-only role. Rating and enforcement are Glassbox's.

## 10. Data (database `ob1-karkhana-db-1`, schema `sandbox`)

| Table | Writer | Content |
| --- | --- | --- |
| `sandbox_1` | manager | id, tenant, requester, glassbox_id, type, idempotency_key (unique per tenant), desired_state, ttl_seconds, requested_zone, git, labels, generation, created_at, updated_at |
| `sandbox_status_1` | operator | sandbox_id, phase, observed_generation, namespace, region, zone, pod, service_account, workload_session_id, running_seconds (the closed runs), expires_at, paused_at, last_command_at, last_error, updated_at |
| `command_1` | manager inserts and sets `cancel_requested`; operator completes | id, seq, sandbox_id, script, env, timeout_seconds, idempotency_key (unique per sandbox), state, cancel_requested, exit_code, output_tail, log_path, created_at, started_at, finished_at. The operator writes state, exit_code, output_tail, log_path, started_at and finished_at. |
| `file_1` | manager inserts, operator completes | id, seq, sandbox_id, request_key and ordinal (the manager's own identity for one `putFiles` execution, derived from its workflow run and step, and the file's place in it; unique per sandbox when the key is set), path, mode, content (removed once the operator has finished the file), state, error, created_at, written_at |
| `run_1` | operator | id, sandbox_id, started_at, stopped_at, stop_reason (`paused`, `idle`, `expired`, `deleted`, `interrupted`, `failed`), node, zone, cpu_request_millis, memory_request_bytes, storage_bytes, and the cumulative meters cpu_request_seconds, memory_request_gib_seconds, cpu_used_seconds, memory_used_gib_seconds (the last two null without metrics) |
| `usage_1` | operator | the standard usage record |
| `resource_1` | operator | id, sandbox_id, kind (`Pod`, `PersistentVolumeClaim`, `ServiceAccount`, `Secret`, `WorkloadSession`), namespace, name, uid, external_id (the EBS volume), region, zone, size_bytes, state (`active`, `released`), created_at, released_at |
| `event_1` | operator | id, sandbox_id, at, kind (`phase`, `error`, `cleanup`, `identity`, `command`), from_phase, to_phase, reason, detail |

Roles: `sandbox-manager-1` uses `ob1-karkhana-db-1-sandbox-rw-role`; the operator uses
`ob1-karkhana-db-1-sandbox-operator-rw-role`; readers use `ob1-karkhana-db-1-sandbox-ro-role`. These are
per-schema roles, not the database's three standard roles: the platform's database grants job creates them and the schema
(the database's entry in `standard-db-custom-grants-1`, argocd-eks-stack) and gives Vault the right to issue credentials in
them, and each workload's Vault catalog entry names its role. The migration (`00001_init.sql`) runs as the admin role,
creates no role, and fails if the manager or operator role is missing. It then revokes everything from the manager and
operator roles on the eight tables and grants exactly:

| Role | Grants |
| --- | --- |
| manager | SELECT on all eight tables; INSERT and UPDATE on `sandbox_1`; INSERT on `command_1` and UPDATE of `cancel_requested`; INSERT on `file_1`; the sequences of `command_1` and `file_1` |
| operator | SELECT on all eight tables; INSERT and UPDATE on `sandbox_status_1`, `run_1`, `resource_1`, `event_1`; UPDATE of `state`, `exit_code`, `output_tail`, `log_path`, `started_at`, `finished_at` on `command_1`; UPDATE of `content`, `state`, `error`, `written_at` on `file_1`; INSERT on `usage_1`; the sequence of `event_1` |
| read-only | SELECT (default privileges) |

No role can DELETE. The trigger function `sandbox.notify_sandbox_1` sends the sandbox id on the channel `sandbox_1`.

## 11. Network

| Profile | Destinations |
| --- | --- |
| `sandbox-coder-1` | DNS; the STS (sts-service, over HBONE); the npm proxy (npm-proxy-1, over HBONE); `api.anthropic.com` and `platform.claude.com` on 443. Nothing else, and no ingress. It denies the kube-apiserver, the node and other nodes, and the instance metadata address. There is no rule for GitLab yet: no GitLab proxy exists (Status). |

A profile is a `CiliumClusterwideNetworkPolicy` in k8s-security (`egress-tenant-sandbox-coder-1-allow-required`, under
`v1/objects/rbac/cluster/manifests/tenant-sandbox-netpol/`) that selects the label in namespaces managed by a UserOrg.
Tenant namespaces are Istio ambient, so a call to an in-mesh service leaves the pod as HBONE and the destination's own
policy limits tenant callers to one port. The label value `sandbox-coder-1` is reserved by an OPA constraint to pods
labelled `app.kubernetes.io/managed-by: sandbox-operator-1`. Ingress to a sandbox is denied by the namespace; the operator
reaches it with `pods/exec`, which does not use the pod network.

The operator's own policy allows the kube-apiserver, Postgres (CNPG in dev and stage, RDS in prod) and the
authz-manager-1 API; the manager's allows Temporal, the read-only OpenFGA proxy and Postgres.

## 12. How dt-consulting-services is meant to use it

Planned: `delivery-lead-1` (phase 2 of dt-consulting-services-1; not built) would run as the coder service user and
exchange into the engagement's tenant, naming the requesting teammate as `budy_glassbox_id`. Then:

1. `requestSandbox {type: claude-coder-1, idempotencyKey: <engagement id>, git: {projectPath, branch}}`.
2. `getSandbox` until `running`.
3. `putFiles` with the PRD and the HLD.
4. `runCommand` with the Claude Code invocation; `getCommand` until it ends; repeat for each round of the compile and CI
   loop.
5. `pauseSandbox` while a review is pending, `resumeSandbox` to continue, `deleteSandbox` when the engagement closes.

The `git` source needs the GitLab path in Status; until then, put the files with `putFiles`.

## 13. Not in this design

- Archiving a paused workspace to a snapshot (the cluster has no snapshot controller).
- Sandbox types other than `claude-coder-1`.
- Callers other than the coder service role.
- Cancelling a command through a capability.
