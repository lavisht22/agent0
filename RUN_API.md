# RUN API Documentation

## Overview

The RUN API (`/api/v1/run`) is a production-ready endpoint that allows downstream applications to execute agents using API key authentication.
## Endpoint

```
POST /api/v1/run
```

## Authentication

The API requires an API key to be passed in the request header:

```
x-api-key: <your-api-key>
```

## Request Body

```json
{
  "agent_id": "string (required)",
  "environment": "staging" | "production" (optional, default: "production"),
  "variables": {
    "key": "value"
  },
  "stream": boolean (optional, default: false),
  "overrides": {
    "model": {
      "provider_id": "string (optional)",
      "name": "string (optional)"
    },
    "maxOutputTokens": number (optional),
    "temperature": number (optional),
    "maxStepCount": number (optional),
    "providerOptions": {
      "openai": { "reasoningEffort": "minimal" | "low" | "medium" | "high", "reasoningSummary": "auto" | "detailed" },
      "xai": { "reasoningEffort": "low" | "medium" | "high" },
      "google": { "thinkingConfig": { "thinkingBudget": number, "thinkingLevel": "low" | "medium" | "high", "includeThoughts": boolean } }
    }
  },
  "extra_messages": [
    { "role": "user", "content": "..." }
  ]
}
```

### Parameters

- **agent_id** (required): The ID of the agent to run
- **environment** (optional): Which deployed version to run - `"staging"` or `"production"`. Defaults to `"production"` for backward compatibility
- **variables** (optional): Key-value pairs to replace variables in the agent's messages
- **stream** (optional): Whether to stream the response (true) or return complete messages at the end (false)
- **overrides** (optional): Runtime configuration overrides for the model
  - **model.provider_id**: Override the provider to use
  - **model.name**: Override the model name
  - **maxOutputTokens**: Override the maximum output tokens
  - **temperature**: Override the temperature setting
  - **maxStepCount**: Override the maximum step count
  - **providerOptions**: Provider-specific options for reasoning/thinking
    - For OpenAI/Azure: `{ openai: { reasoningEffort: 'minimal' | 'low' | 'medium' | 'high', reasoningSummary: 'auto' | 'detailed' } }`
      - `reasoningSummary: 'auto'` returns a condensed summary; `'detailed'` returns comprehensive reasoning. When enabled, reasoning summaries appear in the stream as events with type `'reasoning'`.
    - For xAI: `{ xai: { reasoningEffort: 'low' | 'medium' | 'high' } }`
    - For Google/Vertex: `{ google: { thinkingConfig: { thinkingBudget?: number, thinkingLevel?: 'low' | 'medium' | 'high', includeThoughts?: boolean } } }` (use either thinkingBudget OR thinkingLevel, not both)
  - **extra_messages** (optional): Array of messages to append to the agent's prompt (used as-is, no variable substitution)

## Response

### Streaming Response (stream: true)

When streaming is enabled, the API returns Server-Sent Events (SSE) with the following format:

```
Content-Type: text/event-stream

data: {"type":"start-step",...}

data: {"type":"text-delta","text":"Hello"}

...
```

### Non-Streaming Response (stream: false)

When streaming is disabled, the API returns a JSON object with the complete messages array:

```json
{
  "messages": [
    {
      "role": "assistant",
      "content": "Complete response text here"
    }
  ]
}
```

## Access Control

The API performs the following checks:

1. **API Key Validation**: Verifies that the API key exists in the database
2. **Workspace Access**: Ensures the agent belongs to the same workspace as the API key
3. **Deployed Version**: Only runs agents that have a deployed version in the requested environment (defaults to production)

## Error Responses

### 400 Bad Request
- Missing agent_id
- Invalid agent configuration

```json
{
  "message": "agent_id is required"
}
```

### 401 Unauthorized
- Missing or invalid API key

```json
{
  "message": "API key is required"
}
```

### 403 Forbidden
- API key doesn't have access to the agent

```json
{
  "message": "Access denied to this agent"
}
```

### 404 Not Found
- Agent not found
- No deployed version found
- Provider not found

```json
{
  "message": "No deployed version found for this agent"
}
```

### 500 Internal Server Error
- Error processing the agent run

```json
{
  "message": "Error processing agent run"
}
```

## Example Usage

### cURL Example (Non-Streaming)

```bash
curl -X POST https://your-domain.com/api/v1/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "agent_id": "agent-123",
    "variables": {
      "user_name": "John",
      "topic": "AI"
    },
    "stream": false
  }'
```

### cURL Example (Staging Environment)

```bash
curl -X POST https://your-domain.com/api/v1/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "agent_id": "agent-123",
    "environment": "staging",
    "variables": {
      "user_name": "John"
    }
  }'
```

### cURL Example (With Overrides)

```bash
curl -X POST https://your-domain.com/api/v1/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "agent_id": "agent-123",
    "variables": {
      "user_name": "John"
    },
    "overrides": {
      "model": {
        "name": "gpt-4o-mini"
      },
      "temperature": 0.7,
      "maxOutputTokens": 500
    }
  }'
```

### cURL Example (With Provider Options)

```bash
curl -X POST https://your-domain.com/api/v1/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "agent_id": "agent-123",
    "overrides": {
      "providerOptions": {
        "openai": {
          "reasoningEffort": "high",
          "reasoningSummary": "auto"
        }
      }
    }
  }'
```

### cURL Example (Streaming)

```bash
curl -X POST https://your-domain.com/api/v1/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "agent_id": "agent-123",
    "variables": {
      "user_name": "John",
      "topic": "AI"
    },
    "stream": true
  }'
```

### JavaScript/TypeScript Example

```typescript
// Non-streaming
const response = await fetch('https://your-domain.com/api/v1/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key-here'
  },
  body: JSON.stringify({
    agent_id: 'agent-123',
    variables: {
      user_name: 'John',
      topic: 'AI'
    },
    stream: false
  })
});

const data = await response.json();
console.log(data.messages);

// Streaming
const response = await fetch('https://your-domain.com/api/v1/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key-here'
  },
  body: JSON.stringify({
    agent_id: 'agent-123',
    variables: {
      user_name: 'John',
      topic: 'AI'
    },
    stream: true
  })
});

// Process streaming response
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      console.log(data);
    }
  }
}
```