# Nexus contract, capability registry, tenancy

Applies to every execution-mode cluster (all are Nexus-first). Source: context-cluster `docs/design/00-overview.md` (D1–D12), `19-nexus-services.md`, `20-gateway-routing.md`, `shared/capability`, `shared/contract`; dt-manager `shared/contract/nexus.go`.

## 1. One endpoint, versioned services, fixed operation vocabulary

- **One Nexus endpoint per cluster**, named `ob1-nexus-<cluster>-endpoint-1`. It is a transport address and is **never versioned**. It targets the gateway worker (`namespace`, `taskQueue: <cluster>-gateway-tq`).
- **The Go constant and the chart helper must agree.** `contract.NexusEndpoint` in `shared/contract` and the umbrella chart helper `<cluster>.nexusEndpointName` are both literals and are **not value-configurable**, because callers compile against the constant before the chart is installed. Add a CI check that the two strings are equal (context-cluster and dt-manager rely on a code comment today).
- **The public API version lives in the Nexus *service* name**: `<Domain>ServiceV<N>`. The service version covers the whole contract — input/output types, identity boundary, validation, idempotency, async behavior, operations. Do not put `apiVersion` in requests and do not name operations `ExecuteV2`. Several services may be registered on the one endpoint: dt-manager registers `DTReviewerServiceV1`; the context-cluster gateway registers `ContextService` (V1, frozen), `ContextServiceV2` and `SandboxServiceV2`. `19-nexus-services.md` also designs `KubernetesServiceV1`, `ExecutionServiceV1` and `DesignServiceV1`; those are design, not yet registered in the gateway.
- **Fixed operation vocabulary: `Execute` and `DescribeCapabilities`, nothing per capability.** The capability (component and capability) is chosen inside `Execute` and resolved from the manifest; it is never a worker name or caller-controlled route. (context-cluster's per-operation services such as `ContextServiceV2.Retain` predate this and stay as they are.)
- **Every service exposes exactly two operations, `Execute` and `DescribeCapabilities`** (the kit's `dispatch.NewService` registers both). `DescribeCapabilities` returns components, capabilities, descriptions and (on request) payload schemas, never task queues or workflow types, and needs any valid token. Callers discover capabilities without a contract change.
- **Component modules, task queues and workflow type names are not public API versions.** `ExampleWorkflowV2` may implement `<Domain>ServiceV1`'s `ping`; each evolves independently under Worker Deployment Versioning.
- **Typed references shared by gateway and callers:** publish `nexus.NewOperationReference[Req, Resp](OperationName)` from `shared/contract` so a signature change is a compile error on both sides.
- **Mutating operations require `idempotencyKey`.**
- **Unimplemented operations** reject with the Nexus not-implemented handler error (`nexus.HandlerErrorTypeNotImplemented`) until a design defines them. This is a Nexus handler error, not a `contract.Code`.

## 2. Contract module (`shared/contract`)

Contents: endpoint and service constants, the two operation names, the STS audience (`urn:budy:nexus:<endpoint>:<Service>`), the wire types (**aliases** of the shared envelope in `go/capability/gateway/dispatch`: `ExecuteRequest`, `ExecuteResponse`, `Auth`, `DescribeRequest`, `DescribeResponse`, so every cluster speaks the same JSON), component and capability name constants, and the typed payload of each capability. The caller's STS token travels in `Request.Auth.Token`, as `config.auth` does in context-cluster; it is encrypted in history when payload encryption is on.

Release: own changeset package; Git tag `shared/contract/vX.Y.Z` (module-directory prefix is required by Go for sub-root modules). Treat names and field semantics as stable; breaking change = new service version.

Callers import this module; they never import gateway or component code.

## 3. The capability registry (universal)

Owner decision (October 2026): every cluster has a capability registry with **dynamic routing and discovery**. A **capability** is data, not code:

- A component ships a YAML **manifest** into the gateway chart (`charts/gateway-1/files/capabilities/<component>.yaml`).
- The chart renders an aggregate **ConfigMap** (`platform-capability.capabilitiesConfigMap`), mounted at `CAPABILITIES_DIR` (default `/etc/capabilities`).
- The gateway builds an in-memory **registry** at startup (`capability.LoadDir`); the `checksum/capabilities` pod annotation rolls the gateway when any manifest changes. There is no runtime component discovery from the cluster; discovery is what callers get from `DescribeCapabilities`.
- Adding a capability or a whole component = component change + manifest change. **No gateway code change.**
- Code: `go/capability` in `budy-common-modules` (`capability`, `capability/capabilitytest`, `capability/gateway/{stsauth,dispatch}`). Nothing of it is copied into a cluster repo.

### Manifest format

```yaml
apiVersion: capabilities.budy.bot/v1   # the old context.budy.bot/v1 + ProviderCapabilities pair is not accepted
kind: ComponentCapabilities
component: example-1                    # unique within the cluster; ends in -1
taskQueue: <cluster>-example-1-tq          # <cluster>-<component>-tq; the shared task-queue ConfigMap overrides it at startup
workflowType: ExampleWorkflowV1            # <Thing>WorkflowV<N>
defaults:
  executionTimeout: 30s
capabilities:
  getTransitionStatus:
    description: Read the status of a worker transition. Read-only.
    timeout: 30s                       # optional; falls back to defaults, then 30s
    # route:                           # optional per-capability override of taskQueue/workflowType
    schema:                            # JSON Schema 2020-12 for the request payload
      type: object
      additionalProperties: false
      required: [transitionId]
      properties:
        transitionId: { type: string, minLength: 1 }
```

- The gateway uses each `schema` **verbatim** (`santhosh-tekuri/jsonschema/v6`); there is no code generation. Unknown fields in a manifest are rejected at load.
- **Schema honesty:** the schema must match what the activity accepts. A breaking change means a new capability name (`update` → `updateV2`), a new workflow type, or a new service version, never a silent change.
- **Task queue override:** `capability.Registry.OverrideTaskQueuesFromEnv` reads `<COMPONENT>_TASK_QUEUE` (upper-case, dashes to underscores); the chart's `componentTaskQueueEnv` helper wires those from the shared task-queue ConfigMap, so queue names have one source of truth. By convention a component's manifest `component:` equals its chart and catalog name.
- **Conformance test, not a lint script.** Each component's Go tests call `capabilitytest.Verify(t, "<path to charts/gateway-1/files/capabilities>", capabilitytest.Expect{Component, TaskQueue, WorkflowType, Capabilities})`. It fails if the manifest does not load, the component is missing, any capability routes anywhere other than what the worker registers, or the capability set differs. CI runs it as ordinary `go test`; `make lint-capabilities` and per shell edits are gone.
- Typed service bindings specific to one cluster stay in that cluster; keep gateway code free of per-component branching.

### What the gateway does

`dispatch.ExecuteWorkflow` does exactly three things: **authenticate** (at the Nexus boundary, before the workflow starts), **ValidateSchema** (activity: resolve route + validate payload), and **route** (child workflow of the manifest's `workflowType` on its `taskQueue`, with a deterministic workflow id from tenant, user and the idempotency key or a request hash). It holds no business logic and no state. Component failures return as typed errors in the `Response`, never as a failed gateway workflow. Not routed by the kit: `componentType: external` (returns `UNIMPLEMENTED`); a cluster that needs it adds its own workflow.

## 4. Tenancy and auth

- **One authentication standard for every gateway:** an STS bearer token (RS256 JWT) in `Request.Auth.Token`, verified by `stsauth` against the auth cluster's JWKS endpoint **over HTTP** (`http://sts-service.ob1-tf-eks-de-v2-auth-1-ns-1.svc.cluster.local:8080/.well-known/jwks.json`). It checks signature, `iss`, `aud`, `exp` and `nbf`, then takes `scopeType` (`tenant` or `platform`), the tenant from the `scopeId` claim and the user from `sub`. A request carries no identity of its own: nothing the caller asserts beside the token is read. Unknown key ids re-fetch the JWKS at most every 30 seconds.
- **Deployment values, not caller choices:** `STS_ISSUER` (`https://auth.budy.internal/sts`), `STS_JWKS_URL`, `STS_AUDIENCE` (`urn:budy:nexus:<endpoint>:<Service>`, per environment in GitOps), `STS_SCOPE_ID_CLAIM`, `STS_PRINCIPAL_CLAIM`. A gateway without them refuses to start.
- **Network:** the gateway pod needs egress to `sts-service` (label `budybot.io/netpol: sts-service`, namespace `ob1-tf-eks-de-v2-auth-1-ns-1`) on 8080 and to the Temporal frontend. Kubernetes TokenReview (audience `auth.budy.internal`, used by context-cluster and dt-manager for in-cluster service-account callers) is **not** part of the kit; a gateway that needs it adds it locally and the kube-apiserver egress with it.
- **Enforced twice:** the gateway fixes the identity from the token and passes it to the component as `ComponentRequest{TenantID, User, ScopeType}`; nothing the request says about tenant or user is read or forwarded. Every component activity asserts `TenantID` **as its first line** and scopes all access to it; a component serving tenant data refuses platform-scoped (tenant-less) callers. Never trust anything but the validated token identity.
- **Authorization** beyond authentication (OpenFGA behind the auth service) is the component's or controller's decision, done through the auth cluster's Nexus service; it is data/FGA, not context-key literals in Go.
- The caller's token travels to components as `CallerToken` so they can call other clusters on the caller's behalf; the payload codec (Vault Transit) keeps it out of history when payload encryption is on.

## 5. Workflows and rollout

- Workflow code is deterministic; all I/O in activities; activities idempotent. The gateway derives the child `WorkflowID` from `idempotencyKey` (or a request hash) so retried Nexus calls dedupe.
- **One entrypoint workflow per component**, switching on `req.Capability` and dispatching to capability-specific activities (fewer workflow type names to version). Unknown capability → `contract.Fail(CodeInvalidArg, …)`.
- **Worker Deployment Versioning, Pinned (D10):** each component is its own `WorkerDeployment`; Build ID = component version (`package.json` version = image tag = sub-chart `appVersion` = Build ID). Executions finish on the version they started; rollback is instant; component task queues version independently of the gateway.
- **Temporal resources are chart-owned.** `TemporalNamespace` and `TemporalNexusEndpoint` (`temporal.ob1.ai/v1alpha1`, platform Crossplane provider; the endpoint writes the server-assigned endpoint ID to a connection Secret via `writeConnectionSecretToRef`) and `Connection` (`temporal.io/v1alpha1`, Temporal worker controller) are rendered by the umbrella chart, each behind an `enabled`/`create` flag so a platform-managed resource can be referenced instead. Workloads are `WorkerDeployment` CRs (`temporal.io/v1alpha1`).

## 6. Nexus-first checklist (use in review)

- [ ] Exactly one Nexus endpoint, named `ob1-nexus-<cluster>-endpoint-1`; Go constant == chart-derived name (test).
- [ ] Services named `<Domain>ServiceV<N>`; each exposes `Execute` and `DescribeCapabilities`; mutating capabilities take `idempotencyKey`.
- [ ] `shared/contract` is its own module, tagged `shared/contract/vX.Y.Z`; typed operation references exported.
- [ ] Gateway has no business logic and no persistent state; does not import any component.
- [ ] Every component has a manifest and a `capabilitytest.Verify` test (green).
- [ ] Gateway auth is `stsauth` with the STS values from GitOps; egress to `sts-service:8080` allowed.
- [ ] Every activity asserts tenant first.
- [ ] Workflow types end `V<N>`; Worker Deployment Versioning Pinned; Build ID == component version.
- [ ] No `contextKey`/component-name branching in gateway Go; no secrets in workflow payloads.
- [ ] Capability schemas honest; breaking changes use new capability/workflow names.
