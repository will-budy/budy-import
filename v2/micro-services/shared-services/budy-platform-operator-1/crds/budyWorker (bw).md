# BudyWorker `(bw)`

`platform.budy/v1alpha1` · Namespaced (userOrg namespace)

Provisions a Temporal worker Deployment and KEDA ScaledObject in the userOrg namespace for a specific workflow version. Each BudyWorker maps to one published workflow automation — either dedicated to a single task queue (Single) or shared across multiple workflows (Shared).

**Created by:** Publish Consultant Workflow — triggered automatically when a consultant publishes an automation from Design Services.

**Reconciles:** `Deployment`, `ScaledObject` (KEDA)

| Field                         | Description                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `spec.workerType`             | `Single` (dedicated per workflow) or `Shared`                                |
| `spec.workflowVersionId`      | Temporal task queue name — required when `workerType` is `Single`            |
| `spec.budyWorkerPoolRef.name` | The [BudyWorkerPool (bwp)](budyWorkerPool%20(bwp).md) this worker belongs to |
| `spec.image`                  | Worker container image                                                       |
| `spec.replicas`               | Desired replica count when autoscaling is not used (default 1)               |
| `spec.temporalNamespace`      | Temporal namespace whose task queue KEDA monitors for scaling                |
| `spec.autoscaling`            | Optional KEDA min/max replica bounds                                         |

**Status phases:** `Pending` → `Provisioning` → `Ready` / `Degraded` / `Deleting`

```yaml
apiVersion: platform.budy/v1alpha1
kind: BudyWorker
metadata:
  name: budytestorg-bw-3h552ty
  namespace: uo-bpo1-budytestorg-ns-1
spec:
  userOrgShortName: budytestorg
  workerType: Single
  workflowVersionId: wfv_v1_5f0bf1c3ae55402caf
  image: 515407373958.dkr.ecr.us-west-2.amazonaws.com/ob1-ecr-repo-v2/workflow-worker-image_repo-1:wfv_v1_5f0bf1c3ae55402caf
  budyWorkerPoolRef:
    name: budytestorg-server-1-workerpool-single-standard-medium-574453
  temporalNamespace: budytestorg-ns
  autoscaling:
    min: 1
    max: 10
```

**Related:** [BudyWorkerPool (bwp)](budyWorkerPool%20(bwp).md), [BudyWorkerPoolType (bwpt)](budyWorkerPoolType%20(bwpt).md)
