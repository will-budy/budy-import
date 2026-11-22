# BudyDigitalEntity `(bde)`

`platform.budy/v2` · Namespaced (userOrg namespace)

Provisions a Digital Entity instance for a userOrg: a dedicated Kubernetes namespace, a Temporal task queue, and an ArgoCD Application that manages the entity's workload. Each BudyDigitalEntity represents one autonomous agent instance within a userOrg.

**Created by:** [BudyServer (bs)](budyServer%20(bs).md) — created automatically when `spec.digitalEntities` entries are declared on the BudyServer. Can also be applied directly.

**Reconciles:** DE-specific k8s namespace, Temporal task queue, ArgoCD Application

| Field | Description |
| --- | --- |
| `spec.userOrgShortName` | Org identifier — immutable after creation |

**Status phases:** `Pending` → `Provisioning` → `Ready` / `Degraded` / `Deleting`

Status also surfaces `digitalEntityNamespace`, `temporalNamespace`, `temporalQueueName`, and `applicationName`.

```yaml
apiVersion: platform.budy/v2
kind: BudyDigitalEntity
metadata:
  name: budytestorg-bde-1
  namespace: uo-bpo1-budytestorg-ns-1
spec:
  userOrgShortName: budytestorg
```

**Related:** [BudyServer (bs)](budyServer%20(bs).md), [BudyTemporalObject (bto)](budyTemporalObject%20(bto).md)
