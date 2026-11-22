# Platform Console Standard

> **Status: confirmed by the nainai console (October 2026).** A user signed in through the portal
> and saw the fleet. Corrections from that build are folded in below; the runbook and the list of
> snags are in the wiki skill `scaffold-platform-console`.

A **platform console** is an internal web UI for platform staff (support and admins), and
later for tenant-scoped views, that sits behind the platform portal. It is a non-Nexus
component of a cluster: one catalog entry, one chart, one image, released independently,
like any other component in the cluster standard (`scaffold-nexus-cluster-repo`). Consoles
are never meant for tenants to reach directly.

## What a console is

| Part | Choice |
| --- | --- |
| Shape | One container: a static React single-page app plus a small Node backend-for-frontend (BFF). No database. |
| Not used | React Server Components, Server Actions, server-side rendering, an image optimizer. |
| Diagrams | Left-to-right workflow and fleet views are client-side: `@xyflow/react` for the graph and `@dagrejs/dagre` or `elkjs` for layout, fed by JSON from the BFF. No server framework is needed for them. |
| Sign-in | The platform portal ([Platform UI](platform-ui.md)): sign-in through Dex (Google), then the STS one-time application handoff, redeemed by the BFF into an encrypted host-only cookie. The browser never holds a JWT. |
| Data | The BFF reads through adapters (`k8s`, `temporal`, `gateway`) and returns normalized view models, never raw provider objects. |
| Shared code | One npm package, `@budybot/console-kit` (sub-paths `/server`, `/ui`, `/adapters`), published from `budy-common-modules` to GitHub Packages, plus one base image. |

## The scope rule: the token decides

A console does not have a fixed "mode". Every request carries a **verified** STS token. Its
`scope_type` claim is `platform` for **system** scope (platform staff acting for the platform) or
`tenant` for **tenant** scope (acting inside one tenant), with `scope_id` and a
`session_boundary` of `viewer`, `editor` or `admin` (claims contract: `auth-service-1`,
`docs/v2-token-claims-contract.md`; the claim names are the standard snake_case ones, see
[STS token claims](sts-token-claims.md)). Each adapter declares the scope it requires.

1. The session token is verified on every request (signature, issuer, audience, expiry). The
   cookie only transports it. The audience is the console's origin, except for a console launched
   through a `nexusTarget` route: there it is the Nexus resource of the console's **own** cluster
   gateway (`urn:budy:nexus:<endpoint>:<service>`), so the same token is accepted by the console and
   forwarded to that gateway. Only a console that writes through its own gateway uses this
   (today: DT Consulting); it sets `CONSOLE_STS_AUDIENCE` and `CONSOLE_HANDOFF_RESOURCE` to that URN.
2. An adapter that uses the **pod's own credentials** (`k8s`, `temporal`) may only require
   system scope. The shared server refuses to start otherwise. A tenant-scope token on such a
   route gets 403.
3. An adapter that forwards the **user's token** to a gateway (`gateway`) may serve either
   scope; tenant enforcement stays in the gateway.
   **Exception, the cluster's own store:** a tenant console may read its own cluster's database
   with the pod's credentials only when all of these hold: the credentials are a Vault-issued member
   of the database's **read role** (SELECT only); the adapter requires tenant scope; every query is
   filtered by the verified token's tenant (and by its subject for per-user records), never by a
   request field; and the data is the cluster's own, not another system's. The pod credential then
   grants no reach beyond what the token's tenant filter allows. Writes still go through the gateway
   as the user. Today only the DT Consulting console uses this; console-kit does not yet model it
   (its adapters are declared `credential: "user"`), and a `store` credential kind that enforces the
   tenant filter belongs in console-kit before a second console needs it.
4. A deployment lists the scopes it accepts. A cluster that serves one scope leaves the other
   off; a cluster that serves both enables both. Unlisted scopes are rejected before any
   adapter runs.
5. Tenant and user identity come from the token only, never from the request.

Current expectation: nainai and Pit Crew system scope; DT Consulting tenant scope (built, November 2026:
the first tenant console that writes, launched through a `nexusTarget` route so one token serves the
console and its gateway; see the [DT Consulting console](../micro-services/execution-mode-services/dt-consulting-services-1/console.md));
gitjib both.

