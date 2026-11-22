# Component Authorization Module Standard

|                  |                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Document**     | Component Authorization Module Standard                                                                                                 |
| **Version**      | 0.2                                                                                                                                     |
| **Status**       | Draft for research and review. New standard for new repositories; no compatibility with context-cluster or dt-manager is planned.        |
| **Audience**     | Component engineers, platform engineers who approve authorization models, and k8s-security owners                                       |
| **Purpose**      | One shared Go module that every component inserts to ask "may subject S have relation R on object O?" against its own OpenFGA model.    |
| **Last Updated** | November 2026                                                                                                                           |

Authentication is already standard: an STS bearer token is verified at the gateway (`go/capability/gateway/stsauth`), and the tenant and user come only from that token. This document standardizes what happens next: **authorization**. It reflects the owner's decisions of October 2026 and the evidence listed in section 2.

## 1. Decisions

| # | Decision |
| --- | --- |
| 1 | One shared Go module, `go/authz` in budy-common-modules. Any component, in any cluster, inserts it and tells it which relation to check on which object. |
| 2 | **No policy decision service.** The module calls the existing read-only OpenFGA proxy (`openfga-1-readonly-proxy`) over HTTP. It does not use Nexus and does not call `sts-service`. |
| 3 | **No service identity and no token handling in the module.** The proxy is unauthenticated by design; admission is by network policy. The subject comes from the identity the gateway already fixed (`ComponentRequest`), never from a payload. |
| 4 | **One shared store with one OpenFGA module per service** (the current model of `auth-store-2`). The platform team approves model changes. |
| 5 | **The component's model lives in its own repository** and is the single reference for the relations the component checks. |
| 6 | **Authorization is strict.** Every capability declares an `authorize:` block. There is no way to mark a capability public. The only operation without an authorization check is capability discovery (`DescribeCapabilities`), which still requires a valid token. |
| 7 | Checks run at the gateway (coarse, from the manifest) and in component activities (fine, per object). Both use this module. |
| 8 | OpenFGA will be locked down, so the read-only proxy becomes the only access path for readers. Models are moving out of `argocd-eks-stack` into a shared models repository in a parallel workstream; this standard targets "the models repository" and does not depend on which one. |
| 9 | OpenFGA module names end in `-1`, like every platform entity. The 12 existing modules are renamed (argocd-eks-stack PR 1365); nothing else references them. |
| 10 | Fail closed. A deny and an outage are different results, and neither is ever read as allow. |

## 2. What exists today (verified in the repositories)

- **One store, modular model.** `argocd-eks-stack`, `v2/apps/platform/authz/openfga-1/manifests/v2/models/fga.mod` (schema 1.2) lists 12 modules: `platform-roles`, `identity`, `tenant-roles`, `audience`, `conditions`, `context-cluster`, `infrastructure`, `credentials`, `service-access`, `connections`, `authz-manager`, `feature`. `stores/README.md` states there is **one** OpenFGA store, `auth-store-2`; the folders under `stores/` are tuple seeds, not stores.
- **A service model is a module that extends shared types.** `context-cluster.fga` owns `context_scope` and `context_type` and extends `platform`, `tenant` and `audience` with its own relations. Object ids carry the scope, for example `context_scope:tenant/acme/meeting`.
- **Adding a module touches three hand-maintained lists:** `fga.mod`, the `openfga-1-model-v2` ConfigMap generator in `v2/kustomization.yaml`, and the explicit `cp` list in `jobs/model-bootstrap.job.yaml`. The Job also folds every tuple seed into its digest; a changed digest writes a new model and moves the environment's model binding. `authz-config_gitops_repo-1` is currently a README only, so today the models are owned by `argocd-eks-stack`.
- **Read-only proxy.** `openfga-1-readonly-proxy.yaml` is plain nginx. It forwards only `POST /stores/<store>/check`, `/list-objects` and `/list-users` for the one store (port 8080, used by `sts-service` and `sts-service-external`) and adds `/read` on port 8081 (`authz-provider`). Everything else, including writes, model reads and other stores, gets 403. OpenFGA itself runs with `authn.method: none`. Callers are admitted per listener by Cilium rules in `k8s-security` (`authz-1-ns-1/ingress/openfga-1-readonly-proxy.allow-*.yaml`, matching on namespace and the `budybot.io/netpol` pod label).
- **Tuples are written only by `authz-manager-1`.** Components never write tuples.
- **The Go side.** `ComponentRequest` carries `ScopeType`, `TenantID`, `User` and `SessionBoundary`, set by the gateway from the verified token. The manifest has no authorization field today (`go/capability/manifest.go`), and `dispatch.ExecuteWorkflow` has no authorization step.

