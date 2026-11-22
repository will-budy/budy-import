# DT Consulting console

The tenant console of `dt-consulting-services-1`: one tenant's engagements, started and followed from the platform portal. It is built on the [Platform Console Standard](../../../ref/platform-console-standard.md) and is the first **tenant-scope console that writes**. The service-side design is `docs/design/console.md` in `Budybot/dt-consulting-services-1_repo-1`.

Status (November 2026): built, not yet deployed. Bring-up order and checks: `docs/design/phase-0-test-plan.md` in the service repository.

## Purpose

Lets a person, assuming a digital teammate of a tenant, start an engagement and watch it move through its stages, and lets a DT manager see the tenant's engagements, before any DT calls the cluster itself.

## Shape

| | |
| --- | --- |
| Component | `console-1` in `dt-consulting-services-1_repo-1` (non-Nexus, Node component on `@budybot/console-kit`), chart off by default |
| Scope | Tenant scope only. Reads for any tenant session; writes need an editor session and, in engagement-manager-1, the `active_digital_teammate` tier |
| Hosts | `dtcs.dev-1.orangebox.ai`, `dtcs.stage-1.orangebox.ai`, `dtcs.prod-2.orangebox.ai` (wildcard DNS and certificate), OIDC-protected ALB ingress |
| Sign-in | Platform UI route `dt-consulting-services-console-1`, a **`nexusTarget`** route (endpoint `ob1-nexus-dt-consulting-services-1-endpoint-1`, service `DTConsultingServiceV1`), so the session's audience is the gateway's and one token serves the console and the gateway (the standard's `nexusTarget` audience case). The person picks the tenant, a target (the DT to act as) and a role |
| Reads | The engagement store, `ob1-dt-consulting-services-db-1`, as a Vault-issued member of its read role, every query filtered by the token's tenant: the standard's [own-store exception](../../../ref/platform-console-standard.md#the-scope-rule-the-token-decides) to the pod-credential rule |
| Writes | `startEngagement` and `closeEngagement` through the gateway as the user, over Temporal's Nexus HTTP endpoint (no callback; outcomes read back from the store) |
| Session key | Vault KV `v1/de-v2/ob1-tf-eks-de-v2-dt-consulting-services-1-ns-1/dt-consulting-services-1-console-1/session`, key `sessionSecret`, synced by VSO |
| Network | Ingress from `istio-gateway-1` on 3000; egress to `sts-service` 8080, the Temporal frontend 7243, Postgres 5432. Netpol identity `dt-consulting-services-console-1` |

## Personas

| Assumed as | Session | Sees and does |
| --- | --- | --- |
| Digital teammate | editor | the tenant's engagements; starts one (one live at a time); closes its own |
| DT manager | viewer (the role carries no more yet) | the tenant's engagements and their stages |
| Tenant admin | admin | as a teammate |

## Differences from the nainai console

- Tenant scope, and it writes. console-kit serves reads only, so the two write routes are local to the component (same authentication, same-origin JSON only). A Nexus transport and write routes belong in console-kit once a second console needs them.
- No Kubernetes access (no ClusterRole, no Argo cluster-resource whitelist entry).
- Its data is in Postgres, so it holds database read credentials as well as the session key.
