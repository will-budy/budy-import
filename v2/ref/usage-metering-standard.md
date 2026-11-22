---
name: Usage metering standard
code: usage-metering-standard
version: 0.2
status: draft
last_updated: 2026-11-13
---

# Usage metering standard

How a platform service records what a tenant consumed, so that Glassbox can turn it into credits and decide what happens
when they run out. The first producer is Karkhana ([sandboxes](../micro-services/execution-mode-services/karkhana-cluster-1/sandboxes.md)).

## Three jobs, three owners

| Job | Owner | What it is |
| --- | --- | --- |
| **Metering** | each service | Appending immutable records of quantities consumed. No prices, no credits, no decisions. |
| **Rating** | Glassbox | Turning quantities into credits with a price book Glassbox owns. Prices change without touching a service. |
| **Enforcement** | Glassbox, through authorization | Writing the fact "this billing entity may or may not consume" where the STS and authorization checks read it. A service never checks a balance itself. |

## The billing entity: `glassbox_id`

Every STS session carries a `glassbox_id` claim (formerly `glassboxId`): the entity that pays for what the session does. It is a digital teammate of
the session's tenant (the default for a teammate's own session) or the tenant itself. A service acting in a tenant on
someone's behalf names the entity when it exchanges, and the STS refuses one that does not belong to the tenant. Gateways
pass it to components as `GlassboxID` next to the tenant and the user. A service records it and does not choose it. One fallback exists today: Karkhana's `sandbox-manager-1` bills the tenant when a token carries no `glassbox_id` (the STS stamps one on every tenant session, so this is a safeguard).

## The usage record

One row per meter per window per resource.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | uuid | The record. |
| `idempotency_key` | text, unique | `<resource_ref>/<meter>/<window_start>` (window start as RFC 3339 UTC, for example `sandbox/sbx-.../sandbox.cpu-request-seconds/2026-11-13T10:05:00Z`): writing the same window twice is a no-op. A correction appends `#c<n>` (see the rules). |
| `glassbox_id` | text | The billing entity, from the token. |
| `tenant` | text | The tenant, from the token. |
| `service` | text | The producing service, for example `karkhana-cluster-1`. |
| `meter` | text | What was measured: `<domain>.<quantity>-<unit>` in lower case, for example `sandbox.cpu-request-seconds`. |
| `quantity` | numeric | How much, in the meter's unit, within the window. Never cumulative. |
| `unit` | text | `seconds`, `gib-seconds`, `count`, `tokens`, ... |
| `window_start`, `window_end` | timestamptz | The period the quantity covers. Windows of one resource and meter do not overlap. Karkhana's windows are five minutes long, aligned to the clock in UTC, and written once closed. |
| `resource_ref` | text | What consumed it, for example `sandbox/<id>`. |
| `attributes` | jsonb | Dimensions rating may need (Karkhana writes `type`, `zone` and `region`). Never personal data. |
| `recorded_at` | timestamptz | When the row was written. |

## Rules for a producer

- **Append only.** A record is never updated or deleted by the producer. A correction is a new record for the same
  resource, meter and window whose quantity is the signed difference, whose idempotency key is the corrected record's key
  followed by `#c<n>` (`n` counts corrections of that record from 1), and whose `attributes` carry `correctionOf` (the
  corrected record's `id`) and `reason` (Karkhana's operator writes no corrections today). The rule that windows do not overlap applies to records that are not
  corrections; the consumed quantity of a window is the sum of its record and its corrections.
- **Windowed, not on completion.** A long-running resource reports every few minutes (five by default), so a crash loses at
  most one window and Glassbox sees consumption as it happens.
- **Measure what was reserved and, where possible, what was used.** They are different meters
  (`...-request-seconds`, `...-used-seconds`); rating chooses.
- **Idempotent.** The idempotency key makes a retried write safe.
- **A new meter is a documented meter.** Each service lists its meters, units and attributes in its own design page.
- **Read access.** The records live in the service's own database, in a table named `usage_<n>`, readable by a read-only
  role that Glassbox holds. A service that cannot offer that exposes the same records through a capability.

## What a producer does not do

It does not hold a balance, price anything, refuse a request for lack of credit, or call Glassbox on the request path.