## 3. Identity rule: no token in the module

The module never sees or forwards a bearer token. The gateway has already verified it. The module builds the subject from the verified identity:

- Subject `user:<User>` from `ComponentRequest.User` (or `dispatch.Command.User` at the gateway).
- Tenant objects use `ComponentRequest.TenantID`, built with `authz.TenantObjectOf` (which refuses a `/` in the tenant or the id, so two pairs never name one object).
- The session fact is `ComponentRequest.SessionBoundary`, added to every check that reaches an `active_*` relation with `CheckRequest.WithSession(tenant, user, boundary)`. An empty boundary adds nothing and the check denies.
- A component that needs a non-user subject (for example `tenant:acme` against a service-access relation) passes it explicitly in code. It is never read from the request payload.

Consequence, accepted by the owner: the proxy does not authenticate callers, so any pod the network policy admits can ask about any subject. Subject discipline is enforced by the module's API shape, code review and per-component admission, not by the infrastructure. `CallerToken` is not needed for authorization and must not be passed to authorization calls.

## 4. The module (`go/authz`)

Signatures only. Names are a proposal.

```go
package authz

type Subject string // "user:u1", "tenant:acme"
type Object string  // "deployment_1:acme/d1"; ObjectOf(type, id) validates both parts

type Tuple struct{ Subject Subject; Relation string; Object Object }

type CheckRequest struct {
    Subject     Subject          // required: build with UserSubject(identity)
    Relation    string
    Object      Object
    Contextual  []Tuple          // validated against the model, never persisted
    Context     map[string]any   // OpenFGA condition context
    Consistency Consistency      // Default | HigherConsistency
}
type Decision struct{ Allowed bool; ModelID string }

type ListRequest struct {
    Subject    Subject
    Relation   string
    ObjectType string
    Contextual []Tuple
    Context    map[string]any
}
type ListResult struct{ Objects []Object; Truncated bool }

type Checker interface {
    Check(ctx context.Context, r CheckRequest) (Decision, error)
    BatchCheck(ctx context.Context, rs []CheckRequest) ([]Decision, error) // same length and order as the input
    ListObjects(ctx context.Context, r ListRequest) (ListResult, error)
}

func UserSubject(userID string) (Subject, error) // from ComponentRequest.User; rejects an empty or malformed id
func ObjectOf(typ, id string) (Object, error)
func TenantObjectOf(typ, tenant, id string) (Object, error) // type:<tenant>/<id>; refuses '/' in tenant or id
func SessionTuples(tenant, user, boundary string) ([]Tuple, error) // the contextual session_<boundary> fact; none for an empty boundary
func (r CheckRequest) WithSession(tenant, user, boundary string) (CheckRequest, error) // replaces any session_* tuple the request carried
func Require(ctx context.Context, c Checker, r CheckRequest) error // nil, *DeniedError or ErrUnavailable
// package authztemporal:
func ToTemporalError(err error) error // denied: non-retryable PERMISSION_DENIED; invalid: non-retryable INTERNAL; unavailable: retryable UNAVAILABLE

var ErrUnavailable, ErrInvalid error

type Config struct { BaseURL, StoreID, ModelID string; Timeout time.Duration; Cache CacheConfig; HTTPClient *http.Client }
func New(cfg Config) (*Client, error)
func ConfigFromEnv(getenv func(string) string) Config // AUTHZ_OPENFGA_URL, AUTHZ_STORE_ID, AUTHZ_MODEL_ID, AUTHZ_TIMEOUT
```

