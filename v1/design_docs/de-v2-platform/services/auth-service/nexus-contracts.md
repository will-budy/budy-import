---
name: Auth & Permissions Service — Nexus Contracts
code: auth-service-nexus
version: 0.1
status: draft — to be finalized in TRD
last_updated: 2026-04-11
---

# Auth & Permissions Service — Nexus Contracts

> These are the Temporal Nexus operations the Auth Service exposes in the `platform` shared namespace. All other de-v2 services that perform privileged operations call these before proceeding.

## Operations Exposed

### `auth.requestPermission`

**Called by:** Agent Workers (before any privileged operation), Skill Service (before accepting a skill proposal), Sandbox Service 1 (indirectly — agents request permission before calling sandbox)

**Description:** Check whether `agent_id` holds `permission` within `tenant_id`. If yes, issue and return a short-lived scoped JWT. If no and escalation is appropriate, start an escalation workflow and return the workflow ID (agent activity will wait until the escalation resolves). If explicitly denied, return an error immediately.

### Input:

```typescript
interface RequestPermissionInput {
  agent_id: string;
  tenant_id: string;
  permission: string;       // e.g. "sandbox:execute:code", "send_email:external", "trigger_v1_mission:mission_id"
  context?: string;         // Agent-provided reason — shown to human in escalation review
  ttl_seconds?: number;     // Override default (300s). Max: 900s.
}
```

### Output (success — permission held):

```typescript
interface PermissionGranted {
  outcome: "granted";
  token: string;            // Signed JWT — pass to target service
  expires_at: string;       // ISO timestamp
  jti: string;              // Token ID (for logging / revocation reference)
}
```

### Output (escalation needed — permission not in static set):

```typescript
interface PermissionEscalating {
  outcome: "escalating";
  escalation_workflow_id: string;
  // The calling activity should set a long timeout and wait.
  // The escalation workflow will signal back with grant or denial.
}
```

### Output (denied):

```typescript
interface PermissionDenied {
  outcome: "denied";
  reason: string;
}
```

---

### `auth.validateToken`

**Called by:** Sandbox Service 1, Memory Service, Skill Service, Comms Gateway 1 outbound — any service that receives a JWT from an agent and needs to verify it before acting.

**Description:** Validate a JWT previously issued by `auth.requestPermission`. Checks signature, expiry, revocation list, and that the token's `permissions` include `required_permission` for the given `tenant_id`.

### Input:

```typescript
interface ValidateTokenInput {
  token: string;
  required_permission: string;
  tenant_id: string;
}
```

### Output:

```typescript
interface ValidateTokenOutput {
  valid: boolean;
  agent_id?: string;        // Populated if valid
  expires_at?: string;      // Populated if valid
  reason?: string;          // Populated if invalid (expired, revoked, wrong permission, wrong tenant)
}
```

---

### `auth.revokeToken`

**Called by:** Platform operators (via admin workflow or manual signal), incident response automation

**Description:** Add a JTI to the revocation list immediately. All subsequent `validateToken` calls for this JTI will return `{ valid: false }`. Use for emergency cases only — normal token expiry handles the routine lifecycle.

### Input:

```typescript
interface RevokeTokenInput {
  jti: string;
  reason: string;
  revoked_by: string;   // operator ID
}
```

**Output:** `void` (error on failure)

---

### `auth.listPermissions`

**Called by:** Comms Router 1 (to check what an agent is allowed to do before dispatching), Admin tooling

**Description:** Return the full permission policy for an agent — static permissions, denied permissions, and recent escalation history.

### Input:

```typescript
interface ListPermissionsInput {
  agent_id: string;
  tenant_id: string;
}
```

### Output:

```typescript
interface AgentPermissionSummary {
  agent_id: string;
  tenant_id: string;
  static_permissions: string[];
  denied_permissions: string[];
  recent_escalations: Array<{
    permission: string;
    status: string;
    decided_at?: string;
    grant_permanent: boolean;
  }>;
}
```

---

## Operations Consumed

The Auth Service consumes no Nexus operations from other services. It calls the Slack notification pathway (`gateway.sendResponse` or direct Slack API) for escalation notifications — this is a direct HTTP call to the Slack API, not a Nexus operation, since it originates from an approval workflow.

## Permission String Taxonomy

The working format is `resource:action:qualifier` (qualifier is optional). Examples:

| Permission String | Meaning |
|------------------|---------|
| `slack:read` | Read messages from Slack |
| `slack:send` | Send messages to Slack |
| `email:read` | Read incoming emails |
| `email:send:internal` | Send email within the organization domain |
| `email:send:external` | Send email to external recipients |
| `sandbox:execute:code` | Run code in the code execution sandbox |
| `sandbox:execute:browser` | Run browser sessions in sandbox |
| `sandbox:execute:v1-test` | Run v1 workflow tests in sandbox |
| `v1:trigger:mission:{mission_id}` | Trigger a specific v1 mission via v1 API Gateway |
| `memory:read:{agent_id}` | Read another agent's memory (cross-agent) |
| `skill:propose` | Submit a new skill for approval |

> Exact taxonomy to be finalized in TRD. The `resource:action:qualifier` format is the convention.

## Notes

- All issued tokens are A2A-compatible by format (structured for future A2A AgentAuth use)
- Token TTL should be set to the minimum duration needed for the operation — not the maximum
- Services must validate tokens on EVERY call, not cache validation results (revocation must be effective immediately)
- Escalation workflow IDs follow the pattern `escalation-{agent_id}-{permission_hash}-{timestamp}` for traceability
