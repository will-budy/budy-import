# Platforms and platform sessions

|                  |                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Document**     | Platforms, platform sessions, the `platform` claim and system audiences                           |
| **Status**       | Design agreed with the owner on 2026-11-20; implementation in progress (see "Rollout")            |
| **Audience**     | Platform engineers changing STS, the portal, a cluster gateway or OpenFGA platform policy          |
| **Record**       | de-v2 gitops `docs/spikes/2026-11-19-platform-and-audience-claims.md` (the audit behind this page) |

A **platform** groups tenants for management. Only platform staff, who hold a platform role and assume into it, use one.
Customers and digital teammates work in **tenant** sessions and never see a platform. This page says:

- which platforms exist;
- how a platform session is issued and what its token carries;
- how a path declares that it needs a platform or a system audience;
- how a new platform is added so that it is managed exactly like an existing one.

## Platforms that exist

| Platform | What it is | Tenants under it | Who uses it |
| --- | --- | --- | --- |
| `budy-sl-platform-1` | Business platform: senior living | customer tenants, and the service tenants `dt-manager-1`, `dt-consulting-services-1`, `karkhana-cluster-1`, `pitcrew-cluster-1`, `communication-cluster-1` | staff, provisioning and reviewer services |
| `budy-general-platform-1` | Business platform: general (new) | new customer tenants | the same staff and services as `budy-sl-platform-1` |
| `budy` | Auth Manager's own platform: role administration across platforms (`role_management_platform`) and a few service grants | none | Auth Manager administrators |
| `system-platform-1` | Context operator's platform | none | `context-operator` |
| `janus-platform-1` | Janus workloads' platform (viewer only) | none | `janus-intake-1`, `janus-outbound-policy-1` |

The two business platforms are parallel and configured identically (see "Adding a business platform"). The other three are
infrastructure platforms; this page does not change them.

## Two meanings of "audience"

| | OAuth audience | System audience |
| --- | --- | --- |
| Claim | `aud` | `system_audience_key` |
| Value | the receiving service: `urn:budy:nexus:<endpoint>:<Service>`, an app origin, or `authz-manager-1` | an OpenFGA `audience`: `global`, `seniorliving`, `global-internal`, `global-early`, `authz-manager` |
| Set by | the portal route (`resource`) | the person, in system scope, when the route needs one |
| Required | always, by every receiver: it stops a token for one service being replayed at another | only by paths that act on system-scope Context content |

In the rest of this page, "audience" without a qualifier means the **system audience**.

An audience is a grouping of tenants, and it has two separate edges:

- **Members** (`audience#linked_tenant`): the tenants in it, set per tenant from the tenant's `audiences` input. A tenant
  may be on either platform, so an audience can span both: `global` holds tenants of both business platforms, while
  `seniorliving` holds only the senior-living tenants linked to it. Reading an audience's content
  (`can_view_audience_context`) follows membership.
- **Manager** (`audience#managed_by_platform`): exactly one platform, which administers membership
  (`can_manage_audience_membership`) and authors and publishes the audience's system-scope Context content
  (`context_scope#system_platform`). The STS refuses a system-scope session for an audience with no managing platform or
  more than one.

Today all five Context audiences are managed by `budy-sl-platform-1`, including `global`, whose members span both business
platforms. A system-scope Context session for `global` is therefore opened on `budy-sl-platform-1`; staff hold the same roles
on both platforms, so nothing is lost. `budy-general-platform-1` manages no audience until one of its own is created.

## The session token

Claim names are the standard snake_case names (formerly camelCase: `scopeType`, `scopeId`, `sessionBoundary`, `glassboxId`,
`systemAudienceKey`). See [STS token claims](sts-token-claims.md).

| Claim | Tenant session | Platform session |
| --- | --- | --- |
| `scope_type` | `tenant` | `platform` |
| `scope_id` | the tenant | the platform |
| `tenant` | the tenant | absent |
| `platform` | **absent** | the platform, equal to `scope_id` |
| `system_audience_key` | absent | present only when the route needed an audience and one was chosen |
| `session_boundary` | `viewer`, `editor` or `admin` | `viewer`, `editor` or `admin` |
| `glassbox_id` | the billing entity | absent |
| `aud` | the receiving service | the receiving service |