Behaviour that is part of the standard:

- **Fail closed.** The zero `Decision` is a deny. Empty relation, subject or object is `ErrInvalid`. There is no bypass switch in production code; tests inject a different `Checker`.
- **Deny is not an error; outage is.** `Check` returns `Decision{Allowed:false}, nil` for a deny, and `ErrUnavailable` for timeouts, 5xx, an unknown model or any malformed answer. No method returns allow together with an error.
- **Retries belong to Temporal.** The module does not retry; default timeout 2s per call. Activity retry policy handles `ErrUnavailable`.
- **Cache: off by default.** Opt-in in-process cache, TTL capped at 30s, keyed on everything that can change the answer: subject, relation, object, the contextual tuples, the condition `Context` and the consistency level (plus the model id, fixed per client). A check evaluated with a different `Context` (a `current_time` before and after a conditional grant expires) never shares an entry. A time-based condition can still expire inside the TTL, which is another reason the TTL is short. Duplicate identical calls in flight are collapsed; a cancelled caller never receives a cached or joined decision. Errors are never cached. Revocation lag equals the TTL, which is why it is off by default.
- **`ListObjects` is a lower bound, never an exhaustive answer.** OpenFGA stops a list at its result limit (default 1000) or its deadline and returns what it has, with no completion indicator. The module sets `Truncated` when the result reaches the limit, but a list cut short by the deadline looks complete, so `Truncated == false` does not prove completeness. A list can only miss objects the subject may access, never add one, so it is safe for showing a user their items; it must not be used to decide that an object is absent or that a decision is final. Decisions use `Check` or `BatchCheck` on candidate rows. Raising the server's limit and deadline is a platform setting.
- **`Expand` is not part of v1.** No service in the evidence needs it.
- **Model and store come from the environment's binding.** The model id is the one the bootstrap Job publishes to the versioned binding ConfigMap (the same source `sts-service` reads: `OPENFGA_STORE_ID`, `OPENFGA_AUTHORIZATION_MODEL_ID`). The chart exposes them to components as env.

## 5. Where checks run

### 5.1 Gateway (coarse), declared in the capability manifest

Every capability has an `authorize:` block. A manifest without one fails to load.

```yaml
capabilities:
  getTransitionStatus:
    description: Read the status of a worker transition.
    authorize:
      relation: can_view                 # must exist on the object's type in the component's model
      object: "deployment_1:{tenant}"    # templates: {tenant}, {platform}, {user}, {payload.<field>}
    schema: { ... }
```

Rules:

- `{payload.<field>}` may name only a top-level string field that the capability's schema marks `required`. This is checked when the manifest loads.
- `{tenant}` against a platform-scope token (no tenant) is rejected.
- `{platform}` is the token's platform. Against a tenant-scope token (no platform) it is rejected, so a platform-scope capability writes
  `object: platform:{platform}` and refuses tenant tokens; it never names a business platform literally, so one manifest holds on every
  business platform. A literal platform id stays legal for a fixed grant checked with a tenant session (`platform:budy`). The gateway states a
  platform session on the token's platform and denies an object naming another, so a session on one platform never satisfies a check on
  another. See [Platforms and platform sessions](../ref/platforms.md).
- No `public` option, no expressions, one check per capability. Anything richer is a component-level check in code.
- The gateway runs the check in a new activity after `ValidateSchema` and before the child workflow starts, using the identity from the token. A deny returns `PERMISSION_DENIED`; an outage returns `UNAVAILABLE`.
- `DescribeCapabilities` stays authentication-only. It reveals capability names and schemas, not tenant data.

`go/capability` stays free of a dependency on `go/authz`: `dispatch` defines a small `Authorizer` interface, as it does for `Authenticator`, and the gateway wires `authz.Client` into it.

### 5.2 Component activity (fine)

Per-object decisions, ownership, negative checks and list filtering stay in component code. The check runs in the same activity that touches the data, immediately after the tenant assertion:

