# Repository: budy-cloud-management

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/budy-cloud-management`

## Ownership

This repository owns AWS and Kubernetes infrastructure. For application scaffolding its critical responsibilities are the centralized `ecr-1` artifact repositories, workload-account access, application Kubernetes namespace, and any application-specific AWS resources.

## ECR and OCI Helm repositories

Path: `v2/stacks/shared-infra/ecr/v1`.

Each application cluster gets one container image repository in `ecr-1`. All subcomponents publish to that repository using component-prefixed immutable tags, for example `gateway-0.2.3-a1b2c3d` and `file-provider-0.4.1-a1b2c3d`.

Each application cluster also gets exactly one Helm ECR repository. It contains only the parent/umbrella application chart. Subcharts are bundled into the parent chart and do not receive their own ECR Helm repositories. `GLOBAL_ECR_HELM_REPO_V1` supplies the common OCI root/prefix to CI; the workflow appends the parent chart name, which addresses the application cluster's Helm repository.

Reference application: Context Cluster uses:

- image repo under `ob1-ecr-repo-v2/...context-cluster-1...`;
- one Helm ECR repository addressed by the OCI root plus parent chart name `context-cluster-1-repo-1`;
- GitHub source mapping to the application repository.

## Account model

| Account | AWS account ID | Role |
| --- | --- | --- |
| `dev-1` | `515407373958` | Active development workload environment |
| `dev-2` | `261949106194` | Scaffolded, not currently used |
| `stage-1` | `046228934736` | Active stage workload environment |
| `prod-2` | `753182551359` | Active production workload environment |
| `sand-3` | `164804461302` | Scaffolded sandbox-testing environment |
| `ecr-1` | `745404749629` | Shared ECR account for every application image and Helm chart repository |

There is no `stage-2`; any reference to it is an error and must not be added to account maps or promotion paths.

The `tf-v4_ecr-1.yml` workflow enables only `base/v1` and `shared-infra/ecr/v1`, which makes `ecr-1` the dedicated shared artifact account. The `tf-v4_sand-3.yml` workflow enables sandbox base/networking stacks, confirming that `sand-3` is not an artifact or promotion account.

## New application work

1. Add exactly one application container-image repository and one application Helm repository in the ECR stack.
2. Confirm the image repo, Helm repo/parent chart name, and component tag prefixes match application workflows and group GitOps `app.yaml`.
3. Add the dedicated Kubernetes namespace in the shared Kubernetes namespace stack.
4. Add direct AWS resources or instantiate existing modules for any queues, databases, buckets, or roles.
5. Create a custom module only when the abstraction has at least three uses.
6. Validate from the touched Terraform stack and review cross-account policies.

## Guardrails

- Do not create AWS resources from application source repositories.
- Do not put workload credentials in Terraform values/state when a Vault integration exists.
- Do not assume a scaffolded account is a promotion target.
- Every application cluster uses one image repository with component tag prefixes.
- Every application cluster has one Helm ECR repository containing only its parent chart; subcomponents do not get separate Helm repositories.
