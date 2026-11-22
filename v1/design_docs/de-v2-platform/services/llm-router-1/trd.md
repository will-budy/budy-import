---
name: LLM Router 1 — TRD
code: llm-router-1-trd
version: 0.1
status: stub — detailed design pending
last_updated: 2026-04-11
---

# LLM Router 1 — Technical Reference Document

> ⚠️ This document is a stub. Detailed technical design to be completed in a dedicated design thread per service.

## Implementation Language & Framework

### Decided:

- **Service**: LiteLLM Proxy (Python, open-source)
- **Version**: 1.x (latest stable)
- **Deployment**: Docker container, no custom code modifications
- **Config**: YAML + environment variables (no Python code changes)
- **Dependencies**: python-dotenv, redis, pydantic, opentelemetry-sdk

## Configuration

### Environment variables:

```bash
# LiteLLM proxy config
LITELLM_LOG_LEVEL=INFO
LITELLM_LOG_FORMAT=json

# Provider API keys (from Vault)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Redis for budget tracking
REDIS_ADDR=redis:6379
REDIS_DB=0

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://prometheus:4317
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_ENABLED=true

# Budget config
BUDGET_MODE=redis  # Track budgets in Redis
BUDGET_CHECK_ON_START=true

# Proxy listening
HOST=0.0.0.0
PORT=8000
```

[TODO: Define all configuration options, validation, and defaults]

## Model Configuration

**litellm_config.yaml** (mounted via ConfigMap):

```yaml
model_list:
  # Agent reasoning tier (expensive, for complex tasks)
  - model_name: "agent-reasoning"
    litellm_params:
      model: "claude-3-5-opus-20241022"
      api_base: "https://api.anthropic.com/v1"
      api_key: "${ANTHROPIC_API_KEY}"

  # Agent coding tier (mid-tier, for structured output)
  - model_name: "agent-coding"
    litellm_params:
      model: "claude-3-5-sonnet-20241022"
      api_key: "${ANTHROPIC_API_KEY}"

  # Agent fast tier (cheap, for classification and extraction)
  - model_name: "agent-fast"
    litellm_params:
      model: "claude-3-5-haiku-20241022"
      api_key: "${ANTHROPIC_API_KEY}"
    fallback:
      - model_name: "gpt-4o-mini"
        litellm_params:
          model: "gpt-4o-mini"
          api_key: "${OPENAI_API_KEY}"

general:
  completion_max_tokens: 4096
  context_window_fallback: true
  disable_streaming_default: false
  allowed_fails: 3
```

[TODO: Complete model configuration with all tiers, fallback chains, and timeout settings]

## Budget Configuration

### Per-agent monthly budget caps (stored in PostgreSQL agent_registry or config):

```python
AGENT_BUDGETS = {
    "support-agent": 2000,      # $20/month
    "report-agent": 500,         # $5/month
    "usercall-agent": 1000,      # $10/month
    "default": 500               # $5/month for unknown agents
}
```

### Budget tracking in Redis:

```text
budget:{agent_id}:{YYYY-MM} -> cost_cents (int)
TTL: 30 days (auto-cleanup)
```

[TODO: Define budget enforcement logic, alert thresholds, and escalation policy]

## API Endpoints

### `POST /v1/chat/completions`

### Request format (OpenAI-compatible):

```json
{
  "model": "agent-reasoning",     // OR "agent-coding", "agent-fast"
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "top_p": 0.9,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "skill_name",
        "description": "...",
        "parameters": { ... }
      }
    }
  ],
  // Custom header for budget tracking:
  // X-Agent-ID: support-agent-v1
}
```

### Response format:

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "claude-3-5-opus-20241022",
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  },
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "..."
      },
      "finish_reason": "end_turn"
    }
  ]
}
```

### Error responses:

- `400 Bad Request`: Invalid model or format
- `401 Unauthorized`: Missing or invalid API key
- `429 Too Many Requests`: Rate limited (by provider or LLM Router 1)
- `429 Payment Required` (custom): Budget exceeded
- `500 Internal Server Error`: Proxy error
- `503 Service Unavailable`: Provider unavailable, fallback attempted

[TODO: Define all error codes and response formats]

### `GET /health`

### Response:

```json
{
  "status": "healthy",
  "timestamp": "2026-04-11T12:34:56Z"
}
```

### `GET /models`

### Response:

```json
{
  "data": [
    {
      "id": "agent-reasoning",
      "object": "model",
      "owned_by": "budy"
    },
    {
      "id": "agent-coding",
      "object": "model",
      "owned_by": "budy"
    },
    {
      "id": "agent-fast",
      "object": "model",
      "owned_by": "budy"
    }
  ]
}
```

[TODO: Define full OpenTelemetry trace spans and custom headers]

## Observability

### Prometheus metrics (OpenTelemetry export):

```text
# Request counters
litellm_requests_total{model="agent-reasoning",status="success"} 1000
litellm_requests_total{model="agent-reasoning",status="error"} 5
litellm_requests_total{model="agent-fast",status="fallback"} 10

# Latency histograms
litellm_request_duration_seconds_bucket{model="agent-reasoning",le="1"} 500
litellm_request_duration_seconds_bucket{model="agent-reasoning",le="5"} 950
litellm_request_duration_seconds_bucket{model="agent-reasoning",le="30"} 1000