```go
func (a *Activities) GetTransitionStatus(ctx context.Context, req dispatch.ComponentRequest) (contract.TransitionStatus, error) {
    if err := assertTenant(req); err != nil { return ..., err }
    subject, _ := authz.UserSubject(identityOf(req))
    object, _ := authz.TenantObjectOf(example.TransitionType, req.TenantID, in.TransitionID)
    check, _ := authz.CheckRequest{Subject: subject, Relation: example.RelCanViewTransition, Object: object}.
        WithSession(req.TenantID, req.User, req.SessionBoundary) // the token's live tier; empty means no tier
    if err := authz.Require(ctx, a.Authz, check); err != nil { return ..., authz.ToTemporalError(err) }
    ...
}
```

## 6. Models in the component repository

### 6.1 Layout

```text
components/<component>-1/authz/       # <component>-1: every platform entity ends in -1
  <component>-1.fga         # OpenFGA module file; first line `module <component>-1`
  tests.store.fga.yaml      # fga model test fixtures: tuples + assertions
  relations.gen.go          # generated typed constants (types, relations)
```

### 6.2 Rules for modules in a shared store

- **Module names end in `-1`**, like every platform entity (owner decision, October 2026): `module <component>-1`, in a file of the same name. The 12 existing modules were renamed to follow it (`context-cluster-1`, `tenant-roles-1`, ...). The names inside the module carry the generation too (next bullet).
- **Names inside the module end in `_1`** (snake_case, like the existing types): every type the module owns (`deployment_1`) and every relation it adds to a shared type (`can_view_deployment_1` on `tenant`). Types and added relations are global across the store, so this is what lets a `-2` generation run beside `-1` without colliding. Relations on a module's own types need no suffix, since the type already carries it. Shared types (`tenant`, `platform`, `audience`, `user`) are owned by the platform modules and are never suffixed. Object ids in tuples follow the type: `deployment_1:acme/d1`. The 12 existing modules keep their type names: unlike the module name, a type name is stored in every tuple and used by `auth-service` code, so renaming it is a data migration, not a rename.
- Type names and any relation added to a shared type are global across the store. A module must not redeclare another module's names. CI composes the candidate module with the current `fga.mod` and runs `fga model validate`.
- Service objects carry the tenant in the id (`deployment_1:acme/d1`) and relate to `tenant`, following `context_scope`.
- A module never defines tenant membership or platform roles. It extends `tenant-roles` and `platform-roles`.
- **Models change additively.** Pinned worker versions finish on the build they started on and keep asking the old relations. Publish the additive model first, ship the component after, remove a relation only after the last build that uses it is sunset. A removed relation is rejected by OpenFGA and the module returns `ErrUnavailable` (deny), never allow.

### 6.3 How a model reaches the store (proposed)

1. The component repo validates `<module>.fga` and `tests.store.fga.yaml` in CI (`fga model validate`, `fga model test`).
2. On release, the platform-actions workflow `authz-model-pr.yml` (section 12) opens a PR against the repository that owns the models, adding the module file and its `fga.mod` entry. The platform team approves it. This is the existing review path for changes to `auth-store-2`.
3. Argo CD syncs, the bootstrap Job writes a new model, and the binding ConfigMap moves to the new model id.

The bootstrap Job now copies `*.fga` (PR 1365), so a module is one new file, one `fga.mod` line and one entry in the ConfigMap generator's file list. Kustomize has no glob for generator files, so that list stays until the models move to the shared models repository. Which repository owns the models (`argocd-eks-stack` today, `authz-config_gitops_repo-1` as intended) is open question 1.

### 6.4 One reference for code, manifest and tests

The model file is the reference for every relation a component checks:

- `authzgen` reads the model with the `openfga/language` Go transformer (`TransformModuleFilesToModel`, the call `authz-manager-1` already makes in `internal/model/files.go`). It is a separate tool, so `go/authz` keeps no OpenFGA dependency and writes `relations.gen.go` with type and relation constants. Code uses `deployer.RelCanViewTransition`, never a string literal.
- `capabilitytest.Verify` takes the model path and fails if any manifest `authorize.relation` or the object type of `authorize.object` is not in the model.
- A test fails if generated constants are stale.

