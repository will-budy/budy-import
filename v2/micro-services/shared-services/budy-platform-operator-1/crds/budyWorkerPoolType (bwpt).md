# BudyWorkerPoolType `(bwpt)`

`platform.budy/v1alpha1` · Cluster-scoped

Cluster-level template that defines compute characteristics for a worker pool: whether it is Single (one worker per slot) or Shared (one worker for all slots), total CPU/memory caps, default slot configuration, and node scheduling rules. Referenced by [BudyServerType (bst)](budyServerType%20(bst).md) and used when [BudyServer (bs)](budyServer%20(bs).md) creates [BudyWorkerPool (bwp)](budyWorkerPool%20(bwp).md)s.

**Created by:** Platform ops — applied once at cluster setup.

| Field | Description |
| --- | --- |
| `spec.poolType` | `Single` (one worker per slot) or `Shared` (one worker for all slots) |
| `spec.totalCPU` / `spec.totalMemoryMB` | Maximum total resources across all slots |
| `spec.defaultPoolSpec.defaultSlots` | Default slot count for new pools of this type |
| `spec.defaultPoolSpec.defaultResourcesPerSlot` | Default CPU/memory per slot |
| `spec.defaultPoolSpec.defaultAutoscaling` | Default KEDA autoscaling bounds (Shared pools only) |
| `spec.maxTimeoutMinutes` | Maximum worker execution time (default 60) |
| `spec.nodeScheduling` | Node selector + taints for Karpenter placement |

**Status:** Conditions + `activePoolCount` — no phase.

```yaml
apiVersion: platform.budy/v1alpha1
kind: BudyWorkerPoolType
metadata:
  name: single-standard-medium
spec:
  displayName: Single standard Medium
  description: Single worker per slot, standard compute, medium size (2 CPU, 8 GiB total cap).
  poolType: Single
  totalCPU: 2
  totalMemoryMB: 8192
  maxTimeoutMinutes: 60
  defaultPoolSpec:
    defaultSlots: 4
    defaultResourcesPerSlot:
      cpu:
        maxCPU: 0.4
        reserveCPU: 0.25
      memory:
        maxMemoryMB: 1024
        reserveMemoryMB: 256
  nodeScheduling:
    nodeTaints:
      - key: budy.io/nodepool-required
        value: "true"
        effect: NoSchedule
    nodeSelector:
      budy.io/nodepool: "true"
      budy.io/compute-type: standard
      budy.io/spot-allowed: "true"
```

**Related:** [BudyServerType (bst)](budyServerType%20(bst).md), [BudyWorkerPool (bwp)](budyWorkerPool%20(bwp).md)
