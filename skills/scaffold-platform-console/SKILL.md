---
name: scaffold-platform-console
description: Add an internal platform console (admin or support web UI behind the platform portal) to an OB/Budy cluster repository as a Node component, built on the shared @budybot/console-kit package and base image. Use when adding a console UI to a *-cluster-1 repo, wiring it to the platform portal, STS, Vault, network policy and Argo, choosing its adapters (k8s, temporal, gateway) and scopes (system or tenant), or documenting a cluster's console. Confirmed by the nainai console build (October 2026).
---

# Scaffold a platform console

Confirmed by building and signing in to the nainai console (`console-1`). The standard is
`v2/ref/platform-console-standard.md`; read it first. The worked example is the
[nainai console page](../../v2/micro-services/execution-mode-services/nainai-cluster-1/console.md).

This skill covers adding **one console component** to one cluster repository. For the cluster
standard, cross-repo onboarding and the release state machine use `scaffold-nexus-cluster-repo`,
`scaffold-ob-application` and `manage-ob-application-cicd`.

## Decide first

1. **Scopes accepted:** `system`, `tenant`, or both (deployment config; each adapter still enforces its own scope from the verified token).
2. **Adapters:** `k8s` and `temporal` use the pod's credentials and are system scope only. `gateway` forwards the user's token and may serve either scope.
3. **Which Kubernetes kinds it lists.** Each kind needs a ClusterRole rule, an adapter and a projection that picks fields by name.
4. **Hostname:** `<cluster>.<env>.orangebox.ai`, on the cluster's existing host if it has one.
5. **App id and resource:** app id = the portal route id (`<cluster>-console-1`); resource = the public origin (`https://<host>`).

## Before the first build: package access (owner step)

Add the cluster repository under the `@budybot/console-kit` package settings: **Manage Actions access → Add repository → Read**.
Without it `npm ci` fails with `403`/`404` in CI and in the image build ("not granted", not "not published").
GitHub's npm registry takes only a classic PAT or the workflow `GITHUB_TOKEN`, so there is no organization-wide grant.

## Steps, in this order

Merge order matters: a step out of order fails or hides the real error.

1. **Cluster repository** (one PR)
   - `components/console-1/`: Node package named `console-1`, SPA plus a BFF on `@budybot/console-kit`, exact version pins, own `Dockerfile` from `templates/Dockerfile.console`, own `package-lock.json`.
   - **Root workspace + two lockfiles.** The component must be a root workspace (changeset validation requires it). Inside a workspace npm ignores the component's `.npmrc` and lockfile, so CI installs from the *root* `package-lock.json` and root `.npmrc` (`@budybot:registry`, `ignore-scripts`, `min-release-age`, `min-release-age-exclude[]=@budybot/*`), while the image build (context = the component directory) uses the component's own lockfile. Regenerate both when dependencies change.
   - `.github/components.json`: `validation: {kind: node, node_version: "26.x", npm_registry_scope: "@budybot", ignore_scripts: true}`, `publishes_image: true`, `chart_values_image_tag_path`. Needs `platform-actions` v1.16.0 or later.
   - `charts/console-1/`: ServiceAccount, ClusterRole + binding named `<namespace>-console-1`, Deployment (non-root, read-only root filesystem, projected STS token, VSO secret volume), Service `console-1` port 80, `VaultAuth` + `VaultStaticSecret`, pod label `budybot.io/netpol: <cluster>-console-1`. Add it to the umbrella chart behind `console-1.enabled: false`.
   - A changeset for `console-1`.
2. **vault-gitops:** a `services.catalog.tf` entry (role `ob1_tf_vault_<cluster>-console-1_role_1`, service account `console-1`, default KV policy). After it applies, **write the cookie key** (random, at least 32 characters, key `sessionSecret`) at `v1/de-v2/<namespace>/<cluster>-cluster-1-console-1/session` in every environment.
3. **k8s-security** (before the first rollout; default-deny otherwise blocks it):
   - namespace ingress from `istio-gateway-1` on 3000; egress to `sts-service` 8080 and the `kube-apiserver` entity on 443;
   - an `sts-service` ingress peer for the console in the auth namespace;
   - the netpol identity in the OPA allow-list;
   - a `ReferenceGrant` for the HTTPRoute to the Service (`gateway-crossns-grants`);
   - **the ingress gateway's own egress policy** (`istio-ingress-ns-1/egress/istio-gateway-1.allow-required.yaml` lists every route backend by hand);
   - **the cluster's `VaultAuthGlobal` `allowedNamespaces`** must include the console namespace (the operator's global auth allowed only the Crossplane namespace).