## 7. Network

- Add a **component listener** to `openfga-1-readonly-proxy` (for example port 8082): `check`, `list-objects`, `list-users` and `batch-check` for the one store. `/read` stays on 8081 only. The current proxy has no `batch-check` route.
- In `k8s-security`, admit each component and gateway pod label (`budybot.io/netpol: <prefix>-<component>`) to that listener, and add egress from those pods to the proxy.
- The gateway needs the same rule. Its existing egress to `sts-service` is not used for authorization.
- Helm: the `platform-app-cluster` WorkerDeployment helper (component pods) and `platform-capability` (gateway chart) gain env: `AUTHZ_OPENFGA_URL`, `AUTHZ_STORE_ID`, `AUTHZ_MODEL_ID`, sourced from the environment's model binding ConfigMap. This is not verified: the library chart repository was not available to review.

## 8. Temporal rules

- Checks run in activities, never in workflow code. A check inside the activity that reads the data is preferred. The module also ships `authz.Activities` (`AuthzCheck`, `AuthzBatchCheck`) for the rare workflow-level branch.
- Checks are read-only and safe to retry.
- Activity input carries subject, relation, object and the contextual tuples (the session fact included), never payloads or tokens. The result recorded in history is `{allowed, modelId}`.
- Audit: structured log from the module with subject, relation, object, result and model id (no tokens). The proxy does not log decisions today; central decision audit is open question 4.
- Right after a grant, use `HigherConsistency` if read-your-writes matters (`GET /v1/requests/{id}` on authz-manager reports `converged`).

## 9. Testing

- **Interface-level tests with a real implementation.** Module `go/authzembedded` (separate, so the core stays dependency-light) provides `New(t, modelDSL, tuples...)` and `NewFromModules(t, schema, files, tuples...)`: a real OpenFGA v1.22.0 server with an in-memory datastore, the same client code path as production, plus `Grant` and `Revoke`. It is built and merged (common-modules PR 27, released with the next version PR) and passes the conformance suite below. The Postgres and OpenFGA containers that `authz-manager-1` uses remain an alternative.
- `authztest.Static` (package `go/authz/authztest`, in the core module) is an exact-tuple checker for flat relations. It rejects unknown relations, has no computed-relation semantics, and says so in its docs.
- **Conformance suite** `authztest.RunConformance(t, newChecker)`: deny versus unavailable, timeout and cancel, malformed object, contextual tuples, batch order, list truncation, cache behaviour, tenant isolation (a tuple in tenant A never grants in B), `Require` mapping. `ToTemporalError` is tested in `authztemporal`. The suite is built and passes against both `Static` and the real server.
- Per-component: `fga model test` on `tests.store.fga.yaml`, plus Go tests with `authzembedded.NewFromModules` loading the component's own model.

## 10. Packaging

- `go/authz` (core client on the standard library; `authztemporal` adds the Temporal SDK; `authztest` is in the same module) and `go/authzembedded` (test-only, OpenFGA server dependency), each its own Go module, tagged `go/authz/vX.Y.Z` and `go/authzembedded/vX.Y.Z`, released with changesets like `go/capability`. `authzembedded` requires `go/authz v0.1.0`, the first version, and keeps a local `replace` for development.
- `go/capability` changes: `authorize` in the manifest, load-time validation, the model check in `capabilitytest.Verify`, and the `Authorizer` step in `dispatch`.
- A worked example: the first worker component added to the `nainai-cluster-1_repo-1` reference (one capability, one relation on a tenant-scoped `_1` type, one model module, one `Checker` in `Activities`). Section 12 lists what has to be built first.

## 11. Unverified or open

Verified by building it: OpenFGA v1.22.0 can be embedded in tests and serves `/batch-check`, `/check` and `/list-objects`; the model language transformer used by `authz-manager-1` also compiles the renamed modules. Not verified: the server version `openfga-1` actually runs (so whether its proxy-side `/batch-check` works), the publishing workflow on GitHub, and the exact `platform-app-cluster` and `platform-capability` helper changes.

