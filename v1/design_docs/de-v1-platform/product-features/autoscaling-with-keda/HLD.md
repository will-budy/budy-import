
|              |                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Document** | HLD: autoscaling path with KEDA                                                                                                            |
| **Version**  | 0.0.1                                                                                                                                      |
| Status       | Living Document                                                                                                                            |
| Audience     | Internal Team                                                                                                                              |
| Purpose      | Defines the high level design of the autoscaling path. Heavier on the budy operator but also stipulates behavior of the various components |
| Last Updated | April 2026                                                                                                                                 |
  

---

  

## 1. Overview & Problem Statement

### Current State

Budy workers run as K8s deployments for temporal task queues. Replica management is driven by the mode - replica or autoscaling. What we intend to do is complete the implementation for autoscaling mode such that it responds to loading on the task queue. We currently have 2 modes:

* Single workers - host a single workflow automation. The deployments are created in the publish path and the scaling
for these happens in the execute path. Autoscaling however, isn't implemented

* Shared workers - hosts multiple workflow automations. The deployments + scaling happens in the publish path. Autoscaling isn't implemented here again.

It becomes immmediately evident that scaling is static - especially for shared workers. Single workers do scale in on worker slots being full. But again, we should have a better way to reclaim resources. Especially since such scaling is within a worker pool AND within a tenant. It does not help when we know that our karpenter locates all our worker pools and tenants in a set of node pools that are not aware of either of these 2 concepts. So if there's node pressure due to a tenant A, we don't say that hey tenant B is barely using anything and therefore some of its workers can be scaled back to reduce the pressure. Also remember usage is asymmetric so not all days are equally utilized by all tenants.

### Goal

For workers with `spec.autoscaling` configured, we'll have KEDA ScaledObjects driven by both Task queue depth (0->1) and schedule-to-start latency (1->N). We have the following objectives:
* Workers should scale to 0 when queue is empty for single workers. For shared the minimum replicas we'll impose is 1 so only 1->N path applies
* Workers should scale out when queue depth becomes 1 (0->1 motion; not applicable for shared)
* Workers should scale even more when latency violates our thresholds (1->N)
* We have global feature flag for whether autoscaling feature itself is enabled.
* Once we can confirm that the feature is working - we should be able to cleanly delete the old paths

### Non-Goals
* The feature flag is unidirectional. We'll simplify our life this way. By basically ensuring that we fix issues in dev and don't escalate till everything is stable we'll push a clean feature into prod. Also we won't block the pipeline for any services because till things are stable the feature flags are set to off in their environments. And a unidirectional gate will ensure we don't have to clean up k8s objects manually (in our case keda)

## 2. Architecture

### Components:

1. BudyWorkerReconciler -> If feature flag is set, then we'll create a ScaledObject CR with the deployment and NEVER write the replicas. 

2. KEDA ScaledObject -> This object manages the deployment and has triggers based on both the temporal scaler and the prometheus schedule to start latency metrics. 

3. Deployment -> This won't have the replicas in autoscaling mode.


### Key Design Decisions

- BudyWorkerReconciler owns ALL ScaledObjects

- When the KEDA path is active, replicas is never written to the Deployment manifest

## 3. Scaling Behavior

Every budy worker in autoscaling mode gets a scaledObject targetting its deployment. We'll have global defaults for activation target queue size, polling interval, cooldown period, target queue size. The specifics like min and max replica counts, task queue, temporal namespace will come from the budy worker cr. Remember that single workers have task queue as workflow version id and shared have task queue as shared worker pool name itself.


### Trigger
The keda scaled object trigger is a max of 2 triggers:

1. Temporal scaler - for activation. Activation target queue size will be 1 and we'll set target queue size to a large value say 50 or 100. This way, we can constrain it to act purely for 0-1 scaling. Again only applicable for single worker.
2. Prometheus latency monitor - for 1-N scaling. We can get the P99 latency of the schedule-to-start-latency of temporal queue. Then we say that don't scale till p99 breaches a certain latency threshold.

### Behavior

* Queue empty - We should remain at 0 replicas for single and 1 worker for shared
* Work arrives - Scale to 1 using queue depth; No operation for shared
* Queue grows but latency isn't breaches - The worker holds at 1
* Latency breached - Worker scales up
* Queue drains but latency still above threshold - Worker holds
* Queue drains more and latency reduces - Scales down after cooldown period

---

## 4. Reconciliation

BudyWorkerReconciler basically branches in its reconcilation loop
* If autoscaling and keda autoscaling feature flag is set, then we basically apply deployment with no replicas as well as reconcile the scaledObject
* Else we basically do a no-op on replicas for single (supervisor does this) and set replicas from pool config for shared

### Migration

Once we're sure that the environments are stable, we can remove the feature flag by simply removing it from the values file and also removing it from the Reconcile check. Autoscaling will be the only check required for the keda scaled object path

## 5. Configuration

### Feature Flags
Just 1 - kedaAutoscalingEnabled: false

### Tuning Parameters
All set in the values file and applicable across all scaled objects

* Polling interval
* Cooldown period
* Target Queue Size (set to a large value for the behavior we described)
* Activation Target Queue Size (1)
* Queue Types (workflow)
* Latency Threshold
* Latency Activation Threshold

Worker CRD Fields

We will introduce `temporalNamespace` into the worker CRD so that it can be used for helping us construct the KEDA scaled object for temporal scaler trigger

## 6. Dependencies

We're dependent on creating the separate prometheus we discussed about yesterday morning. My thought is that I get the 0 to 1 scaling behavior working. Adding the next trigger is getting the prometheus stable on the env, observing latencies to figure out what should the thresholds be (maybe pick like p99 latency or something).
---
## Supervisor Services
I would recommend changing supervisor so that both triggered and scheduled paths are successfully tested. 

### Current State

We throw a not implemented error for autoscaling type of workflow automations.

### Approach
There are 2 conditions we'll check in the execute consultant workflow - if the feature flag is turned on AND the mode is autoscaling. If yes we'll create another activity that basically just converts reservation to worker without participating at all in the actual scaling operation.

### Feature Flag
We'll introduce a feature flag `kedaAutoscalingEnabled` which is set to false in the default values under an `experimental` key. In dev however, we'll turn this on.

### Wiring it in

So what will happen is that we'll mount the configmap for experimental with the feature flag in our supervisor. Then
* Wire into worker by adding into the workflowEnv object. That way our workflows can directly access this feature flag value
* Then after the logic for when we found a slot, started a workflow in the namespace, we will branch off. The regular branch which handles the `replica` mode will continue to to call the scale deployment in namespace. The other branch which is when the kedaAutoscalingEnabled is true AND mode is autoscaling will call a convert reservation to worker activity that only does the redis operations. 

This is a clean approach since the way to remove the feature flag is simply removing from experimental and removing from workflowEnv. And removing in the conditional just making the conditional on AUTOSCALING

The new activity can be served by supervisor itself just like the other scaling activity.
