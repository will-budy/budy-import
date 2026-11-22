---
name: glassbox-1
kind: service
description: Records credit usage and real cost, and manages subscriptions - which credits a tenant and its teammates are allowed, exceptions, and the link to Stripe.
part_of_subsystem: execution-mode-services
primary_owner: tbd
github_repo: Budybot/ob1_mn_gh_glassbox-1_repo-1
status: not-being-developed
tags: [execution-mode, application-cluster, billing, credits, subscriptions]
interfaces: [nexus]
runtime:
  language: go
  framework: temporal
  deployment: eks
links:
  design: []
  runbooks: []
  dashboards: []
  api_contracts: []
  builds: []
  release_candidates: []
---

# glassbox-1

Glassbox is where the platform knows what a tenant is allowed to use, what it has used, and what that use cost.

> **Status (20 November 2026):** context for a later build, not a design. The repository is reset to an empty
> starting point; the rebuild starts from the [Usage Metering Standard](../../../ref/usage-metering-standard.md). This
> page records the intended scope so that tenant provisioning in
> [nainai](../nainai-cluster-1/tenant-provisioning.md) and the commerce flow in the backend cluster are designed
> against it.

## Intended scope

| Area | What Glassbox would own |
|---|---|
| Usage | Rating the usage records each service meters (append-only `usage_<n>` tables, read through a read-only role) into credits, per billing entity (`glassbox_id`: the tenant or one of its teammates) and window |
| Cost | The real cost behind that usage (model, compute, third-party), so margin per tenant and teammate is visible |
| Subscriptions | Which plan a tenant is on, the credits each plan allows per window, and which teammates it covers |
| Exceptions | Overrides granted to a tenant or a teammate (extra credits, a different window, a temporary allowance), each with who granted it and until when |
| Payments link | The Stripe customer and subscription ids for each subscription; payment state from Stripe events |
| Enforcement | Pausing or resuming credits when a bill is due or paid, by writing facts that STS and the authorization checks read (a service never checks a balance itself) |

## How it meets the rest of the platform

- **Tenant provisioning (nainai).** Glassbox is a subsystem of the tenant resource. It watches tenants and
  teammates, opens a billing account for each, and reports its billing id and state into its own section. It closes
  the account when a tenant is `deleting`, then removes its finalizer. Glassbox never creates tenants, and nainai
  never reads or decides credits.
- **Commerce (backend cluster).** Checkout and signup stay in the backend; the Stripe subscription it creates is
  recorded by Glassbox. Subscription storage and the Stripe webhook principal that today sit in the database service
  move to Glassbox when it is built.
- **Non-payment.** What a missed payment does (pause credits, suspend workloads, both) is designed together with
  Glassbox.

## Names already allocated

| | |
|---|---|
| Namespace | `ob1-tf-eks-de-v2-glassbox-1-ns-1` |
| Image repository | `ob1_tf_aws_ecr_glassbox-1_repo-1` |
| Chart | `glassbox-1-repo-1` |
| GitOps app | `charts/apps/glassbox-1` (de-v2) |
