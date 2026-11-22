# BudyWorkerPool `(bwp)`

`platform.budy/v1alpha1` · Namespaced (userOrg namespace)

A pool of worker slots within a userOrg namespace, instantiated from a [BudyWorkerPoolType (bwpt)](budyWorkerPoolType%20(bwpt).md) template. [BudyWorker (bw)](budyWorker%20(bw).md)s reference this pool to inherit resource bounds and node scheduling rules. For Single pools each slot maps to one BudyWorker; for Shared pools one worker serves all slots.

**Created by:** [BudyServer (bs)](budyServer%20(bs).md) — automatically creates one BudyWorkerPool per pool type entry in the referenced [BudyServerType (bst)](budyServerType%20(bst).md).

| Field | Description |
| --- | --- |
| `spec.budyWorkerPoolTypeRef.name` | The [BudyWorkerPoolType (bwpt)](budyWorkerPoolType%20(bwpt).md) template for this pool |
| `spec.slots` | Number of concurrent worker slots (set by BudyServer from type defaults) |
| `spec.resourcesPerSlot` | CPU/memory per slot (set by BudyServer from type defaults) |
| `spec.autoscaling` | KEDA min/max bounds — Shared pools only |
| `spec.replicas` | Static replica count — Shared pools only, overridden by autoscaling |
| `spec.overrides.maxTimeoutMinutes` | Per-pool timeout override (max 1440 min) |

**Status phases:** `Pending` → `Provisioning` → `Ready` / `Degraded` / `Deleting`

Status also surfaces `activeWorkers`, `resolvedConfiguration` (effective slots/resources/maxWorkers), and the `workers` list of attached BudyWorker names.

```yaml
apiVersion: platform.budy/v1alpha1
kind: BudyWorkerPool
metadata:
  name: budytestorg-server-1-workerpool-single-standard-medium-574453
  namespace: uo-bpo1-budytestorg-ns-1
spec:
  userOrgShortName: budytestorg
  budyWorkerPoolTypeRef:
    name: single-standard-medium
  serverType: t1bsmall
  slots: 4
  resourcesPerSlot:
    cpu:
      maxCPU: 0.4
      reserveCPU: 0.25
    memory:
      maxMemoryMB: 1024
      reserveMemoryMB: 256
```

**Related:** [BudyServer (bs)](budyServer%20(bs).md), [BudyWorkerPoolType (bwpt)](budyWorkerPoolType%20(bwpt).md), [BudyWorker (bw)](budyWorker%20(bw).md)
