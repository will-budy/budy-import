---
name: add-app-to-platform-ui
description: Add an internal app (a console or admin web UI, or a Nexus service) to the platform portal (platform-ui-1) so staff can sign in once, pick it, and be handed a scoped STS session. Use when a new internal UI needs a tile in the portal, when choosing system or tenant scope and which Google groups may see it, when wiring the STS handoff (audience, redeemer allow-lists, client resources), or when a launch from the portal fails after an app was added. Covers the cross-repo checklist in order.
---

# Add an app to the platform UI

The platform UI (the portal) lists internal apps and launches them with an STS session. Read `v2/ref/platform-ui.md` first: it explains the
route contract, the groups, and the launch flow. This skill is the checklist for **one more app**. It does not build the app itself: for a
console use `scaffold-platform-console`; for the cluster repo use `scaffold-nexus-cluster-repo`; for the release flow use `manage-ob-application-cicd`.

The nainai console (`nainai-console-1`) is the worked example throughout. Copy its entries and change the names.

## Decide first

1. **What kind of app is it?**
   - **Web app, system scope** (a console that platform staff use): the route has `systemSession`. The session audience is the app's own origin.
   - **Nexus service** (Context-style, a service with a Nexus target): the route has `nexusTarget`. The audience is `urn:budy:nexus:<endpoint>:<service>`
     and the launch may be tenant scope (pick a tenant and a user) or platform scope.
   - **Auth Manager**: already in the portal; do not add another.
2. **Which groups see it?** Use the platform groups (`platform-dev-admin`, `-editor`, `-viewer` @orangebox.ai). Put the most sensitive apps on admin only.
   An app with no `routeGroups` is hidden from everyone.
3. **Which session boundaries does it accept?** `sessionBoundaries` of `viewer`, `editor`, `admin` (default `editor`, `admin`). A group's cap still applies:
   a viewer cannot launch a boundary above `viewer`.
4. **In system scope, does it need a system audience?** Only an app that acts on one audience's system-scope Context content does
   (Context itself). Set `needsAudience: false` in the route's `systemSession` or `nexusTarget.platformSession` for every other app,
   so the person picks only a platform. Leaving it out means `true`. The platform is always picked in system scope; nothing to set.
   A gateway behind the app reads the platform from the token (`{platform}` in its capability manifests), never from configuration.
   See `v2/ref/platforms.md`.
5. **The route id.** Lowercase, stable, and unique. It is the STS handoff `app_id` too. Never rename it later without changing the STS policy.

## Order of work

Do these in order; each step names the repository. Open one PR per repository and put the series order in each title. Steps 2 and 4 are both in the de-v2 gitops repository (`auth-cluster-1` and `frontend-cluster-1` values): make them one de-v2 PR (and its release-branch PRs), titled with the earlier step. Steps 3 and 4 are independent of each other.

### 1. The app: receive the handoff

The app serves `https://<host>/auth/callback?handoff=<code>`. It redeems the one-time code at the STS (`POST /v2/internal/handoffs/redeem`) with its own
projected service-account token, then sets its own session. For a console, `@budybot/console-kit` does this. Note the app's Kubernetes **namespace and
service account name**: the STS allow-list names them.

### 2. STS: `auth-service-1` values in de-v2 (`charts/apps/auth-cluster-1/values/`)

All four are needed; a missing one gives a different failure each time.

| Setting | Where | For the example |
| --- | --- | --- |
| Audience the STS may issue for | `sts-service.httpAudiences` (env or base) | `https://nainai.dev-1.orangebox.ai` (the origin) |
| The portal client may ask for it | the `platform-bff` client's `resources` (env) | `- https://nainai.dev-1.orangebox.ai` |
| The app's service account may redeem handoffs | `allowedRedeemerCallerSubs` (base) | `system:serviceaccount:ob1-tf-eks-de-v2-nainai-1-ns-1:console-1` |
| That account may redeem only this app and resource | `handoffRedeemerPolicies` | `appId: nainai-console-1`, `resources: [https://nainai.dev-1.orangebox.ai]` |

