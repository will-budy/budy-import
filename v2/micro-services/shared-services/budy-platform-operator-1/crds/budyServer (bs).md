# BudyServer `(bs)`

`platform.budy/v1alpha1` · Namespaced (operator namespace)

Top-level object per userOrg (client tenant). On creation, the operator provisions a dedicated Kubernetes namespace and Temporal namespace for the userOrg, then creates [BudyWorkerPool (bwp)](budyWorkerPool%20(bwp).md)s from the referenced [BudyServerType (bst)](budyServerType%20(bst).md) and any [BudyDigitalEntity (bde)](budyDigitalEntity%20(bde).md)s declared in spec.

**Created by:** Platform ops — one per client, applied manually or via GitOps on client onboarding.

**Reconciles:** userOrg k8s namespace, Temporal namespace, [BudyWorkerPool (bwp)](budyWorkerPool%20(bwp).md) CRs, [BudyDigitalEntity (bde)](budyDigitalEntity%20(bde).md) CRs

| Field | Description |
| --- | --- |
| `spec.userOrgShortName` | Unique org identifier, 2–12 lowercase alphanumeric chars |
| `spec.budyServerTypeRef.name` | The [BudyServerType (bst)](budyServerType%20(bst).md) that defines pool composition |
| `spec.digitalEntities` | Optional list of [BudyDigitalEntity (bde)](budyDigitalEntity%20(bde).md)s to create (each needs a `name`) |
| `spec.displayName` | Human-readable server name |

**Status phases:** `Pending` → `Provisioning` → `Ready` / `Degraded` / `Deleting`

Status also surfaces `userOrgNamespace`, `temporalNamespace`, `createdWorkerPools`, and `createdDigitalEntities`.

```yaml
apiVersion: platform.budy/v1alpha1
kind: BudyServer
metadata:
  name: budytestorg-server-1
  namespace: ob1-tf-eks-budy-platform-operator-1-ns-1
spec:
  userOrgShortName: budytestorg
  budyServerTypeRef:
    name: t1b-small
  displayName: budytestorg-t1b.small
  digitalEntities:
    - name: budytestorg-bde-1
  internalTags:
    env: production
    userOrgShortName: budytestorg
  externalTags:
    customerName: budytestorg
```

**Related:** [BudyServerType (bst)](budyServerType%20(bst).md), [BudyWorkerPool (bwp)](budyWorkerPool%20(bwp).md), [BudyDigitalEntity (bde)](budyDigitalEntity%20(bde).md)