Rules every validator applies:

- A token with both `tenant` and `platform` is malformed.
- A token whose `platform` differs from `scope_id` is malformed.
- A platform token without a platform is malformed.
- `system_audience_key` on a tenant token is malformed.
- `platform` and `system_audience_key` are reserved: an exchange policy's receiver `claims` cannot set them. Only the STS sets
  them, from a decision it checked in OpenFGA.

During the rollout, a validator that finds no `platform` on a platform token reads `scope_id`. The STS issues one-hour
sessions, so this fallback is removed one release after every STS is issuing the claim.

Workload platform sessions, such as Janus intake-1 on `janus-platform-1` and dt-provisioner-1, carry `platform` like human
ones. The rule is "every platform-scope token", not "every human".

## Issuing a platform session

The portal sends a pushed authorization request with:

- `budy_scope_type=platform`
- `budy_scope_id=<platform>`
- `budy_system_audience_key=<audience>`, only when the route needs an audience.

Before it issues a code, the STS checks:

1. The person may assume the platform at the chosen boundary: `assumable_platform_<boundary>` on `platform:<id>`, from
   `ResolveSessionScope`. A platform role needs `internal_user` on the same platform; Auth Manager writes that marker with
   each platform membership.
2. The resource admits the platform: Nexus `can_call` through `operation#allowed_platform`.
3. If an audience was sent, the platform manages it: `managed_by_platform` on `audience:<key>`. The browser's pair is
   never trusted.

The STS repeats these checks at authorize, at code redemption and at handoff. With no audience, step 3 is skipped and the
token carries no `system_audience_key`; whether that is acceptable is the receiver's decision, not the STS's.

`POST /v2/system-session/query` answers the portal:

- With no `platformId`: `{platforms: [{id, sessionBoundaries}]}`, the platforms the person may assume for the resource.
  This is what fills the platform dropdown.
- With a `platformId` and no `audienceKey`: `{sessionBoundaries}` for that platform.
- With both: as before, the boundaries for that platform and audience.

## The portal: per-route needs

A route says what a launch in system scope needs. The flags sit in the route's session block in the platform-ui values,
next to the session boundaries:

```yaml
context:
  nexusTarget:
    temporalNexusEndpoint: ob1-nexus-context-cluster-1-endpoint-1
    nexusService: ContextServiceV2
    platformSession:
      sessionBoundaries: [viewer, editor, admin]
      needsAudience: true      # system-scope Context acts on one audience's content
janus-console-1:
  nexusTarget:
    platformSession:
      sessionBoundaries: [viewer, editor, admin]
      needsAudience: false     # Janus's system views are platform-wide
```

- **The platform is always picked in system scope.** The dropdown lists only the platforms the STS says the person can assume
  for that app, at any boundary. With one platform it is preselected. There is no flag for it: a platform session without
  a platform cannot exist.
- **An audience is picked only when `needsAudience: true`.** The audience dropdown then lists the audiences of the chosen
  platform, from the portal configuration `platforms: [{id, label, audiences: [{key, label}]}]`. It replaces the flat
  `systemAudiences` list, whose entries carried their platform.
- **Tenant scope is unchanged.** Pick a tenant and a user; no platform and no audience.
- The server re-checks both on launch; the browser's choice is a request, not a fact.
- A route without `needsAudience` keeps today's behaviour, which requires an audience, until its values say otherwise.
- Auth Manager is not affected: it always launches on `budy` with the `authz-manager` audience
  (`authzControlPlane.platformAudience`).

### What each portal app needs

| App | Scopes | System scope needs |
| --- | --- | --- |
| Context Cluster | tenant, system | platform **and audience** |
| Janus | tenant, system | platform |
| Pit Crew | system only | platform |
| GitJib | system only | platform |
| nainai console | system only | platform |
| DT Consulting, Karkhana, Events, Traces | tenant only | — |
| Auth Manager | fixed (`budy`, `authz-manager`) | — |
| Glass Box | to confirm when its route is set | — |

