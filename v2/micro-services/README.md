# Micro-Services Index

This folder is the platform index for micro-services and service groups.

Each service or subsystem should keep a short `info.md` file in its folder. The file starts with YAML front matter for basic metadata, then ends with a compact index of child services, related docs, features, builds, and release candidates.

Use [template/info.md](zz-template/info.md) when adding a new service or subsystem.

## Standard

- Use `info.md` as the canonical index file for every service and subsystem folder.
- Treat a subsystem as a service node that can contain child service nodes.
- Keep metadata short enough to scan in one screen.
- Link every child service, related feature, build, release candidate, and GitHub repository directly from the relevant `info.md`.
- Use `status` values consistently: `active`, `deprecated`, `not-being-developed`.
- Use `kind` values consistently: `platform`, `subsystem`, `service`, `library`, `operator`, `worker`, `contract`, `unknown`.
- Prefer `unknown` or `tbd` over leaving ownership, repo, or lifecycle fields ambiguous.
- Keep detailed design, runbooks, API contracts, and CRDs in separate docs and link them from `info.md`.

## Claim rules

Every service that reads an STS token follows the [STS token claims](../ref/sts-token-claims.md) reference:

- Read the standard claims (`scope`, `client_id`, `nbf`, `env` and the registered snake_case claims), through the shared
  validators, never the deprecated camelCase claims or `nexusAccess`.
- Put nothing Nexus-specific in a token: HTTP and Nexus receivers read the same claims.
- Do not expand the claim set. A new claim needs the owner's approval and a registry entry in `auth-service-1`.

## Root Subsystems

| Subsystem                   | Description                                                                                                                                 | Status | Index                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Thinking Mode Services      | Services for deliberate reasoning, planning, context synthesis, and higher-latency workflows.                                               | tbd    | [thinking-mode-services.info.md](thinking-mode-services/info.md)           |
| Muscle Memory Mode Services | Services for fast, repeated, operational, or learned execution workflows.                                                                   | tbd    | [muscle-memory-mode-services.info.md](muscle-memory-mode-services/info.md) |
| Shared Services             | Cross-cutting platform services used by multiple subsystems.                                                                                | tbd    | [shared-services](shared-services/)                                        |
| Execution Mode Services     | Application clusters for DT worker deployments, tenant workflow code hosting, the Agent Success UI, the coding service and event ingestion. | active | [execution-mode-services](execution-mode-services/info.md)                 |

## Info File Shape

Every `info.md` should follow this order:

1. YAML front matter with stable metadata.
2. A one-paragraph summary.
3. A compact index table for child services or subsystem contents.
4. Links to related features, builds, release candidates, and detailed docs.

For example:

```markdown
---
name: Context Cluster
kind: service
description: Context orchestration service for Mark 2 workflows.
part_of_subsystem: thinking-mode-services
primary_owner: tbd
github_repo: tbd
status: not-being-developed
---

# Context Cluster

Short description.

## Index

| Name | Kind | Description | Status | Link |
| --- | --- | --- | --- | --- |
| Context Cluster HLD | doc | High-level design. | draft | [hld](../../builds/m2-o(mark-2-overall)/services-affected/context-cluster/hld.md) |
```
