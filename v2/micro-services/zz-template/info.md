---
name: Service Or Subsystem Name
kind: service
description: One sentence describing what this service or subsystem does.
part_of_subsystem: tbd
primary_owner: tbd
github_repo: tbd
status: not-being-developed
tags: []
interfaces: []
runtime:
  language: tbd
  framework: tbd
  deployment: tbd
links:
  design: []
  runbooks: []
  dashboards: []
  api_contracts: []
  builds: []
  release_candidates: []
---

# Service Or Subsystem Name

One short paragraph explaining the service boundary, why it exists, and what it owns. Keep implementation detail out of this file unless it is needed to route a reader.

## Index

Use this section to link child services when this file represents a subsystem. For leaf services, keep the table and write `None yet`.

| Name | Kind | Description | Status | Link |
| --- | --- | --- | --- | --- |
| Example Child Service | service | One sentence describing the child service. | active | `example-child-service/info.md` |

## Related Development

Link active features, builds, release candidates, and service-impact docs here.

| Name | Type | Status | Link |
| --- | --- | --- | --- |
| Example Build | build | draft | [build docs](../../builds/m2/prd.md) |

## Detailed Docs

Keep detailed docs close to the service and link them here.

| Name | Type | Link |
| --- | --- | --- |
| High-Level Design | hld | `v1/design_docs/de-v2-platform/services/auth-service/hld.md` |
| Technical Requirements | trd | `v1/design_docs/de-v2-platform/services/auth-service/trd.md` |
| Nexus Contracts | contract | `v1/design_docs/de-v2-platform/services/auth-service/nexus-contracts.md` |