Only Context needs an audience.

## Gateways and components

The shared Go module `go/capability` gives a gateway the token's platform:

- `stsauth.Identity.Platform`;
- `dispatch.Command.Platform` and `dispatch.ComponentRequest.Platform`;
- `{platform}` in a capability's `authorize.object`.

```yaml
upsertTenant:
  authorize:
    relation: may_administer_gitjib_1
    object: platform:{platform}
```

- `{platform}` with a tenant token renders nothing, and the call is `PERMISSION_DENIED`, as `{tenant}` is with a platform
  token. A path that needs a platform therefore rejects a token without one.
- A capability for platform sessions names its object `platform:{platform}`, never a literal business platform, so
  one manifest is correct on every business platform. A literal platform id stays legal for a fixed grant checked with a
  tenant session: events and nainai check `platform:budy#may_register_triggers` and `#may_view_worker_status` that way.
- `go/authz` `GatewayAuthorizer` states the live session on the **token's** platform. It denies, without asking OpenFGA, a
  platform-scope check on an object naming another platform. So a platform session on one platform never satisfies a
  check on another, even when the person holds a role on both.

A component that checks in its activity reads `ComponentRequest.Platform`; it never takes a platform from a payload.

A component that works across one platform's tenants keeps a staff session to that platform. `go/authz` gives it:

- **One tenant:** check `tenant:<id>#in_platform_session` with the caller's session on its own platform
  (`CheckRequest.WithPlatformSession`). It holds only for tenants that platform manages.
- **A list:** `authz.PlatformTenants(ctx, checker, platform, user, boundary)` returns that platform's tenants. A truncated
  answer is a partial view, never the whole platform.

GitJib admin-1 is the reference. A call that names a tenant is refused unless the tenant is on the caller's platform. Tenant
lists, the all-tenant drift audit and the drift report show only that platform's tenants. Settings shared by every tenant
(the public package allow-list, the admin-token check) are open to a GitJib admin of either platform. Tenant users are not
affected: they reach GitLab through token-broker-1 with a tenant session. The
TypeScript `console-kit` exposes the same as `principal.platform`. Receivers built on auth-service `shared/contract`
(`nexusauth`) read `VerifiedNexusSessionV1.Platform`.

## Adding a business platform

A new business platform is managed by everyone who manages `budy-sl-platform-1`, with the same roles. No model change is
needed: the platform is entities and tuples in `authz-config_gitops_repo-1`, shared by every environment.

1. **Declare it.** In `entities/services/entities.json` `tenants`, add
   `{"id": "<platform>", "type": "platform", "version": "v2"}`. Do not edit `entities/profiles/*/authz-bootstrap.json`:
   it is immutable after first apply.
2. **Role administration.** In `entities/services/service-bootstrap.yaml`, add
   `platform:budy role_management_platform platform:<platform>`. Auth Manager administrators can then grant roles on it.
3. **Service admissions.** Copy every `allowed_platform` tuple of `budy-sl-platform-1`:
   - `service-bootstrap.yaml`, `shared-policy.yaml`;
   - the dev-only `entities/profiles/dev/profile-provisioning.yaml`.

   Also copy `may_write_directories` for the provisioner.
4. **Service roles.** In `entities.json` `memberships`, copy each service user's roles on `budy-sl-platform-1`:
   - dt-provisioner-1: `platform-admin`, `tenant-provisioner`, `system-context-author`;
   - dt-reviewer-1: `system-context-reviewer`;
   - backend-1: `tenant-provisioner`.

   Auth Manager writes a service user's `internal_user` marker on every platform where it holds a platform role, so
   these roles take effect. Until 2026-11 the marker was written on the service's home platform only.
