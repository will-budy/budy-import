# STS token claims

|                  |                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Document**     | The claims the STS puts in its tokens, the standard-claims migration, and the rules for reading and adding claims    |
| **Status**       | Standard claims issued since 2026-11-21; the deprecated claims stopped being minted in sts-service 1.18.0 (dev 2026-11-22); stage and prod are owner-managed (see "Rollout") |
| **Audience**     | Anyone who writes code that reads an STS token, asks the STS for one, or wants a new claim                            |
| **Source**       | `auth-service-1`: `docs/v2-token-claims-contract.md` (the claims registry there is the source of truth)               |

The STS (`auth-cluster-1`, `sts-service`) mints RS256 JWTs: tenant and platform sessions, session-exchange tokens, actor
tokens, external app tokens, run tokens, connection sessions and registration tokens. This page says what they carry now,
why that changed, and the rules that keep it from drifting again.

## Why the claims changed

Until November 2026 the STS expressed what a token may do in one place that only Nexus understood: `nexusAccess`
(`aud`, `operations`, `capabilities`). Next to it sat camelCase claims that existed only because Nexus gateways read them
(`scopeType`, `sessionBoundary`, `glassboxId`, and others) and a `scope` claim that held an OAuth-style label, not a
standard scope. Only the auth service minted them, and every cluster hand-read them.

The result: HTTP receivers and Nexus receivers needed different token handling, no standard library could validate a
token, and every new fact (an environment, a call context) meant a new Nexus-shaped claim that each cluster had to learn.

