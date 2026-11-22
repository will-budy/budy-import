# BudyServerType `(bst)`

`platform.budy/v1alpha1` · Cluster-scoped

Cluster-level template that defines a server tier: which [BudyWorkerPoolType (bwpt)](budyWorkerPoolType%20(bwpt).md)s are included and how many of each. When a [BudyServer (bs)](budyServer%20(bs).md) is created, it reads this type to determine which [BudyWorkerPool (bwp)](budyWorkerPool%20(bwp).md)s to provision.

**Created by:** Platform ops — applied once at cluster setup, before any BudyServers.

| Field | Description |
| --- | --- |
| `spec.serverTypeName` | Infrastructure name, lowercase + numbers only (e.g. `t1bsmall`) |
| `spec.budyWorkerPoolTypeRefs` | List of `{name, count}` — which pool types and how many |
| `spec.temporalRetention` | Default Temporal retention for userOrg namespaces (e.g. `7d`) |
| `spec.displayName` | Human-readable name (e.g. `t1b.small`) |
| `spec.description` | Optional context about this server tier |

**Status:** Conditions only — no phase.

```yaml
apiVersion: platform.budy/v1alpha1
kind: BudyServerType
metadata:
  name: t1b-small
spec:
  displayName: t1b.small
  serverTypeName: t1bsmall
  description: Small server type with 1 shared small pool and 1 single small pool.
  temporalRetention: 7d
  budyWorkerPoolTypeRefs:
    - name: shared-standard-small
      count: 1
    - name: single-standard-small
      count: 1
```

**Related:** [BudyServer (bs)](budyServer%20(bs).md), [BudyWorkerPoolType (bwpt)](budyWorkerPoolType%20(bwpt).md)
