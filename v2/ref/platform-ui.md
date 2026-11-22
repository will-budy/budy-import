# Platform UI

|                  |                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Document**     | Platform UI reference                                                                                  |
| **Component**    | `platform-ui-1` in `frontend-cluster-1` (source: `apps/platform-ui`)                                  |
| **Status**       | Phase 1 (moved from `platform-base-ui`, same behavior). Phase 2 (simplify and refactor) is not started. |
| **Audience**     | Platform engineers adding an internal UI, and on-call operators                                       |
| **Last Updated** | October 2026                                                                                           |

The platform UI (the portal) is the one entry point to the platform's **internal** web UIs. A person signs in once, picks an app
and a scope, and the portal obtains the right STS session and hands them over to that app. It is for platform staff only; no tenant
or customer reaches it. To add an app, follow the skill `add-app-to-platform-ui`.

!!! note "Today there is one user"
    At the time of the move, the author is the only user. That is why the move from `platform-base-ui` was a hard cutover with no
    period where both portals ran, and why all environments were enabled together. Do not read this as a pattern for a portal with users.

## What it does

1. **Signs the person in** through the shared Dex (Google). Dex returns the person's Google groups.
2. **Decides what they can see** from those groups: which apps are listed, and the highest session boundary they may ask for.
3. **Exchanges identity for a session.** It trades the Dex ID token at the STS for an actor token, then requests a target-bound session
   (system or tenant scope, with a boundary) through a pushed authorization request, and hands the result to the app. In system scope
   the person picks the platform, from the platforms they can assume, and a system audience only for an app whose route needs one
   (Context). See [Platforms and platform sessions](platforms.md).

It stores nothing: there is no database and no user list. State is a sealed cookie and the STS and OpenFGA are the sources of truth.

## Architecture

```text
Browser ──► ALB (no OIDC on this host) ──► ui-gateway-1 ──► platform-ui-1 (frontend namespace)
   │                                                             │  in-cluster, mTLS
   │ 1. /login                                                   ├──► Dex :5556          token + signing keys
   └────────────────► Dex (public, Google)                       ├──► sts-service :8080  exchange, PAR, handoff, queries
                                                                 └──► authz-control-plane-1 :8080   Auth Manager proxy
Launch: portal ──► STS (actor token, PAR) ──► STS authorize ──► portal /oauth/callback ──► STS handoff ──► app /auth/callback?handoff=…
```

| Piece | Where |
| --- | --- |
| App, image, chart, CI | `frontend-cluster-1`, `apps/platform-ui`, `charts/platform-ui-1`, catalog entry `@budy/platform-ui` |
| Values (access groups, apps, hostnames) | de-v2 gitops, `charts/apps/frontend-cluster-1/values/{base,env/*}` (`platform-ui-1:`) |
| Host and gateway | `argocd-eks-stack`: ALB ingress for the portal host on `ui-gateway-1`; Dex client `platform-ui-1` in `dex-1` |
| STS side | `auth-service-1` (Dex subject-token verifier); de-v2 `auth-cluster-1` values (`oidcBroker`, `externalAudiences`, handoff allow-lists, client `resources`) |
| Network policy and secrets sync | `k8s-security` (frontend namespace policies, Dex namespace ingress, VSO objects) |
| Vault | `vault-management-1`, `de-v2-services` stack, `platform_ui_1` role; Dex client secret path under the Dex namespace |

## Sign-in and access

