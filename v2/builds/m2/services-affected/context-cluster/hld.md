---
name: Context Service Mark 2 Upgrade — HLD
code: context-service-mark-2-upgrade-hld
version: 0.1
status: draft
last_updated: 2026-05-22
---

# Context Service Mark 2 Upgrade — High Level Design

## Overview

Extends Context Service to support Thinking Mode history, report-change state, and review memory.

## Responsibilities

Stores and retrieves call summaries, manager intent, clarifications, draft decisions, review outcomes, and publish history.

## Architecture Diagram

Placeholder for Thinking Mode services reading and writing Mark 2 context.

## Interfaces

Placeholder for context read/write contracts and retention policies.

## Key Flows

Placeholder for intake context write, draft context lookup, review history lookup, and publish audit write.

## Dependencies

Placeholder for Thinking Mode Orchestrator, Teams Call Intake, Report Redesign, Customer Success Review, and storage systems.

## Design Decisions Log

| Question | Resolution |
|----------|------------|
| Should all Thinking Mode history become structured context? | No, only structured information with an immediate operational use should be promoted. |

## Open Questions / TRD Scope

- What Mark 2 context is raw history versus structured operational memory?