Open questions:

1. Which repository owns the shared models: `argocd-eks-stack` (today) or `authz-config_gitops_repo-1` (intended)? Who reviews at the platform team?
2. Are two admitted listeners enough, or do component pods in different clusters need per-cluster ingress rules?
3. Should the 12 existing modules' type names also move to `_1`? That is a tuple migration plus `auth-service` code changes, so the proposal leaves them.
4. Central decision audit: log at the module only, or add access logging to the proxy?
5. Should `authzgen` be a `go/authz` subcommand or a separate tool?

## 12. What has to be built

| # | Where | Work | Depends on |
| --- | --- | --- | --- |
| 1 | `budy-common-modules`: `go/authz` | **Built, merged and released** (common-modules PR 27, `go/authz` v0.1.0; v0.2.0 adds `SessionTuples`, `CheckRequest.WithSession` and `TenantObjectOf`, PR 31): client for the proxy, `Checker`, `Require`, `UserSubject`, `ObjectOf`, bounded cache, env config, `authztemporal`. First consumer: studio-services-cluster-1. | none |
| 2 | `budy-common-modules`: `go/authz/authztest`, `go/authzembedded` | **Built and merged** (common-modules PR 27; not yet tagged): `Static`, `RunConformance`, and the embedded real OpenFGA. | 1 |
| 3 | `budy-common-modules`: `go/authz/authzgen` | Typed constants from a model; the check that manifest relations exist in the model. | 1 |
| 4 | `budy-common-modules`: `go/capability` | `authorize:` on each capability, load-time validation (required, templates, payload fields), `capabilitytest.Verify` model check, `dispatch.Authorizer` and the gateway `Authorize` activity. Breaking: every existing manifest must add `authorize:` (changeset: minor while 0.x). | 1, 3 |
| 5 | `platform-actions` | **Built and merged** (platform-actions PR 58; usable as `@v1` after the next release, and `authz-model-pr.yml` has not run on GitHub yet): `validate-authz-model`, `stage-authz-model` and `authz-model-pr.yml`. Still to do: the catalog field and `app-cluster-ci` call. Original scope: `authz-model-pr@v1`: validate the module (`fga model validate`, `fga model test`), compose it with the current `fga.mod`, check the additive-only rule against the published model, then open the PR to the models repository. Plus a `validation.kind` or catalog field so `validate-cluster-catalog` knows a component ships a model (for example `authz: {module: authz/<module>.fga, tests: authz/tests.store.fga.yaml}`) and runs the checks in `app-cluster-ci`. | 3 |
| 6 | EKS stack (`openfga-1`) | Component listener and `batch-check` on the proxy; replace the three hand-kept module lists with a glob. Moves with the models repository when that work lands. | models repository plan |
| 7 | `k8s-security` | Ingress rules on the component listener for each component and gateway label; egress rules from them. Revisit OpenFGA ingress when it is locked down. | 6 |
| 8 | `ob1-mn-github-helm-charts-repo-1` | `platform-app-cluster` and `platform-capability`: `AUTHZ_*` env from the model binding ConfigMap. | 6 |
| 4a | `budy-common-modules`: `go/capability` | **Built, merged and released** (common-modules PR 31, `go/capability` v0.3.0): the session boundary. `stsauth.Identity.SessionBoundary` reads the token's `session_boundary` claim (viewer, editor or admin; absent is empty, anything else is rejected; formerly named `sessionBoundary`, and the module reads either), `dispatch` carries it in `ComponentRequest.SessionBoundary` and in the gateway workflow id when present. A component sends it to `go/authz` with `WithSession`, which adds the contextual `user:<u> session_<boundary> tenant:<t>` tuple that the platform's `active_*` tiers need; every check that reaches an `active_*` relation must carry it, and an empty boundary means no tier (deny). | 1 |
| 9 | Wiki | Update the `scaffold-nexus-cluster-repo` skill (`authorize:` required, `authz/` folder in the layout tree, the nexus checklist) and `application-cicd-standard.md` (model release step); promote this page from draft. | after the trial |
| 10 | Trial | First worker component in `nainai-cluster-1_repo-1`, which has only `gateway-1` today. | 1 to 8 |

