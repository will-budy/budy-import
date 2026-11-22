---
name: Tenant Management — PRD
code: tenant-management-prd
version: 0.1
status: design
last_updated: 2026-04-11
---

# Tenant Management — Product Requirements

> **Phase**: Phase 3/4 (not Phase 1 or 2). At launch, tenant provisioning covers 3 fixed clients manually bootstrapped. This service automates that process for scale.

## Purpose

Automate the full lifecycle of de-v2 tenants: provisioning, configuration, suspension, and offboarding. Today, adding a new enterprise client to de-v2 requires a Budy engineer to manually create a Temporal namespace, create a K8s namespace, register agents in the agent registry, set up Nexus routes between shared and tenant namespaces, and deploy digital entity 2 Deployments. At 3 clients this is manageable; at 10+ it is toil.

Tenant lifecycle is managed by a **Kubernetes operator** that watches a custom resource called `DigitalEntity` (`de`). When a `DigitalEntity` CR is created or updated, the operator reconciles all required infrastructure. The operator is an extension of Budy's existing K8s operator, which already manages custom CRDs and has Temporal admin API access.

## Core Responsibilities

- **Provision**: On new `DigitalEntity` CR creation, create all required infrastructure — see [Operator Reconcile Loop](#operator-reconcile-loop) below.
- **Update**: Handle changes to tenant configuration (adding/removing agents, updating image tags, changing resource quotas) by reconciling the diff.
- **Suspend**: Scale all digital entity 2 Deployments to zero without destroying state. Used for billing suspension or temporary holds. Implemented by patching the ArgoCD Application values to set `replicas: 0` or by signaling the `DataLayerProvisioningWorkflow`.
- **Offboard**: Full decommission — drain in-flight workflows, archive memories/skills to cold storage, tear down K8s and Temporal resources. Reversible for a configurable grace period (90 days default). The Temporal `DataLayerProvisioningWorkflow` (running in the `platform` namespace) owns the data teardown steps.
- **Status**: Operator writes status conditions to the `DigitalEntity` CR so `kubectl get de` reflects provisioning state.

## `DigitalEntity` CRD Shape

```yaml
apiVersion: budy.bot/v1
kind: DigitalEntity
metadata:
  name: acme-senior-living
spec:
  tenantId: acme-senior-living
  temporalNamespace: acme-senior-living-agents
  agents:
    - id: support-agent
      image: budy/digital-entity-2:v1.2.0
      taskQueue: support-agent
      initialSkills: [support-base-v1, crm-lookup-v1]
    - id: report-agent
      image: budy/digital-entity-2:v1.2.0
      taskQueue: report-agent
      initialSkills: [report-base-v1]
  resourceQuota:
    requests.cpu: "4"
    requests.memory: "8Gi"
  retentionDays: 30
status:
  conditions:
    - type: NamespaceReady
    - type: TemporalReady
    - type: VaultReady
    - type: ArgoCDApplicationReady
    - type: DataLayerReady
  phase: Active  # Provisioning | Active | Suspended | Offboarding
```

## Operator Reconcile Loop

When a `DigitalEntity` CR is created or updated, the operator performs the following steps in order. All steps are idempotent — re-running reconcile on an existing CR is safe.

### 1. K8s Namespace

Create `de-v2-{tenantId}-agents`. This is the only K8s resource the operator creates directly in the cluster outside of ArgoCD.

### 2. ArgoCD Application

The operator applies an ArgoCD `Application` manifest with tenant-specific values embedded inline via `helm.valuesObject`. The Application points at the standard `de-v2-tenant` Helm chart. ArgoCD owns all resources inside the tenant namespace from this point forward.

### Resources rendered by the Helm chart into the tenant namespace:

- Agent worker `Deployment`s — one per entry in `spec.agents`
- KEDA `ScaledObject`s — one per Deployment, scaling on Temporal task queue depth
- `ServiceAccount`, `Role`, `RoleBinding` — grants digital entity 2 pods K8s API access for Sandbox Service 1 Job spawning
- `NetworkPolicy` — allows ingress from `de-v2-platform` namespace and Temporal; denies all else
- `ResourceQuota` + `LimitRange` — derived from `spec.resourceQuota`
- Istio `PeerAuthentication` — enforces mTLS in the namespace
- Prometheus `ServiceMonitor` — scrapes digital entity 2 metrics
- Vault `SecretProviderClass` — wires pod identity to the per-tenant Vault path

### 3. Temporal Namespace

Via the Temporal admin API (operator already has access):

- Create namespace `{spec.temporalNamespace}`
- Set retention policy from `spec.retentionDays`
- Register required custom search attributes: `tenantId`, `agentId`, `threadId`
- Register Nexus endpoint in the `platform` namespace bridging to `{spec.temporalNamespace}` — this is what allows Comms Router 1 to call `agent.executeTask()` on the tenant namespace

### 4. Vault

- Create KV path `secret/de-v2/{tenantId}/` for tenant-specific secrets
- Create Vault policy granting the digital entity 2 ServiceAccount read access to that path only
- Create Kubernetes auth role binding `de-v2-{tenantId}-agents/digital-entity-2` to the policy

### 5. DataLayer Provisioning (Temporal Workflow)

The operator starts a `DataLayerProvisioningWorkflow` in the `platform` Temporal namespace using a deterministic workflow ID (`data-layer-provision-{tenantId}`). This workflow handles the durable, retryable data setup steps:

- Insert row in `tenant_registry`
- Insert rows in `agent_registry` (one per `spec.agents` entry)
- Register default Auth Service permission policies for each agent
- Seed initial approved skills defined in `spec.agents[*].initialSkills`

On completion, the workflow writes back a signal that the operator uses to set the `DataLayerReady` status condition on the CR.

### 6. Status Update

After each step, the operator updates the corresponding status condition on the `DigitalEntity` CR. When all conditions are `True`, `status.phase` transitions to `Active`.

## Suspend / Offboard

**Suspend**: The operator patches the ArgoCD Application values to scale all agent Deployments to zero. In-flight Temporal workflows drain naturally (no force-termination). The `DataLayerProvisioningWorkflow` is signaled to mark the tenant as `Suspended` in `tenant_registry`. State is fully preserved.

**Offboard**: The operator signals the existing `DataLayerProvisioningWorkflow` (looked up by deterministic ID `data-layer-provision-{tenantId}`) to begin the offboarding sequence:

1. Drain in-flight agent workflows (Temporal namespace goes into drain mode)
2. Archive memories and skills to cold storage (S3)
3. Mark tenant as `Offboarding` in `tenant_registry`
4. After grace period (`spec.offboardGraceDays`, default 90): delete PostgreSQL rows, deregister Nexus endpoint, delete Temporal namespace

The operator then deletes the ArgoCD Application (ArgoCD cascades deletion of all namespace resources) and the K8s namespace.

The `DigitalEntity` CR is retained with `status.phase: Offboarded` until the grace period expires, so the tenant can be reinstated without full re-provisioning.

## Consumers

- **Platform Operators** (Budy engineering/ops): apply `DigitalEntity` CR via kubectl or a Slack-triggered GitOps PR
- **Future: Client onboarding workflow**: when Budy signs a new client, the onboarding workflow creates the CR automatically

## What It Is NOT Responsible For

- v1 tenant provisioning (separate concern in the v1 Design Services)
- Billing or contract management
- Client-facing portal
- Helm chart contents — the chart is a separate artifact owned by platform engineering; the operator only supplies values

## Success Criteria

- New tenant fully provisioned (`status.phase: Active`) in < 5 minutes from CR creation
- All reconcile steps are idempotent — re-applying the CR is safe at any point
- Full audit trail: status conditions on CR + Temporal workflow event history for data layer steps
- Offboarding is reversible within the grace period — no data deleted until grace period expires
- Suspend/resume does not lose any in-flight workflow state

## Open Questions

1. How does initial agent persona configuration (system prompt, personality) get defined for a new client? Via a `spec.persona` block in the CRD, or via a separate `AgentPersona` CRD referenced by ID?
2. What is the offboarding grace period default and who controls it — operator-level default or per-CR override?
3. Should the operator also manage v1 tenant provisioning, or stay strictly de-v2 scope?
4. Auth JWT signing: single Vault symmetric key or per-tenant asymmetric key pair? (Affects what the operator creates in Vault — see auth-service TRD.)