# Token usage
litellm_tokens_used_total{model="agent-reasoning",type="input"} 100000
litellm_tokens_used_total{model="agent-reasoning",type="output"} 50000

# Cost tracking
litellm_cost_total{agent_id="support-agent",model="agent-reasoning"} 15.50
litellm_cost_total{agent_id="report-agent",model="agent-fast"} 2.30

# Budget enforcement
litellm_budget_exceeded_total{agent_id="support-agent"} 3
litellm_fallback_triggered_total{model="agent-fast"} 5
```

### Structured logging (JSON to stdout):

```json
{
  "timestamp": "2026-04-11T12:34:56Z",
  "level": "INFO",
  "message": "LLM request completed",
  "agent_id": "support-agent",
  "model": "agent-reasoning",
  "status_code": 200,
  "latency_ms": 1234,
  "input_tokens": 100,
  "output_tokens": 50,
  "cost_cents": 150,
  "finish_reason": "end_turn"
}
```

[TODO: Define alerting rules for budget overages, provider errors, and latency anomalies]

## Performance Characteristics

### Targets:

- Proxy latency (overhead): < 50ms p50
- Provider latency (Anthropic): < 5s p50, < 30s p99
- Provider latency (OpenAI): < 3s p50, < 20s p99
- Total end-to-end: < 5.5s p50 (Anthropic), < 3.1s p50 (OpenAI)
- Fallback latency increase: < 1s (network latency only, no additional processing)
- Proxy throughput: 1,000+ requests/s per replica

[TODO: Define load testing strategy and performance SLAs]

## Testing Strategy

[TODO: Load testing with k6 or locust simulating realistic agent traffic; integration tests with test API keys]

- Unit: Budget enforcement logic
- Load: 1,000 req/s per replica, verify no latency degradation
- Integration: Fallback routing when provider unavailable
- E2e: Full request cycle with real API keys (in staging)

## Deployment Configuration

[TODO: K8s Deployment with ConfigMap for litellm_config.yaml]

```yaml
# deployment.yaml (stub)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-router-1
  namespace: de-v2-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: llm-router-1
  template:
    metadata:
      labels:
        app: llm-router-1
    spec:
      serviceAccountName: llm-router-1
      containers:
      - name: proxy
        image: litellm:latest
        ports:
        - containerPort: 8000
          name: http
        env:
        - name: LITELLM_LOG_LEVEL
          value: INFO
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: llm-router-1-secrets
              key: anthropic-api-key
        # ... other env vars
        volumeMounts:
        - name: config
          mountPath: /app/litellm_config.yaml
          subPath: litellm_config.yaml
        resources:
          requests:
            memory: 512Mi
            cpu: 200m
          limits:
            memory: 1Gi
            cpu: 500m
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 10
      volumes:
      - name: config
        configMap:
          name: llm-router-1-config

---
apiVersion: v1
kind: Service
metadata:
  name: llm-router-1
  namespace: de-v2-platform
spec:
  selector:
    app: llm-router-1
  ports:
  - name: http
    port: 8000
    targetPort: 8000
  type: ClusterIP

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: llm-router-1-config
  namespace: de-v2-platform
data:
  litellm_config.yaml: |
    model_list:
      # ... model configuration
```

[TODO: Complete Helm chart, HPA/KEDA config, network policies, secrets management]

## Budget Enforcement Logic

[TODO: Implement as LiteLLM pre-call and post-call callbacks]

```python
async def pre_call_budget_check(
    model: str,
    messages: List[Dict],
    agent_id: Optional[str] = None,
    **kwargs
) -> bool:
    """Check if agent has budget before making call"""
    if not agent_id:
        return True  # Skip budget check if no agent ID
    
    budget_cap = AGENT_BUDGETS.get(agent_id, 500)  # cents
    month_key = f"budget:{agent_id}:{YYYY-MM}"
    current_cost = redis.get(month_key) or 0
    
    # Estimate cost (rough heuristic: 100 tokens ≈ 0.01 USD = 1 cent for Haiku)
    estimated_tokens = sum(len(msg['content'].split()) for msg in messages) * 2
    estimated_cost = estimate_cost(model, estimated_tokens)
    
    if current_cost + estimated_cost > budget_cap:
        log.error(f"Budget exceeded for {agent_id}", extra={
            "agent_id": agent_id,
            "current_cost": current_cost,
            "estimated_cost": estimated_cost,
            "budget_cap": budget_cap
        })
        return False
    
    return True

async def post_call_cost_update(
    model: str,
    response: Dict,
    agent_id: Optional[str] = None,
    **kwargs
):
    """Record actual cost after call completes"""
    if not agent_id:
        return
    
    actual_cost = calculate_cost(model, response['usage'])
    month_key = f"budget:{agent_id}:{YYYY-MM}"
    redis.incr(month_key, actual_cost)
    redis.expire(month_key, 30 * 24 * 60 * 60)  # 30-day TTL
    
    metrics.record_cost(agent_id, model, actual_cost)
```

[TODO: Define cost calculation formulas per model, refresh Vault API keys on rotation]