5. **Staff roles.** Two ways, by how much the role can do:
   - **`platform-admin`: GitOps.** authz-config `entities/profiles/<env>/staff-platform-roles.json` lists each environment's
     staff admins per platform (today Jae and Samay on both business platforms). Add the new platform's lines there. The file
     sets `releaseRemovedMemberships`, so removing a line revokes the role. It has no UI assigners on purpose.
   - **`platform-maintainer`, `platform-support`, `platform-viewer`: the Auth Manager UI.** Open Roles and pick the platform as
     the target; a second authz admin approves, and nobody can assign themselves. The API equivalent is
     `PUT /v1/tenants/<platform>/members/<user>/roles/<role>`.

   Auth Manager writes each person's `internal_user` marker on the platform with the membership. In GitJib, `platform-admin`
   opens the admin console (`may_administer_gitjib_1`, admin session); `platform-maintainer` manages the public package
   allow-list (`may_administer_gitjib_packages_1`, editor session); `platform-viewer` sees the read-only views. In Janus,
   `platform-maintainer` and above manage connection types (`may_administer_janus_connection_types_1`, editor session).
6. **Audiences.** Membership: a customer created without `audiences` gets its platform's default from the `customer`
   tenant type (budy-platform-crs `customer@v7`: `global` and `seniorliving` under senior living, `global` only under
   general). Platform records cannot change after creation, so the default lives in the type: a further platform needs a
   new `customer` version. Management, optional: an audience managed by the new platform, for Context system scope
   there, is `platform:<platform> managed_by_platform audience:<key>`, plus the portal's `platforms[].audiences`. An
   existing audience keeps its one manager.
7. **Portal.** Add the platform's label (and audiences) to the platform-ui `platforms` list.

`models/business-platforms-test.store.fga.yaml` checks:

- the two business platforms grant the same things;
- a session on one authorizes nothing on the other;
- a role on the other does not help.

## Tenants under a platform

A tenant belongs to the platform at the top of its parent chain: Auth Manager writes `managed_by_platform` from it, and
creating the tenant needs `can_create_tenants` on that platform.

An Auth Manager administrator can create a customer tenant under either platform in Auth Manager by choosing the platform as
its parent. dt-provisioner-1 (`provisionTenantProfileV1`) creates customer tenants under `budy-sl-platform-1`; creating them
under the caller's platform is a dt-manager change that is not released, and dt-provisioner-1 is due to move to nainai.

A customer created without `audiences` joins its platform's default audiences (`customer@v7`): `global` and `seniorliving`
under senior living, `global` only under general. Audiences given at creation are used as given. Auth Manager stores the
resolved list on the tenant, so it does not change if a later version defaults differently.

## Rollout

Claim names in this table are the ones at the time of each step; they are now the snake_case names (`scope_id`, ...).

| Step | Repository | Change | Backward compatible because |
| --- | --- | --- | --- |
| 1 | authz-config | declare and mirror `budy-general-platform-1` | inert until roles are granted |
| 2 | common-modules | `platform` in Go and TS, `{platform}`, authorizer fix | falls back to `scopeId` |
| 3 | auth-service | STS `platform` claim, optional audience, platform listing; `nexusauth`; Auth Manager service marker | an audience is still accepted and checked |
| 4 | dt-manager | tenant parent from the caller's platform (optional; dt-provisioner-1 moves to nainai) | `budy-sl-platform-1` callers see no change |
| 5 | budy-platform-crs | `customer@v7`: default audiences per platform | existing tenants keep their stored audiences |
| 6 | gitjib (done), janus, context | library bumps; `platform:{platform}`; tenants of the caller's platform | a token without `platform` falls back to `scopeId` |
| 7 | frontend-cluster | platform picker, `needsAudience` | a route without the flag behaves as before |
| 8 | de-v2 gitops | route flags, `platforms` list, chart and library versions | per environment, dev first |
| 9 | Auth Manager (data) | grant staff roles on `budy-general-platform-1` | — |
| 10 | common-modules, auth-service | remove the `scopeId` fallback | one release after step 3 everywhere |

## Related

- [Platform UI](platform-ui.md)
- [Component Authorization Module Standard](../gitops/authorization-module-standard.md)
- auth-service-1 `docs/v2-token-claims-contract.md`
- authz-config `entities/README.md`
