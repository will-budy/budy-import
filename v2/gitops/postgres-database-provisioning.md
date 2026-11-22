# PostgreSQL Database Provisioning

Application PostgreSQL databases are provisioned through the shared PostgreSQL
control plane, not as application Terraform database resources. The same
database/role SQL must work against the dev/stage CloudNativePG service and the
production RDS service.

## Environment model

| Environment | PostgreSQL host | Provisioning contract |
| --- | --- | --- |
| dev | CloudNativePG | Shared bootstrap and grant jobs connect with the cluster superuser |
| stage | CloudNativePG | Same job/configuration contract as dev |
| prod | RDS | The same SQL jobs run using the RDS connection, IRSA, Secrets Manager runtime configuration, and RDS CA verification |

Do not create a CNPG `Database` resource or a database-specific AWS resource
for an application. That would couple the application to only one runtime.

## Standard databases

The standard three-role databases are listed, one per line, in the inventory ConfigMap
`manifests/postgres-cluster-1/jobs/standard-db-inventory-1.configmap.yaml` (argocd-eks-stack,
`v2/apps/platform/dbsrv/postgres-objs`). The apply Job loops over that list: it creates the
`<database>-admin-role`, `-user-role` and `-read-role` group roles, grants them to the Vault admin user
`WITH ADMIN OPTION`, and applies the standard schema and default privileges (objects the admin role
creates are read-write for the user role and read-only for the read role). An application then needs only
its Vault roles (below) and its own migration Job, run as the admin role.