**Pit Crew (system scope, built November 2026, in review).** The operator console shows how a system-scope console splits its data
path. Non-confidential reads (the queue, filters, stats and ticket history) come straight from the cluster's own database through the
standard read role, which the database grants limit to the `meta` schema: no Temporal and no gateway call. Anything client-specific
(opening a ticket's content) and every change goes through the cluster's gateway as the signed-in user, so the gateway verifies the
user's STS token and the platform authorizes it. Two consequences are new to the standard:

- **Who is staff.** A platform-scope token states the scope and the session boundary, not the Agent Success role. The console asks the
  OpenFGA read-only proxy before every query and gateway call and fails closed. A platform that puts a role claim in the token would
  replace this check.
- **Gateway results.** Temporal's Nexus HTTP endpoint answers `201` for an asynchronous call and posts the result to a `callback` URL.
  The console passes an in-cluster callback URL, keeps the waiting request in memory and serves the callback on a second, non-public
  port. A callback lands on one pod, so such a console runs **one replica**, and the platform must allow Temporal to reach the callback
  (Temporal's callback allow-list and a network policy). The context-cluster control plane uses the same pattern.

## Security baseline

Consoles are behind Google OIDC, which removes anonymous exposure but not supply-chain risk or
the value of the credentials a console pod holds.

- **No server-component framework.** The server-component layer had critical and high
  advisories in consecutive months (September and 14 October 2026). A static SPA with a plain
  JSON BFF has no such protocol to attack. If a cluster insists on Next.js, it uses a patched
  release, route handlers only, no Server Actions, no `use cache`, unoptimized images.
- **Supply chain.** Exact pins and a committed lockfile; `npm ci --ignore-scripts`; no
  dependency that needs an install script; no non-security third-party version younger than 7 days
  (`min-release-age=7`, npm 11.10 or later) with our own `@budybot/*` packages exempt
  (`min-release-age-exclude[]=@budybot/*`, npm 11.20 or later), because we publish and update
  them as needed instead of working around them in the consumer; few dependencies; no Kubernetes client library;
  automated updates (security immediate, others weekly, through the age gate); an audit step
  in CI. Publishing uses the short-lived workflow token; no long-lived npm token exists.
- **Runtime.** Non-root numeric user, read-only root filesystem, capabilities dropped, strict
  CSP, `__Host-` `HttpOnly` `Secure` `SameSite=Lax` cookie, authorization inside every
  handler (never only middleware), projections instead of raw objects, no tokens or cookies in
  logs.
- **Kubernetes access.** A read-only ClusterRole where workloads live in their own
  namespaces: `get` and `list` on named resources only, no secrets, no write verbs.

## Versions policy

Stable releases only; not younger than 7 days; prefer a major line already proven in our
repos or a few months old; add a library only when needed. The lockfile is the record of what
is pinned; the table in the nainai plan is the starting set. Node 26 (LTS "Lithium" since 26.13.0, October 2026).

## Build and release

`validation.kind: node` in `.github/components.json`; the shared `platform-actions@v1`
pipeline validates, builds and releases it. Consuming a private package needs read access
granted on the package for each consuming repository and a `packages: read` token in CI and as
a BuildKit secret in the image build.

**Every new cluster repository must be added to the package's settings** (`@budybot/console-kit` →
Manage Actions access → Add repository → Read) before its first console build, or `npm ci` fails with
`403` or `404`. This is a manual owner step: GitHub's npm registry accepts only a classic personal access
token or the workflow `GITHUB_TOKEN` (for repositories added to the package), not GitHub App tokens, and there is no
organization-wide grant. A read-only machine-user token kept as an organization secret would avoid it at the cost of a
long-lived credential; that option is deferred. The scaffold skill carries the same reminder.

## Wiring map

A console touches these repositories, in this merge order. Every row is a separate pull request.

| Order | Repository | What |
| --- | --- | --- |
| 0 | `budy-common-modules` | `@budybot/console-kit` (once); the cluster repository is granted read on the package |
| 1 | cluster repository | component, chart (off by default), catalog entry, root workspace, both lockfiles, changeset |
| 2 | `vault-gitops` | role and default KV policy; then write the cookie key in each environment |
| 3 | `k8s-security` | ingress, egress, STS peer, netpol identity, `ReferenceGrant`, **ingress gateway egress**, **`VaultAuthGlobal` allowed namespaces** |
| 4 | `argocd-critical-stack` | AppProject cluster-resource whitelist for the ClusterRole and binding |
| 5 | `argocd-eks-stack` | OIDC-protected Ingress and HTTPRoute for the host, with `group.order` if a public route shares it |
| 6 | `de-v2` | STS redeemer policy, `httpAudiences`, platform client `resources`; the cluster app values (enabled, URLs, Vault) |
| 7 | portal config and portal | the portal route for the console (`add-app-to-platform-ui`) |

The two rows in bold in step 3 are the ones that were missed in the first build and surfaced as an unreachable console and a
secret that would not sync. Check them first on the next console.

## Decisions from the first build

- **Two lockfiles.** The console is a root workspace (changeset validation requires it), so CI installs from the root lockfile
  and root `.npmrc`; the image build installs from the component's own lockfile. Regenerate both together.
- **The portal is a dependency, not a given.** The first portal only launched Nexus-target routes and Auth Manager; a plain web app
  needed a `systemSession` route block. `platform-ui-1` carries that block over, so a console is added as a route (see `add-app-to-platform-ui`).
- **Hand-written chart.** `charts/console-1` does not use a library chart. Extract a shared `platform-console` chart when a second
  console exists, so the shared part is taken from two real charts instead of guessed from one; the part that differs per cluster is the ClusterRole rules.
- **Comments and labels.** Comments carry what a maintainer needs (why, or what to change alongside). Descriptions do not call a console "read-only":
  the first phase only lists, and writes will come later through the operator's CRDs.

## Documentation

Each cluster with a console has a console page next to its service document, for example the
[nainai console](../micro-services/execution-mode-services/nainai-cluster-1/console.md). The
procedure is in the wiki skill `scaffold-platform-console`.