Trial plan (item 10):

1. Add one tenant-scoped worker component with one read capability, a small model module extending `tenant`, and a `Checker` in its activities.
2. In dev only: publish the model by hand-driven PR first, then through `authz-model-pr` to prove the action.
3. Prove in tests, then in dev: an allowed user, a denied user, a user of another tenant, the proxy stopped (must deny with `UNAVAILABLE`, never allow), and a model PR that removes a relation (CI must fail).
4. Fold what breaks into this page before promoting it.

Order: 1 and 2 first (nothing else needs infrastructure), 3 and 4 next, 6 to 8 in parallel with them, 5 once 3 exists, the trial last.

## 13. Conditional grants: pass `current_time`

A relation can be granted with an OpenFGA condition. The one in use is `non_expired_grant(current_time, grant_time, grant_duration)` (`authz-config_gitops_repo-1`, `models/conditions.fga`), which ends a grant by itself when it expires. Example, `models/dt-consulting-services.fga`:

```text
define svcrole_dtcs_coder_1: [user, user with non_expired_grant]
```

A standing membership has no condition; a workload session (section 14) holds the role with one. The rule:

- **Every check that can reach such a relation must send `current_time` in the check context.** That includes everything derived from it: here `active_svcrole_dtcs_coder_1`, `service_role_holder`, `assumable_editor` and whatever extends from them. When a check reaches a conditional tuple without the parameter, OpenFGA answers with an error (`missing context parameters [current_time]`), not a deny.
- Format: the UTC time as RFC 3339, for example `2026-11-13T08:30:15Z`. It is the form sts-service sends.
- A check that cannot reach a conditional relation does not need it, but sending it is harmless. The reviewer and reader relations of the same model stay `[user]` only.

| Caller | How it passes the time | Code |
| --- | --- | --- |
| Go components on `go/authz` (sandbox-manager-1) | `CheckRequest.Context` carries `{"current_time": <UTC, truncated to the second, RFC 3339>}` on every check of the access gate. The second keeps repeated checks within it shareable in the opt-in cache (section 4), which keys on the context. | karkhana-cluster-1, `components/sandbox-manager-1/internal/access/access.go` (`currentTime`) |
| sts-service | Its authorizer sets `current_time` from its own clock on every check, and replaces a caller-supplied value on the Check/List endpoint. | auth-service-1, `sts-service/internal/authorizer/authorizer.go` (`currentTime`), `authorize.go` (`conditionContext`) |
| gitjib `token-broker-1` | Its own minimal OpenFGA client (no `go/authz` dependency) puts `current_time` into the `context` of every `check` call. | gitjib-cluster-1, `components/token-broker-1/internal/openfga/client.go` (`Check`) |

Consequences for callers:

- A deny is still a deny and an error is still an error (section 4). A missing parameter shows up as an invalid-request error; token-broker-1 turns it into a refusal with the OpenFGA message in its audit line, and sandbox-manager-1 counts a rejected request as a deny for that relation and logs it. Neither reads it as allow.
- A positive result that is cached can outlive the grant by up to the cache TTL (token-broker-1: `authz.cacheTtl`, default 30s, at most 1m; `go/authz`: at most 30s). Keep the TTL below any grant lifetime.
- A new component that checks a role relation should send the time from the first version, even if no conditional grant exists yet, because the model can add one without a change in the component.

## 14. Workload sessions and the `glassbox_id` claim

These are capabilities of `authz-manager-1` and `sts-service` (auth-service repository). They are generic; the sandbox service is the first user. Other pages own the details: this section says what a component author needs to know.

### 14.1 Workload sessions

A **workload session** is a short-lived identity for one workload that a platform service runs on a tenant's behalf (the sandbox operator, for pods in a tenant namespace). It acts only in that tenant, only for as long as the work, and never with more than the requester holds. Design: `docs/provisioning-service-design.md`, section 8.2, in `ob1_mn_gh_auth-service-1_repo-1`; code: `providers/authz-manager-1/internal/ops/workload_session.go` and `internal/api/workload_sessions.go`.