| Database | Owner |
| --- | --- |
| `ob1-context-file-provider-db-1` | context-cluster-1 (file provider) |
| `ob1-context-store-2-db-1` | context-cluster-1 (context store) |
| `ob1-authz-manager-db-1` | auth cluster (authz-manager-1) |
| `ob1-authz-db-1` | auth cluster (OpenFGA) |
| `ob1-studio-artifacts-db-1` | studio-services-cluster-1 |
| `ob1-pitcrew-db-1` | pitcrew-cluster-1 |
| `ob1-dt-consulting-services-db-1` | dt-consulting-services-1 |
| `ob1-mission-registry-db-1` | dt-consulting-services-1 `mission-registry-1` (the Mission registry; its own database so it can move to another cluster) |
| `ob1-gitjib-db-1` | gitjib-cluster-1 |
| `ob1-gitjib-gitlab-db-1` | gitjib-cluster-1 (GitLab) |
| `ob1-karkhana-db-1` | karkhana-cluster-1 and the sandbox operator (one schema per service, see [Shared database with per-schema roles](#shared-database-with-per-schema-roles)) |
| `ob1-janus-db-1` | janus-cluster-1 |
| `ob1-dt-manager-db-1` | dt-manager-1 |
| `ob1-nainai-db-1` | nainai-cluster-1 |

Hosts: `postgres-cluster-1-rw.ob1-tf-eks-postgres-ns-1.svc.cluster.local` in dev and stage
(CloudNativePG); the RDS endpoint in prod (set per environment in GitOps values).

## Add one application database

Work in `abb-gitops-repos/argocd-eks-stack/v2/apps/platform/dbsrv/postgres-objs`. A new application
database is a **standard three-role database**:

1. Add the database name, on its own line, to `databases.list` in
   `manifests/postgres-cluster-1/jobs/standard-db-inventory-1.configmap.yaml`. This is the only
   required change: the bootstrap CronJob creates every missing inventory database, and the apply Job
   creates the three `NOLOGIN` group roles, grants them to `ob1_pgo_postgres_vault_admin_user`
   `WITH ADMIN OPTION` and applies `standard-db-grants-1` (admin owns and creates, user reads and
   writes, read selects).
2. Only if the database needs extensions or other one-time setup: add a `<database>.sql` entry to
   `postgres-db-bootstrap-db-run-1.configmap.yaml`; the bootstrap CronJob runs it after creating the
   database. Only if it needs privileges beyond the standard ones: add them to
   `standard-db-custom-grants-1.configmap.yaml`. Example: `ob1-pitcrew-db-1.sql` creates the `meta` and
   `content` schemas owned by the admin role (the migration role has no `CREATE` on the database, so
   it cannot create them), gives the user role DML on both, gives the read role `SELECT` on `meta`
   only, and sets default privileges `FOR ROLE` the admin so later migrations stay covered. That is
   how a console reads non-confidential data from the database while customer content stays
   unreadable to it.
3. Run the bootstrap once through the approved operational workflow (the CronJob is intentionally
   suspended; create a one-off Job from it). The apply Job reruns on its own when the watched
   ConfigMaps change.
4. Add the application's Vault roles (next section) and give the application a migration Job that runs
   as the admin role.

Databases created before the inventory existed (for example `ob1-temporal-db`, `ob1-billingServices-db`)
are still wired by hand in `postgres-db-bootstrap-db-run-1`, `postgres-db-grants-1`, per-application
`<application>-db-grants-1` ConfigMaps and `vault-postgres-db-grants-2`. Do not add new databases that way.

## Shared database with per-schema roles

Use this when several services share one database but must not reach each other's data. The standard three roles are database-wide, so this pattern gives each service its own schema and its own roles instead. Worked example: `ob1-karkhana-db-1`, schema `sandbox` (karkhana-cluster-1 `sandbox-manager-1` and the sandbox operator `sandbox-operator-1`).

The database is a standard inventory database (above), so it also gets the three standard roles; the standard user and read roles are deliberately given nothing in the service schema.

| Role (`<db>` = `ob1-karkhana-db-1`) | Used by | Rights in schema `sandbox` |
| --- | --- | --- |
| `<db>-admin-role` | the migration Job (Vault static credentials) | owns the schema and what the migration creates |
| `<db>-sandbox-rw-role` | the manager, `sandbox-manager-1` (Vault dynamic credentials) | `USAGE`; default privileges for DML and sequences, which the migration then narrows to exact tables and columns |
| `<db>-sandbox-operator-rw-role` | the operator, `sandbox-operator-1` (Vault dynamic credentials) | `USAGE` only; no default table privileges; the migration grants exact tables and columns |
| `<db>-sandbox-ro-role` | reporting and the SQL exporter | `USAGE` and `SELECT` (default privilege for new tables); no Vault role is defined for it in `services.catalog.tf` |

Who does what:

1. **Platform job** (argocd-eks-stack, `standard-db-custom-grants-1.configmap.yaml`, key `ob1-karkhana-db-1.sql`, run by the apply Job after the standard grants). It creates the three service roles as `NOLOGIN` group roles if missing, grants each `CONNECT` on the database and grants it to the Vault admin user `WITH ADMIN OPTION`. As the admin role it creates schema `sandbox` (`IF NOT EXISTS`, owned by the admin role), revokes `PUBLIC`, grants `USAGE` to the three roles, and sets the manager and read grants and the admin role's default privileges. Role names are built from `current_database()`. Re-running is safe.
2. **Owning service migration** (karkhana-cluster-1, `components/sandbox-manager-1/internal/store/migrations/00001_init.sql`). It runs as the admin role. It first fails with an explicit error if `<db>-sandbox-rw-role` or `<db>-sandbox-operator-rw-role` does not exist ("apply the platform database grants ... before this migration"). It then creates the tables, revokes everything from the manager and operator roles and grants exactly the tables, columns and sequences each needs (for example the operator can update only named columns of the command and file tables, and nobody gets `DELETE`). The migration does not check the read role.
3. **Vault** (vault-gitops, `v2/stacks/vault-cluster-2/de-v2-services/v1/services.catalog.tf`). `pg.precreated_roles` names the one role per service: `readwrite = ["ob1-karkhana-db-1-sandbox-rw-role"]` for `karkhana_cluster_1_sandbox_manager_1`, `readwrite = ["ob1-karkhana-db-1-sandbox-operator-rw-role"]` for `sandbox_operator_1`. The migration Job uses `static_pg` with `ob1-karkhana-db-1-admin-role`. A service never gets the database's standard user role, so it cannot reach another schema.

A new service in the same database adds its own schema and roles to the same `<database>.sql` block, never a grant on another service's schema, and its own `precreated_roles` entry. The platform job must have run before the service's migration, which fails otherwise.

## Vault database credentials

Work in `abb-gitops-repos/vault-management-1/v2/stacks/vault-cluster-2/<group>/v1`.

The shared `pg_db` module creates a `vault_database_secret_backend_role` and
the matching read policy under `db-eng-1/creds/<role>`. Add the application's
service entry to `services.catalog.tf` with a `pg.precreated_roles` map:

```hcl
pg = {
  ttl_seconds = local.defaults.db_default_ttl_seconds
  precreated_roles = {
    readonly  = ["<database>-read-role"]
    readwrite = ["<database>-user-role"]
    admin     = ["<database>-admin-role"]
  }
}
```

The existing `pg.module.tf` fan-out instantiates one `pg_db` module for every
requested suffix and attaches its policy to the exact Kubernetes-auth role.
Use that route rather than hand-writing a duplicate Vault database role or
policy. Application database users, including any explicitly static or dynamic
consumer, are administered through the Vault database engine; never place a
database password in application values or a ConfigMap.

The application chart renders generic `VaultDynamicSecret` resources. GitOps
values provide the non-secret `mount: db-eng-1`, credential path, VaultAuth
reference, destination Secret name, and renewal behavior. Give a migration Job
its own admin credential only when it genuinely needs schema ownership; runtime
workers should receive read, read/write, or admin membership according to their
actual need.

## Security and validation

- Add database egress only for the approved PostgreSQL endpoint/port in
  `k8s-security`; do not make database egress a namespace baseline.
- Keep application-facing database host, TLS, and destination-Secret values in
  GitOps profile values, not in application code or secret payloads.
- Validate the full PostgreSQL Kustomize aggregate and the production profile
  overlays after editing the shared job.
- Validate the affected Vault stack and confirm the generated dynamic role
  grants only the intended pre-created group role.
- In dev, verify bootstrap, grant reconciliation, `VaultDynamicSecret`
  readiness, connection as each privilege level, denied access outside the
  intended role, and credential rotation. Verify the equivalent flow in stage
  and the RDS/TLS path in prod before declaring the application ready.

## Terraform module rule

Prefer the existing catalog/module fan-out or direct resources in a
purpose-named `.tf` file. Introduce a new custom module only when there are at
least three present or planned uses. When three existing direct implementations
are about to gain a fourth, introduce the shared module with Terraform `moved`
blocks so resources are not recreated.