4. **argocd-critical-stack:** the cluster's AppProject `clusterResourceWhitelist` entries for the ClusterRole and binding by name. Keep `spec.description` at 255 characters or fewer (the AppProject CRD limit).
5. **argocd-eks-stack:** OIDC-protected `Ingress` + `HTTPRoute` for the host; set `alb.ingress.kubernetes.io/group.order` so a public webhook route on the same host is evaluated first.
6. **de-v2 GitOps** (Kargo-managed apps travel to stage and prod through the train; write the Vault secret before merging, or the pod waits on its volume and holds the dev bake):
   - `auth-cluster-1`: the console service account in `allowedRedeemerCallerSubs` (base); per environment a `handoffRedeemerPolicies` entry (app id + resource), the resource in `httpAudiences` and in the platform OAuth client's `resources`. Do not add it to `audienceAllowlist` (workload exchange only).
   - the cluster app: `console-1.enabled: true` and its STS, handoff and Vault values in `base`, public/portal URLs per environment.
7. **Portal route** (de-v2 `charts/apps/frontend-cluster-1/values`): route id = app id, `routeGroups` and `systemSession` in `routeDefaults`; `redirectUrl`, `systemSession.resource` (the `redirectUrl` origin) and the console origin in `cors.allowedFormActionOrigins` per environment. Follow `add-app-to-platform-ui`; shared files also go to the release branches.
8. **Smoke test:** sign in through the portal; the fleet page shows real rows; a tenant-scope token gets 403 on a system-only route; the service account cannot write (`kubectl auth can-i`).
9. **Document:** a `console.md` beside the cluster's service document and a `mkdocs.yml` nav entry.

## Generating the lockfiles without a personal token

The agent session has no package access, and nobody should paste a personal token. CI has it: the reusable workflow's `GITHUB_TOKEN` carries `packages: read` once the package grants the repository (Manage Actions access → Read). So generate the lockfiles in a CI run:

1. Write a user-level npm config in the job with the scope mapping and the token (`@budybot:registry=https://npm.pkg.github.com` and `//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}`). Never commit the token.
2. **Component lockfile:** copy the component to a temp directory outside the workspace and run `npm install --package-lock-only --ignore-scripts` there, then copy `package-lock.json` back. Inside the workspace npm would write only the root lockfile.
3. **Root lockfile:** run `npm install --package-lock-only --ignore-scripts` at the repository root.
4. Commit both lockfiles back to the branch with a workflow that exists only for that branch, then delete the workflow.

Pit Crew (`pitcrew-cluster-1`, system scope) is the worked example of a console in a repo that also has a Go worker: see its TRD, "As built".

## Snags we hit (symptom → cause)

| Symptom | Cause |
| --- | --- |
| `404`/`401` on `@budybot/console-kit` in CI | caller still on a `platform-actions@v1` run created before 1.16.0; a re-run reuses the old workflow, so push a real change for a fresh run |
| npm resolves `@budybot/...` from npmjs in CI | npm inside a workspace ignores the component's `.npmrc`; add the root `.npmrc` and root lockfile entries |
| `404` for `@budybot/console-kit` whose URL is `registry.npmjs.org` | not a grant problem: the scope mapping is missing from the npm config in use, so npm fell back to npmjs. Check the registry with the CI token first (HTTP 200 = granted) |
| `ETARGET` / no matching version for a fresh `@budybot/*` release | the `.npmrc` lacks `min-release-age-exclude[]=@budybot/*` (npm 11.20+; CI runs npm 11.20.0). Our own packages are exempt from the 7-day rule; third-party packages are not, so a fresh third-party release still needs an older pin |
| `target namespace ... is not allowed by kind=VaultAuthGlobal ... allowedNamespaces` | global auth allow-list lacks the console namespace |
| Console unreachable although ingress and grant exist | ingress gateway egress policy lacks the backend |
| AppProject update rejected | `description` over 255 characters |
| nainai app Degraded, dev bake stuck | Vault secret not written before the console was enabled |

## Portal note

The portal is `platform-ui-1` (`apps/platform-ui` in `frontend-cluster-1`); `platform-base-ui` in `frontend-services-1` is retired. Sign-in is Dex, and a person sees a
route only through its `routeGroups`. A plain web app is launched in system scope through the route's `systemSession` block (resource equal to the origin of
`redirectUrl`; tenant scope refused). The nainai console was moved there unchanged. Reference: `v2/ref/platform-ui.md`.

## Rules that must not be relaxed

- No React Server Components, Server Actions, SSR or image optimizer.
- A pod-credential adapter is only ever registered for system scope.
- Authorization inside every handler; views are projections that pick fields by name.
- Exact pins, lockfile, `--ignore-scripts`, 7-day age gate for non-security updates.
- Writes only through the operator's own CRDs once a write contract exists.
- Comments say something a maintainer needs (why, or what to update alongside); no narration and no product labels such as "read-only" in descriptions.

## Open items

- Temporal adapter credentials once Temporal authentication exists; the connector itself is not built.
- Whether a `platform-console` library chart is worth extracting; see the standard.
- Continuation (`usePagedList`) is merged in `console-kit` and ships with 0.2.0; the nainai console does not use it yet.