| Topic | Behaviour |
| --- | --- |
| API | `POST /v1/workload-sessions` (kind, tenant, namespace, serviceAccount, requester, roles, glassboxId, expiresAt, reference); `GET /v1/workload-sessions/{id}` (state `pending`, `active`, `released` or `expired`); `DELETE` releases (twice is not an error). |
| Identity | Kind plus `reference` name the session. The same pair is one session while it is live (identical request: no-op; later `expiresAt`: extension, never past `maxLifetime` after creation; different parameters: conflict). After release or expiry the pair starts another session. |
| Kinds are configuration | `config.workloadSessionKinds` (env `WORKLOAD_SESSION_KINDS`, empty by default). One reviewed entry per kind: `callers` (the workload ServiceAccounts that may create, read and release), `roles` (the only roles a session may carry), `maxLifetime`, `namespaces` (names, or `$tenant`). |
| Checks | All fail closed: the caller is in the kind's `callers`; every role is in the kind's `roles`; the requester is active and holds each role on the tenant for at least until `expiresAt`; the expiry is within `maxLifetime`; the namespace is allowed; the ServiceAccount is bound to no other user. |
| Expiry | The role tuple carries `non_expired_grant` with the expiry, so OpenFGA ends it by itself; the 5-minute maintenance sweep also ends sessions that are over, or whose requester lost a role, and withdraws their tuples. |
| Release | The caller releases explicitly when the work stops. A released session frees the ServiceAccount, so a later session can use it. |
| Billing entity | Recorded as a `glassbox` tuple on the session user (below). |
| Opt-in | A RoleType lists the `workload_session` user class in `allowedUserClasses` and must be tenant-scope and gitops-tier. |

Because the role is granted with a condition, every check a receiver makes for such a user needs `current_time` (section 13).

### 14.2 The `glassbox_id` STS claim

Every tenant session carries `glassbox_id` (formerly `glassboxId`): the entity that pays for what the session does, either the tenant id or a digital teammate of that tenant. STS decides it (`sts-service/internal/authorizer/glassbox.go`, `ResolveGlassboxID`); a caller cannot set it. Contract: `docs/v2-token-claims-contract.md`, "Billing entity".

- **Fixed for a workload session.** authz-manager-1 records the entity as a tuple that names the session user as its object: `tenant:<t> glassbox user:<session user>` or `user:<teammate> glassbox user:<session user>` (`authz-config_gitops_repo-1`, `models/workload-sessions.fga`, `define glassbox: [tenant, user]` on `user`). STS stamps that value, refuses a different `budy_glassbox_id`, re-checks at every mint that the entity still belongs to the tenant, and refuses a user with more than one record.
- **A model without `user#glassbox`** (OpenFGA `relation_not_found`) means "no fixed entity" and the default applies; any other OpenFGA error fails closed (`temporarily_unavailable`).
- **Otherwise** the default is the subject when it is a digital teammate of the tenant, else the tenant; a service may name one with `budy_glassbox_id` on the workload exchange and the user-delegation grant.

What a component does with it: record it, never derive it. How usage is recorded against it is in the [Usage Metering Standard](../ref/usage-metering-standard.md). A consumer that maps it to something else (token-broker-1 maps it to a DigitalTeammate by `spec.name`) says so in its own documentation.

Status: on de-v2 main no workload session kind is configured for authz-manager-1 (`charts/apps/auth-cluster-1` values hold no `workloadSessionKinds`). The `sandbox-1` kind (callers: the sandbox operator ServiceAccount; roles: `svcrole-dtcs-coder-1`; `maxLifetime` 8h5m; namespaces `$tenant`) is proposed for dev in de-v2 PR 2414, open on 13 November 2026. Stage and prod get the kind after the auth chart that accepts the `workload_session` class (0.1.100) and the `workload-session` UserType (platform-crs `authz-types/profile/dev`, dev only for now) reach them; authz-manager-1 refuses to start with a kind whose user type or roles the catalog does not accept.
