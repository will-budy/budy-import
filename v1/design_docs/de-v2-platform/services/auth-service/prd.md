---
name: Auth & Permissions Service — PRD
code: auth-service-prd
version: 0.1
status: draft
last_updated: 2026-04-11
---

# Auth & Permissions Service — Product Requirements

## Purpose

Centralised application-level identity and permission enforcement for all de-v2 agents and services. This service sits between the existing infrastructure-level identity (IRSA → AWS IAM for cloud resources) and the business-level decisions about what an agent is allowed to do. It issues short-lived scoped JWTs for specific operations, maintains fine-grained permission policies per agent per tenant, and integrates with the Temporal approval workflow for permission escalation.

Without this service, permission enforcement is scattered across JSONB columns in `agent_registry` with no runtime validation layer, no audit trail, and no escalation path — all of which become critical gaps as agents gain more capabilities and client data access.

## Why not just IRSA?

IRSA (K8s ServiceAccount → AWS IAM role) gives each agent pod a cloud identity for AWS service access (S3 reads, RDS Proxy auth). It does not answer application-level questions: Can this agent send an email to an external recipient on behalf of this tenant? Can it trigger this specific v1 mission? Can it read another agent's memory? Can it execute code in a sandbox with network egress? These decisions require a policy layer that understands agent identity, tenant boundaries, and operation scope.

## Consumers

- **Agent Workers**: request on-demand JWTs before performing privileged operations
- **Sandbox Service 1**: validates agent JWT before accepting an execution request
- **Skill Service**: validates that the proposing agent has permission to propose skills
- **Memory Service**: enforces tenant-scoped memory access
- **Comms Gateway 1**: validates outbound response permissions
- **Platform Operators**: manage permission policies and review escalation requests

## Core Responsibilities

- Maintain permission policies per agent per tenant in PostgreSQL (static permissions + escalation history)
- Issue short-lived scoped JWTs for specific operations (signed via Vault-managed key, short TTL — typically 5–15 minutes)
- Validate JWT claims on request (other services call an Auth activity to validate tokens)
- Handle permission escalation: when an agent requests a permission beyond its static set, trigger a Temporal approval workflow → notify human via Slack → wait for signal → issue JWT on approval
- Maintain an immutable audit log of all permission requests, grants, and denials
- Support A2A token issuance format from day 1 (so Comms Gateway 1 can issue A2A-compatible auth tokens when A2A is activated in Phase 4 without rearchitecting auth)

## What It Is NOT Responsible For

- AWS cloud identity (that is IRSA + K8s ServiceAccount — unchanged)
- Human user auth (there is no human-facing login — operators interact via Slack signals)
- TLS/mTLS between services (that is Istio — unchanged)
- Rate limiting (that is LiteLLM for LLM calls, KEDA for workers, Ingress for gateway)

## Permission Tiers

| Tier | Description | How granted |
|------|-------------|-------------|
| **Static** | Permissions the agent always holds, defined in `agent_registry.permissions` | Set at agent creation, updated via registry approval workflow |
| **On-demand scoped** | Short-lived JWT for a specific operation, within the agent's static permission set | Issued immediately by Auth Service — no human review needed |
| **Escalated** | Permission not in the agent's static set — requires human approval | Temporal approval workflow: Slack notification → human signal → JWT issued |

## Success Criteria

- Every privileged operation in the platform is gated by a JWT validated through the Auth Service
- Permission escalation requests are visible to operators in Slack within 30 seconds
- Audit log covers 100% of permission requests (granted and denied) with agent ID, tenant ID, operation, timestamp, outcome
- No cross-tenant data access possible through an agent JWT (tenant isolation enforced at token level)
- A2A-compatible token format available without breaking changes when A2A is activated

## Open Questions

1. JWT signing: single Vault-managed symmetric key (simpler) or per-tenant asymmetric key pair (stronger isolation, more complex)?
2. Token revocation: Redis revocation list (immediate) or short enough TTL to not bother (5 min max)?
3. At what operation granularity do we define permissions? (`send_email` vs `send_email:external_domain` vs `send_email:domain:recipient`)?
4. Should static permissions live in `agent_registry` or move entirely into the Auth Service's own policy store?