The standardization drive moved the STS to one claim set that serves HTTP and Nexus receivers alike. That is the platform's
design direction: no separate external and internal token shapes, and the Nexus practice evolves into the HTTP one (see
[the migration guide](https://github.com/Budybot/ob1_mn_gh_auth-service-1_repo-1/blob/main/docs/migrating-to-standard-claims.md), section 1).

## Standard and custom claims

Between 2026-11-21 and the removal release (sts-service 1.18.0, dev 2026-11-22) the STS minted each deprecated claim next to
its replacement with a byte-equal value. Since 1.18.0 it mints only the standard names; the "Deprecated" rows below are
what tokens minted before the release carried, and what the reader code still accepts (see "Deprecation").

| Claim | Kind | Meaning |
| --- | --- | --- |
| `iss`, `sub`, `aud`, `exp`, `iat`, `jti` | standard (RFC 7519) | Unchanged. `aud` is always a single string. |
| `nbf` | standard | Issued at minus 30 seconds on session, exchange, actor, app and run tokens. |
| `scope` | standard (RFC 8693, RFC 9068) | Space-delimited, audience-qualified. See "The scope claim". |
| `client_id` | standard (RFC 8693) | The OAuth client the token was issued to. On a run token, the attesting caller. |
| `act.sub` | standard (RFC 8693) | The actor of a delegation. Unchanged. |
| `tenant`, `platform`, `dt`, `automation`, `workflow`, `activity` | registered | Unchanged. |
| `scope_type` | registered, snake_case | `tenant` or `platform`. Formerly `scopeType`. |
| `scope_id` | registered | The tenant or platform id. Formerly `scopeId`. |
| `session_boundary` | registered | `viewer`, `editor` or `admin`. Formerly `sessionBoundary`. |
| `glassbox_id` | registered | The billing entity, tenant sessions only. Formerly `glassboxId`. |
| `system_audience_key` | registered | Platform sessions, when a system audience was chosen. Formerly `systemAudienceKey`. |
| `kubernetes_namespace` | registered | Tenant sessions, when the resource needs one. Formerly `kubernetesNamespace`. |
| `workload_identity` | registered | Kubernetes self-exchange. Formerly `workloadIdentity`. |
| `token_class` | registered | One name for what was `sessionClass` (sessions), `tokenClass` (run tokens) and `token_use` (actor tokens). |
| `run_id`, `attested_by` | registered | Run tokens. Formerly `runId`, `attestedBy`. |
| `call{}` | registered | The context of one call through a connection: `connection`, `publication`, `activity`, `attested_by`. Formerly `act.conn`, `act.pub`, `act.activity`, `act.attestedBy`. |
| `env` | registered | `dev`, `stage`, ...; **absent in prod**. See "The env claim". |
| `dep_scope` | deprecated, **still minted** | The old `scope` label (`session:editor`, `app:read`, `signup`, `delegation:read`) on exchange, actor and app tokens; the only carrier of that legacy value. The `scope` key holds the standard scope. It is removed in a separate, later release. |
| `nexusAccess` (`aud`, `operations`, `capabilities`) | removed in 1.18.0 | Replaced by `aud` and the `scope` entries below. |
| `act.conn`, `act.pub`, `act.activity`, `act.attestedBy` | removed in 1.18.0 | Replaced by `call{}`. `act.sub` stays. |

The camelCase names (`scopeType`, `scopeId`, `sessionBoundary`, `glassboxId`, `systemAudienceKey`, `kubernetesNamespace`,
`workloadIdentity`, `sessionClass`, `tokenClass`, `token_use`, `runId`, `attestedBy`) were removed in 1.18.0 as well.
Every claim is in the registry (`shared/contract/claims.go`) with its status, replacement and dates, and the claims
contract renders that registry as a table.

## The scope claim

`scope` is a space-delimited list of entries, each qualified with the audience of the receiver it is for. For a receiver
whose audience is `A`:

| Entry | Grants |
| --- | --- |
| `A` | the root: every capability of `A` (it does not grant a Nexus operation) |
| `A/<component>` | one component |
| `A/<component>.<capability>[.<sub>]` | one capability, up to six levels |
| `A#<Operation>` | one Nexus operation |

Rules every receiver applies:

- A grant allows capability `P` if the entry is the root, or equals `P`, or `P` begins with the entry followed by a dot.
- A receiver that finds no entry for its own audience falls back to the legacy check during the migration; entries for
  other audiences, and legacy labels, are ignored. Once any entry names the audience, the scope decides, and an operation
  needs its `A#<Operation>` entry.
- Names with a dot inside a segment, or empty names, are refused. Anything unparsable fails closed.
- Limits: 8192 bytes and 64 entries.
- The audience is fully qualified (for example `urn:budy:nexus:<endpoint>:<Service>`, or an app origin) and **not**
  environment-qualified. Environment-qualified audiences would multiply the GitOps values; `env` carries the environment.

**Narrowing (RFC 8693).** A caller of the session exchange, the workload exchange or the user-delegation grant may add
`<resource>/<component>.<capability>` entries to the `scope` it sends, to ask for less. The token then carries those
capabilities and no root entry. A request can only narrow within what is already admitted (anything outside is
`400 invalid_scope`), and a narrowed session cannot be exchanged again or handed off.

## The env claim

`env` lets a receiver refuse a token from another environment without environment-qualified audiences.

- The STS stamps `env` from `STS_ENV_CLAIM` (chart value `envClaim`). It is never `prod`: production stamps none, and the
  chart refuses `prod` and malformed names.
- Receivers choose what they accept with `STS_ENV_POLICY`:

| Policy | Meaning | Use |
| --- | --- | --- |
| `unchecked` (default) | `env` is ignored | until the STS stamps `env` |
| `absent` | a token that carries any `env` is refused | prod |
| `equal:<env>` | the token's `env` must equal it; a token without one is refused | dev `equal:dev`, stage `equal:stage` |

Set `equal` only after the STS of that environment stamps `env` and every token minted before has expired.

## Deprecation

- Each claim has a status in the registry: `active`, `deprecated` or `removed`, with its replacement, the date it was
  deprecated, and `remove_not_before`.
- `remove_not_before` was **2026-11-22** for every deprecated claim. That date was a floor, not a trigger: reaching it only
  warned. The removal shipped in an owner-confirmed release, **sts-service 1.18.0 / contract 1.12.0 (auth chart 0.1.115),
  promoted to dev on 2026-11-22**. It marks every deprecated claim `removed` except `dep_scope`, which stays minted and
  deprecated because the readers of actor, app and sign-up tokens still need it; removing it is a separate, later release.
- The reader structs in `contract` (`NexusSessionV1`, `ActorClaimV1`, `NexusAccessV1`) keep the removed names, so a receiver
  still reads a token that was minted before the removal until it expires. A receiver that reads only a removed name sees
  an empty claim on a token minted after it and refuses the token.
- The STS serves the notices at `/.well-known/claim-notices.json` on its internal profile only (the external profile serves
  neither the notices nor the `Link: rel="deprecation"` header that advertises them). The shared gateway module (`go/capability`, `gateway/stsauth`) discovers them from the
  JWKS response and logs them: `info` for a planned deprecation, `warn` once the replacement is issued, `error` once a
  claim is removed. `STS_CLAIM_NOTICES=off` switches it off.
- CI guards: tests make sure that only claims marked deprecated or removed in the registry are, that every one names a
  replacement, and that no test depends on the calendar date.

## Strict mode

A receiver that is sure every token it sees comes from an STS that issues the standard claims turns on
`STS_REQUIRE_STANDARD_CLAIMS=true` (consoles: `CONSOLE_REQUIRE_STANDARD_CLAIMS`). Then `scope` must have an entry for its
audience, the snake_case twin of every deprecated claim the validator reads must be present, `nexusAccess` is never
consulted, a Nexus operation must be named, and the audience must be one string. Only the literal `true` (any case) turns
it on.

## Size limits

Tokens that travel in a cookie must stay under 2700 bytes; the STS warns above 2400. Removing the deprecated claims made
tokens about a quarter smaller: a tenant session for the Context audience went from 2169 to 1574 bytes, and a session
exchange for the longest audience from 2700 to 2034 bytes. The limits are unchanged. Do not add claims lightly.

## Rules going forward

1. **Read standard claims.** Use `scope`, `client_id`, `nbf`, `env` and the registered snake_case claims. Do not read a
   camelCase claim or `nexusAccess`.
2. **Use the shared validators**, not hand-rolled parsing: `go/capability/gateway/stsauth` for gateways and HTTP
   receivers, `shared/contract/nexusauth` for Nexus receivers, `@budybot/console-kit` for consoles. They implement the
   scope grammar, the twin rules and the notices.
3. **No Nexus-specific claims.** HTTP and Nexus receivers read the same claims; there is no separate Nexus claim or
   token shape. A Nexus operation is the operation entry `<aud>#<Operation>` of the `scope` grammar (an HTTP receiver can
   ignore it), and a capability is `<aud>/<component>.<capability>`.
4. **Do not expand the claim set.** A new claim needs the owner's approval, an entry in the registry (name, class, who
   mints it, who reads it) and a golden test. Prefer a standard claim over a new one, and prefer a `scope` entry over a
   new claim for anything that is a permission. Do not put data in a token that a receiver can look up.
5. **Never trust a pair that disagrees.** A token minted before the removal could carry a deprecated claim and its twin.
   If they differ, the token did not come from the STS; refuse it, and name the claims in the error, not the values.

## Released versions

| Component | Version |
| --- | --- |
| auth-service `contract` | v1.11.0 (standard claims issued next to the old ones); v1.12.0 (removal) |
| auth-service `shared` | v0.11.0; v0.11.1 (removal) |
| `sts-service` | 1.17.0 (chart `auth-cluster-1` 0.1.114); 1.18.0 (chart 0.1.115, the removal release) |
| `budy-common-modules` `go/capability` | v0.10.0 (v0.9.0 is the first to read the standard names) |
| `@budybot/console-kit` | 0.9.0 |
| context-cluster | gateway 0.41.0 |
| llm-router | gateway 0.12.0, request-handler-1 1.18.0, stream-handler-1 0.2.0 |
| Janus | gateway-1 0.9.0, console-1 0.13.0, outbound-policy-1 0.10.0 |

## Rollout

- **Dev-1:** the STS removal release (1.18.0, chart 0.1.115) reached dev on 2026-11-22. Dev also has the env claim
  (`auth-cluster-1`) and, in the context and llm-router gateways (llm-router `gateway`, `request-handler-1` and
  `stream-handler-1`), strict mode with `STS_ENV_POLICY=equal:dev`; Janus `gateway-1` and `console-1` run strict mode as
  well. The de-v2 changes are #3263 and #3266.
- **Stage and prod:** the owner promotes `auth-cluster-1`, context and llm-router through Kargo, and I have not checked what
  has reached them. Every receiver must read the standard names **before** the removal release reaches its environment.
  The intended env settings there are `equal:stage` for stage and `absent` for prod (and no `envClaim` in prod); they are
  not set yet.
- **Other clusters** must read the standard names before the release reaches their environment. The per-cluster checklist
  is in the migration guide: [Migrating to the standard STS claims](https://github.com/Budybot/ob1_mn_gh_auth-service-1_repo-1/blob/main/docs/migrating-to-standard-claims.md).

## Related

- [Platforms and platform sessions](platforms.md): the tenant and platform session tokens.
- [Platform Console Standard](platform-console-standard.md): how a console reads the token.
- [Usage Metering Standard](usage-metering-standard.md): the `glassbox_id` billing entity.
