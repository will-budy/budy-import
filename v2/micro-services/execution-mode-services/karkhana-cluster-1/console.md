---
name: Karkhana - Tenant console
code: karkhana-cluster-1-console
version: 0.1
status: draft
last_updated: 2026-11-11
---

# console-1: the tenant console

The Karkhana dashboard of one tenant, opened from the platform portal at `karkhana.<env>.orangebox.ai`. Built the same way as the dt-consulting-services-1 console (Node, React and `@budybot/console-kit`, tenant scope, one sealed host-only cookie), so it is a signed-in **shell** today: the one page, Sandboxes, stays empty until `sandbox-manager-1` creates sandboxes. The point of building it first is the path (host, ingress, portal route, STS handoff, network policy, Vault session key), which is the same whatever the pages show.

## How a session reaches it

```text
portal (nexusTarget route, tenant scope) -> STS: tenant session, aud = urn:budy:nexus:ob1-nexus-karkhana-cluster-1-endpoint-1:KarkhanaServiceV1
   -> handoff -> console-1 /auth/callback -> sealed host-only cookie (console-kit)
reads: console-1 -> its own API (/api/sandboxes), tenant taken from the token
```

- **Route type.** The portal route `karkhana-console-1` is a `nexusTarget` (endpoint `ob1-nexus-karkhana-cluster-1-endpoint-1`, service `KarkhanaServiceV1`). The route id is the STS handoff app id (auth-cluster-1 `handoffRedeemerPolicies`, bound to the console's ServiceAccount).
- **Scopes.** `CONSOLE_ACCEPTED_SCOPES=tenant`, no minimum boundary: any tenant session may read. There are no writes yet.
- **Open point.** The STS resolves the operations of a `urn:budy:nexus:` audience from OpenFGA. The dt-consulting-services-1 cluster publishes an authorization model for its service; whether `KarkhanaServiceV1` needs one before the portal can mint the session is not checked yet.

## Deployment

| | |
| --- | --- |
| Host | `karkhana.<env>.orangebox.ai`, OIDC-protected ALB ingress to the shared Istio gateway, `HTTPRoute` to Service `console-1` port 80 (argocd-eks-stack `gtw/ingress`) |
| Route id / handoff app id | `karkhana-console-1` |
| Namespace | `ob1-tf-eks-de-v2-karkhana-1-ns-1` (Istio ambient) |
| Network | Cilium and Istio together: the gateway reaches the pod over HBONE (:15008) and an Istio ALLOW names the gateway's principal and port 3000; the console reaches STS the same way (k8s-security `AGENTS.md`, "Istio ambient") |
| Vault | role `ob1_tf_vault_karkhana-console-1_role_1`; the session key (a random string of at least 32 characters, key `sessionSecret`) at `app-kv-secrets-1` `v1/de-v2/ob1-tf-eks-de-v2-karkhana-1-ns-1/karkhana-cluster-1-console-1/session`, written by hand per environment |
| Chart | `console-1`, off by default; GitOps turns it on in dev first |

## Next

Sandboxes read from the sandbox store (`ob1-karkhana-db-1`) once `sandbox-manager-1` writes to it, and credits and usage follow. Both need a read role in Vault and a database ingress rule, added with the manager.