- **Sign-in:** authorization code with PKCE against `https://dex.<env>.orangebox.ai`, scopes `openid email profile groups federated:id`. The last one is required: Dex only adds `federated_claims` (the connector and the Google user ID) to the ID token when it is requested, and without it the portal refuses the sign-in as not from the Google connector. The portal
  verifies the ID token (RS256 signature from Dex's keys, issuer, one audience, expiry, nonce, verified email, Google connector) and keeps it
  in a sealed, host-only session cookie (`__Host-platform-session`, `HttpOnly`, `Secure`, `SameSite=Lax`). The browser's JavaScript never
  receives the token. The session lasts as long as the ID token (one hour), at most eight; a new sign-in is silent while the Google session lives.
- **Identity:** the person is the Google user ID (`federated_claims.user_id`), not Dex's own `sub`. The STS reports it as `google:<id>`, the same
  identity the person had behind the old ALB gate, so OpenFGA relationships did not change.
- **Access is by Google group.** The same three groups used by Grafana, Argo CD and pgAdmin:

| Group | Highest session boundary | Typical apps |
| --- | --- | --- |
| `platform-dev-admin@orangebox.ai` | `admin` | everything, including Auth Manager |
| `platform-dev-editor@orangebox.ai` | `editor` | consoles and Context |
| `platform-dev-viewer@orangebox.ai` | `viewer` | read-only apps |

  A person in none of the listed groups sees "Access unavailable". `access.groups` in the values lists the groups and their boundary caps. A group not listed
  there grants nothing, even if Dex returns it.

- **The cap is an extra layer.** The STS and OpenFGA still decide what a session may do. The portal refuses a launch whose boundary exceeds the cap
  before it calls the STS.

## The app catalog (route contract)

Each launchable app is a **route** in the values. What an app *is* (name, target, which groups see it) is in `routeDefaults`, keyed by route id and
set once in `base`. Where it lives in this environment (URLs) is in `routes` in `env/*`. The chart merges them (environment wins).

| Field | Meaning |
| --- | --- |
| `id` | Route id. It is also the STS handoff `app_id`, so it must match the handoff redeemer policy. |
| `name`, `description` | Shown in the picker. |
| `redirectUrl` | The app's callback (`https://…/auth/callback`) that receives `?handoff=<code>`. HTTPS only. |
| `routeGroups` | Google groups that see this app. No groups means the app is hidden. |
| `nexusTarget` | `temporalNexusEndpoint` and `nexusService`: a Nexus service. The session audience is `urn:budy:nexus:<endpoint>:<service>`. Tenant or platform scope. |
| `systemSession` | A plain web app launched in system scope. `resource` must equal the origin of `redirectUrl`; `sessionBoundaries` (default `editor`, `admin`) are the boundaries it accepts. |
| `resource: authz-manager-1` | The Auth Manager, served by the portal itself at `/authz`. |
| `…platformSession.needsAudience`, `systemSession.needsAudience` | System scope only. `true`: the person also picks a system audience of the chosen platform, and the token carries it. `false`: no audience. Absent: `true`, the old behaviour. Only Context needs one. |

In system scope the platform is always picked; the dropdown lists the platforms the STS says the person can assume for that app. The labels and
each platform's audiences come from `platforms: [{id, label, audiences: [{key, label}]}]` in the values.

A route with neither `nexusTarget` nor `systemSession` (nor the Auth Manager resource) cannot be launched. A malformed `systemSession` is ignored on
purpose, which leaves the route unlaunchable rather than launchable with wrong values.

## Where each decision lives

| Question | Answer lives in |
| --- | --- |
| Who may use the portal, and how high | Google group membership, and `access.groups` in the values |
| Which apps appear | `routeDefaults` and `routes`, filtered by `routeGroups` |
| What a launched session may do | STS policy and OpenFGA, per the claims contract (`auth-service-1`, `docs/v2-token-claims-contract.md`) |
| Which apps may receive a handoff | STS `handoffRedeemerPolicies` and `allowedRedeemerCallerSubs` |

The catalog is GitOps-controlled today (reviewed, versioned, one place). Visibility already follows groups, which are controlled outside Git. Moving
more of it to a model-controlled registry is a phase 2 question (below).

## Operating it

- **Health:** `GET /healthz` on the pod. Logs are JSON; set `logging.level` to `debug` for OAuth stages and request ids. Debug logs never contain
  cookies, tokens, secrets or raw JWTs, and identify subjects by a short one-way fingerprint.
- **Secrets** (Vault, synced by VSO, never in Git): the STS OAuth client file (`platform-bff` client) and the Dex client secret `platform-ui-1`. Rotating
  either reloads the pods (Reloader). Rotating the Dex secret signs everyone out, because the session cookie is sealed with a key derived from it.
- **A person cannot sign in:** check the person is in one of the three groups; if the log has `dex.login.failed` with "no federated_claims", the `federated:id` scope was not requested; `dex.login.rejected` carries the `error` Dex sent back; check Dex logs for the group lookup (the directory service account);
  check `/login/callback` returns 502 (token verification failed: look for `dex.login.failed` in the portal log).
- **Launch fails with 502 or "not trusted":** the STS rejected the exchange. Check that `platform-ui-1` is in the OAuth client's `externalAudiences`
  and that the STS has `oauth.oidcBroker` set to the environment's Dex.
- **Launch redirects but the app rejects the handoff:** the app's service account is missing from `allowedRedeemerCallerSubs` or `handoffRedeemerPolicies`.

## Security notes

- Dex is public on purpose (it is the login page for every client). The portal host has **no** ALB OIDC gate, because the portal does its own sign-in.
- The pod's network is closed: ingress only from `ui-gateway-1`; egress only to DNS, istiod, Dex, `sts-service` and `authz-control-plane-1`.
- Redirect targets after login are restricted to local paths. Launch destinations are the configured `redirectUrl`s only.
- The cookie holds a one-hour token for a staff identity. Treat the portal host like any admin surface: the groups are the access control, so manage group membership as such.

## Hostnames

The portal is the one prod host that is not `<name>.prod-2.orangebox.ai`: it is `platform.orangebox.ai`, the stable home people bookmark. Every app it
launches uses the standard host, including Context at `context.prod-2.orangebox.ai`. Dev and stage use `platform.dev-1` and `platform.stage-1`.

## Design system

The pages use the **Budy Internal** design system, the third alongside the consumer app and e-commerce systems, for staff tools. Its tokens
(`design/budy-internal-design-system-1/project/tokens.json`) generate `tokens.css`; `portal.css` holds the components and may use tokens only. CI checks that
the generated file is current, that text pairs meet 4.5:1 in light and dark, and that no raw colour appears in the component CSS. A new internal tool should use
the same system rather than add a fourth look.

## Phase 2 (not started)

Candidates, in rough order of value. None is decided.

- Sign out of the Google session as well as the portal; show who is signed in and with which groups.
- Split `server.mjs` (about 1,300 lines, including the page) into modules and move the picker script to a static asset.
- Refine the look. Phase 1 already moved the pages to the Budy Internal design system (below); phase 2 is about layout and flow, not a new foundation.
- A scope-first picker: choose system or tenant scope and a boundary first, then show only the apps that scope can use.
- Model-controlled catalog: apps publish a small manifest, and visibility comes from OpenFGA rather than `routeGroups`; GitOps keeps only what must be reviewed (audience, redirect, scope type).
- Remove the ALB allow-lists from the STS now that nothing uses the ALB assertion.

## Related

- Skill: `add-app-to-platform-ui` (how to put a new app behind the portal).
- [Platforms and platform sessions](platforms.md): which platforms exist, the `platform` claim, and system audiences.
- [Platform Console Standard](platform-console-standard.md): the consoles the portal launches.
- [Network Policy & mTLS](../gitops/network-policy-and-mtls.md).
- [Application Cluster CI/CD Standard](../gitops/application-cicd-standard.md).
