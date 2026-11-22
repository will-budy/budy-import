---
name: Skill Service — Nexus Contracts
code: skill-service-nexus
version: 0.1
status: draft — to be finalized in TRD
last_updated: 2026-04-11
---

# Skill Service — Nexus Contracts

> These are the Temporal Nexus operations Skill Service exposes and consumes. TypeScript interface definitions are indicative — finalize in TRD.

## Operations Exposed

### skill.getForAgent

**Called by:** Agent Workers (in tenant namespaces, at bootstrap and during task execution)

**Description:** Fetch all approved skills assigned to a specific agent. Used at agent initialization and cached in Redis for the duration of the agent's running time.

### Input:

```typescript
interface GetForAgentInput {
  agent_id: string;
  tenant_id: string;
  version?: "latest" | "cached";  // "cached" for init (use cached if available), "latest" for live refresh
}
```

### Output:

```typescript
interface GetForAgentOutput {
  skills: Array<{
    id: string;
    name: string;
    version: number;
    content: string;            // SKILL.md format
    description?: string;
    required_permissions?: string[];
    resources?: {
      scripts?: Array<{ name: string; s3_uri: string }>;
      templates?: Array<{ name: string; s3_uri: string }>;
    };
  }>;
}
```

### skill.get

**Called by:** Agents or operators (retrieve specific skill details)

**Description:** Fetch a specific skill by ID and optional version.

### Input:

```typescript
interface GetInput {
  skill_id: string;
  version?: number;  // default: latest approved
  include_history?: boolean;  // default: false
}
```

### Output:

```typescript
interface GetOutput {
  skill: {
    id: string;
    name: string;
    version: number;
    status: "approved" | "deprecated";
    content: string;
    created_at: string;
    approved_at: string;
    resources?: { ... };
  };
}
```

### skill.propose

**Called by:** Developers/agents (submit new skill proposals)

**Description:** Submit a new skill or modified version for approval. Skill enters 'draft' status initially, then moves to 'pending_approval' before admin review.

### Input:

```typescript
interface ProposeInput {
  agent_id: string;         // Proposer identity
  tenant_id: string;
  name: string;
  content: string;          // SKILL.md format
  metadata: {
    description?: string;
    required_permissions?: string[];
    tags?: string[];
    replaces_skill_id?: string;  // If updating existing skill
  };
}
```

### Output:

```typescript
interface ProposeOutput {
  skill_id: string;
  status: "draft";
  proposed_at: string;      // ISO8601
}
```

## Operations Consumed

**None.** Skill Service does not call other Nexus operations. It is a provider service.

## Notes

- **Skill Format**: Skills are SKILL.md documents — structured text with metadata YAML frontmatter and markdown content. See platform documentation for format spec.
- **Approval Gate**: All new and modified skills must be approved by an admin before they become available to agents. Approval happens via Slack workflow with LLM-generated summary.
- **Versioning**: Skills are versioned. Agents can be pinned to specific versions or auto-update to latest. Current version is the one with highest version number and status='approved'.
- **Large Resources**: Skill metadata can reference S3 URIs for large files (scripts, templates). Agents download these at task time if needed.
- **Caching**: Agent skill lists are cached in Redis after first retrieval. Cache invalidated on skill approval or assignment change. Init containers use "cached" version; live agent operations may request "latest".
- **Multi-tenancy**: All operations require `tenant_id`. Strict isolation: skills from one tenant should never be visible to another.
- **SLA**: Skill operations should complete within:
  - `getForAgent`: < 100ms (cached) or < 500ms (cold)
  - `get`: < 100ms
  - Approval workflow: < 24h (business hours)