For a Nexus service, the audience is the `urn:budy:nexus:…` string. Add the same string to the client `resources` and, for tenant launches, to the Nexus-side policy.

### 3. Network policy: `k8s-security`

- The STS must accept the app's pods (`netpol/manifests/de-v2-auth-1-ns-1/ingress/sts-service.allow-platform-and-context.yaml`: add the app's namespace and `budybot.io/netpol` label).
- The app's own egress must allow the STS on 8080 (see `nainai-console-1.allow-required.yaml`).
- Add the app's `budybot.io/netpol` value to its namespace's `BudyNetpolIdentity` allow-list.
- After merging, check the `opa-policy` Application is Synced and Healthy.

### 4. The portal: de-v2 values (`charts/apps/frontend-cluster-1/values/`)

In `base.values.yaml`, under `platform-ui-1.routeDefaults`, say what the app is:

```yaml
    nainai-console-1:
      name: nainai console
      description: DT worker fleet, rollouts and templates
      routeGroups: [platform-dev-admin@orangebox.ai, platform-dev-editor@orangebox.ai]
      systemSession:
        sessionBoundaries: [viewer, editor, admin]
        needsAudience: false     # platform-wide console: pick a platform, no system audience
```

In each `env/*.values.yaml`, under `platform-ui-1.routes`, say where it is:

```yaml
    - id: nainai-console-1
      redirectUrl: https://nainai.dev-1.orangebox.ai/auth/callback
      systemSession:
        resource: https://nainai.dev-1.orangebox.ai   # must equal the origin of redirectUrl
```

Add the app's origin to `cors.allowedFormActionOrigins` in the same env file. For a Nexus service use `nexusTarget: {temporalNexusEndpoint, nexusService}`
in `routeDefaults` instead of `systemSession`. Remember this repository's rule: shared files also go to `release/stage` and `release/prod` through separate PRs.

### 5. Check before merging

- The route `id` is identical in the portal values, `handoffRedeemerPolicies.appId`, and anything the app checks.
- `systemSession.resource` equals the origin of `redirectUrl` exactly (scheme, host, no path, no trailing slash).
- `redirectUrl` is HTTPS.
- Render the chart with the layered values (`helm template` of `charts/platform-ui-1` with base then env) and read the `routes` in `config.json`.

## Verify after rollout

1. Sign in to the portal as a member of one of the groups: the app's tile shows. As a member of none of its groups, it does not.
2. Launch it at each boundary you allow. A boundary above your group's cap is refused with 403 before any STS call.
3. The app receives `?handoff=`, redeems it, and shows its page with the right scope.
4. A second person without the app's group cannot see the tile and cannot launch it by posting its route id (403).

## Failure map

| Symptom | Likely cause |
| --- | --- |
| Tile missing | Person not in a `routeGroups` group; route has no `redirectUrl` or an invalid `systemSession`; app only in some environments |
| "Could not obtain session access" on launch | The STS did not list the audience (`httpAudiences`) or the client `resources` |
| Launch bounces back, no handoff | PAR refused: boundary not in the route's `sessionBoundaries`, or the person lacks that relation in OpenFGA |
| App says handoff invalid | Its service account is not in `allowedRedeemerCallerSubs`, or `handoffRedeemerPolicies` has another `appId` or `resources` |
| App cannot reach the STS | Missing egress or STS ingress policy in `k8s-security` |

## Rules

- The portal adds no authorization of its own beyond groups and the boundary cap. The app and the STS enforce the rest; never rely on the tile being hidden.
- One route per app and environment. Do not reuse an id for a different app.
- Do not put secrets in the route values. Nothing in a route is secret.
- Keep the catalog in Git until the model-controlled registry (phase 2 in the reference) exists.
