---
name: Memory Service — Nexus Contracts
code: memory-service-nexus
version: 0.1
status: draft — to be finalized in TRD
last_updated: 2026-04-11
---

# Memory Service — Nexus Contracts

> These are the Temporal Nexus operations Memory Service exposes and consumes. TypeScript interface definitions are indicative — finalize in TRD.

## Operations Exposed

### memory.store

**Called by:** Agent Workers (in tenant namespaces)

**Description:** Store an episodic memory of a conversation turn. Every agent task completion should call this to persist context for future consolidation and retrieval.

### Input:

```typescript
interface StoreInput {
  agent_id: string;
  tenant_id: string;
  episode: {
    message: string;           // User message
    response: string;          // Agent response
    tools_used?: string[];     // Tools/skills invoked
    outcome: "success" | "partial" | "failed";
    thread_id?: string;
    timestamp?: string;        // ISO8601, defaults to now
  };
}
```

### Output:

```typescript
interface StoreOutput {
  memory_id: string;
  stored_at: string;  // ISO8601
}
```

### memory.search

**Called by:** Agent Workers (in loadContext activity)

**Description:** Semantic search over episodic and semantic memories. Finds relevant past interactions for context loading.

### Input:

```typescript
interface SearchInput {
  agent_id: string;
  tenant_id: string;
  query: string;                // User/agent query for semantic search
  top_k?: number;               // default 5
  include_episodic?: boolean;   // default true
  include_semantic?: boolean;   // default true
}
```

### Output:

```typescript
interface SearchOutput {
  memories: Array<{
    id: string;
    type: "episodic" | "semantic";
    content: string;
    similarity_score: number;   // 0–1, higher is more similar
    created_at: string;         // ISO8601
  }>;
}
```

### memory.getCore

**Called by:** Agent Workers (in loadContext activity, or init container)

**Description:** Fetch human-approved core memories for this agent. These are long-term facts and learnings the agent should always consider.

### Input:

```typescript
interface GetCoreInput {
  agent_id: string;
  tenant_id: string;
}
```

### Output:

```typescript
interface GetCoreOutput {
  core_memories: Array<{
    id: string;
    fact: string;
    approved_at: string;        // ISO8601
    expires_at?: string;        // Optional: memory expiration date
  }>;
}
```

### memory.getSessionContext

**Called by:** Agent Workers (optional, for multi-turn thread context)

**Description:** Fetch recent conversation history for a thread. Useful for loading context when resuming a conversation.

### Input:

```typescript
interface GetSessionContextInput {
  thread_id: string;
  tenant_id: string;
  limit?: number;               // default 10, max recent messages
  max_size_kb?: number;         // default 50, max total size
}
```

### Output:

```typescript
interface GetSessionContextOutput {
  history: string;              // Formatted conversation text
  message_count: number;
  oldest_at: string;            // ISO8601 of oldest message in window
}
```

## Operations Consumed

**None.** Memory Service does not call other Nexus operations. It is a provider service.

## Notes

- **Consolidation Trigger**: When Memory Service's consolidation workflow detects a high-importance fact, it may trigger a Core Memory Approval Workflow (internal to Memory Service, not exposed as external operation).
- **Idempotency**: Memory storage should be idempotent. If `memory.store` is called multiple times with same episode data, only one record should be created (or duplicates should be harmless).
- **Caching**: Core memories are cached in Redis. After a core memory approval, the cache should be invalidated so agents see the new memory on next lookup.
- **Multi-tenancy**: All operations require `tenant_id`. Strict isolation: memories from one tenant should never be returned to another.
- **Vector Search**: Memory search is powered by pgvector and semantic embeddings. Similarity scores range 0–1; higher is more relevant.
- **SLA**: Memory operations should complete within SLAs:
  - `store`: < 100ms
  - `search`: < 500ms p50
  - `getCore`: < 50ms (from Redis cache)
  - `getSessionContext`: < 200ms
