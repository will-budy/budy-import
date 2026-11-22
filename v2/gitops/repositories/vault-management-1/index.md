# Repository: vault-management-1

Local path: `/Users/samaykohli/GitHub/abb-gitops-repos/vault-management-1`

## Ownership

This Terraform repository owns Vault-side configuration: policies, Kubernetes authentication roles, KV access, database credential roles, JWT/PKI integrations, and related secret-engine permissions. Application charts may template Kubernetes `VaultAuth`/VSO resources, while the corresponding role/mount/path values are supplied by group GitOps values and must agree with this Terraform configuration.

## Application stacks

The current Vault cluster has group-oriented stacks such as:

```text
v2/stacks/vault-cluster-2/
  de-v2-services/v1/
  design-services/v1/
  execution-services/v1/
  infra-services/v1/
```

The de-v2 stack uses `services.catalog.tf` as the service inventory. Modules derive Kubernetes auth and optional KV, PostgreSQL, Redis, or JWT policies. The Kubernetes auth role binds exact `service_account_name` and `namespace` values and aggregates only the selected policies.

## New application work

1. Identify each distinct workload/job identity and credential requirement.
2. Add catalog entries to the correct application-group stack.
3. Bind every Kubernetes auth role to the exact ServiceAccount and application namespace.
4. Enable only required engines/roles and minimum capabilities.
5. Separate migration/admin credentials from long-running worker credentials.
6. Export/reference stable role and secret-engine names for the matching `k8s-security` resources.
7. Run Terraform validation and inspect the plan for unintended policy expansion.

## Guardrails

- Never bind `*` service accounts or application namespaces.
- Do not combine unrelated applications into one policy.
- PostgreSQL application credentials use the Vault database engine and `VaultDynamicSecret`; do not substitute a static KV application password. Map each consumer only to its pre-created read, user, or admin database role.
- Changes in Vault and Kubernetes security must agree on role, audience, namespace, ServiceAccount, mount, and path.
