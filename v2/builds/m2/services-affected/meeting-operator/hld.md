---
name: Authentication Service Mark 2 Upgrade — HLD
code: authentication-service-mark-2-upgrade-hld
version: 0.1
status: draft
last_updated: 2026-05-22
---

# Authentication Service Mark 2 Upgrade — High Level Design

## Overview

Extends Authentication Service to enforce manager, Customer Success, and DT permissions across Mark 2 workflows.

## Responsibilities

Authorizes manager report-change requests, Customer Success review actions, and DT publish attempts.

## Architecture Diagram

Placeholder for permission checks across intake, review, and publish flows.

## Interfaces

Placeholder for authorization check, actor identity, approval proof, and publish permission contracts.

## Key Flows

Placeholder for manager intake authorization, Customer Success approval authorization, and publish authorization.

## Dependencies

Placeholder for identity store, tenant bindings, Thinking Mode services, and Muscle Memory Publisher Service.

## Design Decisions Log

| Question | Resolution |
|----------|------------|
| Can a DT publish without manager approval? | No, publish requires manager approval and authorized DT action. |

## Open Questions / TRD Scope

- What permission model distinguishes manager direction, Customer Success review, and DT publish authority?
