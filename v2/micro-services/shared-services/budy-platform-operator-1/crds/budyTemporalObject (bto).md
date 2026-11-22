# BudyTemporalObject `(bto)`

`infra.budy/v1` · Cluster-scoped

Manages a single Temporal resource — either a **namespace** (with optional custom search attributes and retention) or a **Nexus endpoint** registered against an existing namespace. Exactly one mode must be set per CR. Used by operator controllers to declaratively manage Temporal infrastructure, and can also be applied directly by platform ops for custom endpoints.

**Created by:** Operator controllers ([BudyServer (bs)](budyServer%20(bs).md), [BudyDigitalEntity (bde)](budyDigitalEntity%20(bde).md)) or platform ops directly for custom Nexus endpoints.

**Reconciles:** Temporal namespace OR Temporal Nexus endpoint (mutually exclusive per CR)

| Field | Description |
| --- | --- |
| `spec.namespace.name` | Temporal namespace to create/manage |
| `spec.namespace.retention` | Workflow retention period (e.g. `7d`, `30d`) |
| `spec.namespace.searchAttributes` | Custom search attributes to register (name + type) |
| `spec.nexusEndpoint.endpointName` | Nexus endpoint name to register |
| `spec.nexusEndpoint.namespace` | Target Temporal namespace (must already exist) |
| `spec.nexusEndpoint.taskQueue` | Target task queue within the namespace |
| `spec.nexusEndpoint.description` | Optional human-readable description |

**Status phases:** `Pending` → `Provisioning` → `Ready` / `Degraded`

Status surfaces `temporalNamespace` (namespace mode) or `nexusEndpointId` (nexus mode).

**Namespace example:**

```yaml
apiVersion: infra.budy/v1
kind: BudyTemporalObject
metadata:
  name: org-budytestorg-namespace
spec:
  namespace:
    name: uo-bpo1-temporal-budytestorg-ns-1
    retention: 7d
    searchAttributes:
      - name: UserOrgShortName
        type: Keyword
      - name: WorkflowVersionId
        type: Keyword
```

**Nexus endpoint example:**

```yaml
apiVersion: infra.budy/v1
kind: BudyTemporalObject
metadata:
  name: budytestorg-payments-nexus
spec:
  nexusEndpoint:
    endpointName: budytestorg-payments
    namespace: uo-bpo1-temporal-budytestorg-ns-1
    taskQueue: payments-handler
    description: Nexus endpoint for the budytestorg payments workflow handler.
```

**Related:** [BudyServer (bs)](budyServer%20(bs).md), [BudyDigitalEntity (bde)](budyDigitalEntity%20(bde).md)
