# nainai-cluster-1: tenant provisioning

> **Status (20 November 2026):** proposal, revision 3, with the owner's answers applied. Phase 1 (observe and import
> every tenant, change nothing) is the next build. The detailed design (identity, the resource contract, data model, adoption, admission
> policy, phases) is in the repository:
> [`docs/design/tenant-provisioning.md`](https://github.com/Budybot/nainai-cluster-1_repo-1/blob/main/docs/design/tenant-provisioning.md).
> This page is the platform view: what nainai owns, and how every other cluster meets a tenant.

## In one paragraph

nainai is the one system that creates tenants. A tenant is a `UserOrg`. Under it are its digital teammates, and under
each teammate its Dynamo workers and their settings. The tenant resource is the single source of truth for what
exists. It is readable cluster-wide, so it carries nothing confidential. Every subsystem that serves a tenant reads the
resource, provisions itself, and reports its state and its own id into its own section of the resource. An admission
policy decides who may write each section. nainai owns the ids and names, and drives the lifecycle
(`proposed` → `active` → `deleting`) from the reports. Confidential data (people, contact details) stays in nainai's
database, served to each subsystem only as the slice it needs.

## Boundary

| Owns | Does not own |
|---|---|
| Creating and deleting tenants, and adding and removing teammates (entries in the tenant's `digitalTeammates`); the immutable ids (`userOrgId`, `digitalTeammateId`) and the names people see (`shortName`, teammate `name`) | Composing infrastructure from a tenant, including the `DigitalTeammate` composites (Crossplane and the XRD package) |
| The intent sections of `UserOrg` and `DigitalTeammate`, and the tenant lifecycle | Each subsystem's own provisioning and its section of the resource |
| The rules of the admission policy (who may create, delete, and write which section; the policy itself lives in k8s-security) | Deploying and updating Dynamo workers (`operator-1`, unchanged) |
| Confidential tenant data, in tables shaped for each destination system | Signup, payment and the commerce funnel (backend services), which ask nainai for a tenant |
| Tenant operations, and the console's admin view of tenants | Credits, subscriptions and billing ([Glassbox](../glassbox-1/info.md)) |

## How a subsystem meets a tenant

```text
nainai ── creates / updates ──▶ UserOrg, DigitalTeammate   (intent sections, lifecycle: proposed)
                                  │  read by every subsystem (watch, read-only)
          ┌───────────────────────┼─────────────────────────┬──────────────────────────┐
          ▼                       ▼                         ▼                          ▼
     Crossplane              Auth Manager              Directory                Glassbox, Karkhana, …
     composes infra          provisions the tenant     provisions the tenant's  provisions what it serves
                             and its identities        store and people
          │                       │                         │                          │
          └──── each reports {phase, id, observedGeneration} into its own section ─────┘
                                  ▼
nainai ── every required subsystem Ready ──▶ lifecycle: active
```

To serve tenants, a subsystem:

1. gets read access (`get`, `list`, `watch`) on `userorgs` and `digitalteammates`, and an admission rule that lets
   its identity write its own section only;
2. watches tenants and acts on `lifecycle`: provisions on `proposed` or `active`, deprovisions on `deleting`;
3. adds its finalizer (`<subsystem>.ob1.ai/tenant`) when it first keeps state for a tenant, and removes it when it has
   deprovisioned;
4. reports `phase`, its own `id` for the tenant (and each teammate) and the `observedGeneration` it acted on. Ids are
   not confidential;
5. if it needs confidential inputs (people, e-mails), asks nainai for its slice (`getSubsystemData`, authorized per
   subsystem). It never puts that data in the resource.

nainai lists the subsystems a tenant must wait for (`requiredSubsystems`, from the tenant's template). Adding a
subsystem to the platform needs no change in nainai beyond that list. Whether reports live under `status` or in a
`spec` section is decided by a spike before the first subsystem reports. Crossplane also writes the composite's status.

## Identity

| | Tenant | Teammate | Changes |
|---|---|---|---|
| id | `userOrgId`: `org` + 12 hex for new tenants; existing tenants keep their current name | `digitalTeammateId`: `mate` + 12 hex; existing teammates keep their key | never; at most 22 characters |
| name | `shortName`, 2 to 12, unique; the Mailgun subdomain and customer-facing places | `name` | through nainai |

Every system stores nainai's ids, never names.

## Platform scope

Every tenant belongs to one business platform (`budy-sl-platform-1`, senior living, or `budy-general-platform-1`). The console's
system view is on one of them, chosen in the portal, and the session token carries it.

- The platform comes from the token, never from a request. The operations authorize against `platform:{platform}`, so a tenant-scoped
  token is refused.
- Lists and reads are filtered to the caller's platform. A tenant of another platform is answered as "not found", so its existence does not
  leak.
- A tenant is only created in the platform you are in. The console shows it read-only and never offers a choice.
- A tenant's platform is the authorization link `managed_by_platform`, written when the tenant is provisioned, not a field of the resource.
  Today every tenant links to `budy-sl-platform-1`, because the composition takes one environment-wide platform. Creating a tenant on the
  general platform (phase 2) adds a platform field to the resource for the composition to use.

## Operations

Capabilities on nainai's `DeploymentServiceV1` (component `tenancy-1`), checked against the caller's platform with
the caller's platform session. The console calls with the person's token.

| Phase | Operations | Relation (session) |
|---|---|---|
| 1 | list and read tenants | `may_view_tenants_1` (viewer) |
| 1 | read a tenant's raw resources, exactly as the API server returns them | `may_view_tenant_resources_1` (admin) |
| 1 | reconcile now | `may_edit_tenants_1` (editor) |
| 2 | take over a tenant (ownership only) | `may_provision_tenants_1` (admin) |
| 2 | update a tenant; add or update a teammate; Dynamo worker settings | `may_edit_tenants_1` (editor) |
| 2 | create a tenant from a template; suspend; delete (with a grace period); remove a teammate | `may_provision_tenants_1` (admin) |

## Phases

| Phase | Delivers |
|---|---|
| 1 | nainai's tenant component and database; every tenant and teammate imported from the cluster into nainai, with **no change to the cluster**, all the way to production; the console's new Tenants view (with each tenant's raw resources); dt-manager-1 turned off; the GitOps application for tenants removed without deleting anything; creating and deleting tenants blocked for everyone but nainai |
| 2 | nainai takes over each tenant (ownership only, no spec change) and becomes the source of truth; write operations; the console's edit and New tenant pages; signup calls nainai |
| 3 | confidential and unused fields removed from the XRD |
| 4 | the lifecycle and subsystem reports; Auth Manager, the Directory, Glassbox and others read tenants and report |

## What changes for other clusters

| Cluster or repository | Change | Phase |
|---|---|---|
| dt-manager-1 | turned off in every environment (provisioner, reviewer, gateway, API); its Temporal namespace and endpoint stay until it is retired | 1 |
| budy-platform-crs, ArgoCD stacks | the Argo CD application that syncs tenants is removed without cascading, then the tenant files and their project | 1 |
| k8s-security | the admission policy: create and delete of `UserOrg` only by nainai (phase 1), updates by section (phase 2) | 1–2 |
| backend-services-cluster-1 | signup calls nainai instead of dt-manager-1 | 2 |
| database-service-cluster-1 | the tenant id and short-name reservation move to nainai; tenant data there is removed once nothing reads it | 2 |
| Crossplane XRD package | confidential and unused fields removed | 3 |
| auth cluster, context-cluster-1 (Directory), Glassbox, Karkhana | read tenants and report into their section | 4 |
