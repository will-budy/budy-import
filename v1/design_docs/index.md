---
name: OB Platform Wiki
version: 0.1
status: active
owner: Budy Engineering
last_updated: 2026-04-13
---

# OB Platform Wiki

This repository is the central context and architecture workspace for Budy's platform systems.

Use it for:

- platform context and system boundaries
- service-level product, design, and technical docs
- infrastructure and operating knowledge
- historical architectural decisions and archived design work

## Start Here

- [de-v2 Platform Overview](de-v2-platform/PLATFORM.md)
- [de-v2 Platform PRD](de-v2-platform/platform-prd.md)
- [v1 Platform Context](de-v1-platform/v1-platform.md)
- [v1 Service Index](de-v1-platform/services/index.md)
- [Future Services Backlog](de-v2-platform/future-services.md)
- [v2 Service Index](de-v2-platform/services/index.md)

## Documentation Model

Every service has up to four documents in a strict layer cake:

- `prd.md`: why it exists, what it does, UAT acceptance criteria, deferred scope
- `hld.md`: architecture, component contracts, design principles, design decisions log
- `trd.md`: implementation types, code, error matrices, Temporal config, observability
- `nexus-contracts.md`: Nexus/activity contracts for callers (input, output, retry policy, SLA)

See [Design Document Standards](doc-standards.md) for the full content rules, layer boundaries, and reference templates. The Comms Gateway 1 docs are the canonical reference implementation.

## Working Rules

- keep one canonical page per service or platform area
- update docs in the same change as the system behavior
- prefer links over duplicated summaries
- archive retired material instead of overwriting design history
