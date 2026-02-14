# Agent0 JavaScript SDK

The official JavaScript/TypeScript SDK for Agent0 - a powerful platform for building and deploying AI agents.

## Installation

Install the SDK using npm:

```bash
npm install agent0-js
```

Or using yarn:

```bash
yarn add agent0-js
```

Or using pnpm:

```bash
pnpm add agent0-js
```

## Quick Start

```typescript
import { Agent0 } from 'agent0-js';

// Initialize the client
const client = new Agent0({
  apiKey: 'your-api-key-here',
  baseUrl: 'https://app.agent0.com' // Optional, defaults to this value
});

// Run an agent
const response = await client.generate({
  agentId: 'your-agent-id',
  variables: {
    name: 'John',
    topic: 'AI agents'
  }
});

console.log(response.messages);
```

## Getting Your API Key

1. Log in to your [Agent0 dashboard](https://app.agent0.com)
2. Navigate to **API Keys**
3. Click **+ Create**
4. Copy the generated key and store it securely

> ⚠️ **Important**: Keep your API key secure and never commit it to version control. Use environment variables instead.

## Usage

### Initialize the Client

```typescript
import { Agent0 } from 'agent0-js';

const client = new Agent0({
  apiKey: process.env.AGENT0_API_KEY!,
  baseUrl: 'https://app.agent0.com' // Optional
});
```

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `apiKey` | `string` | Yes | - | Your Agent0 API key |
| `baseUrl` | `string` | No | `https://app.agent0.com` | The base URL for the Agent0 API |
| `environment` | `'staging' \| 'production'` | No | `'production'` | Default environment for all runs (can be overridden per-run) |

## Methods

### `generate(options: RunOptions): Promise<GenerateResponse>`

Execute an agent and get the complete response.

**Parameters:**

```typescript
interface RunOptions {
  agentId: string;                    // The ID of the agent to run
  environment?: 'staging' | 'production'; // Environment to run (default: 'production')
  variables?: Record<string, string>; // Variables to pass to the agent
  overrides?: ModelOverrides;         // Runtime model configuration overrides
  extraMessages?: Message[];          // Extra messages to append to the prompt
  extraTools?: CustomTool[];          // Additional custom tools to add at runtime
  mcpOptions?: Record<string, {      // Per-MCP server runtime options (keyed by MCP ID)
    headers?: Record<string, string>; // Custom HTTP headers to send with MCP requests
  }>;
}

interface CustomTool {
  title: string;                       // Unique title for the tool (lowercase with underscores)
  description: string;                // Description of what the tool does
  inputSchema?: Record<string, unknown>; // JSON Schema for the tool's parameters
}

interface ModelOverrides {
  model?: {                    // Override the model
    provider_id?: string;      // Override provider ID
    name?: string;             // Override model name
  };
  maxOutputTokens?: number;    // Override max output tokens
  temperature?: number;        // Override temperature
  maxStepCount?: number;       // Override max step count
  providerOptions?: ProviderOptions; // Provider-specific reasoning options
}

interface ProviderOptions {
  openai?: {
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
    reasoningSummary?: 'auto' | 'detailed';
  };
  xai?: {
    reasoningEffort?: 'low' | 'medium' | 'high';
  };
  google?: {
    thinkingConfig?: {
      thinkingBudget?: number;
      thinkingLevel?: 'low' | 'medium' | 'high';
      includeThoughts?: boolean;
    };
  };
}
```

**Returns:**

```typescript
interface GenerateResponse {
  messages: Message[];
}
```

**Example:**

```typescript
const response = await client.generate({
  agentId: 'agent_123',
  variables: {
    userInput: 'Tell me about AI',
    context: 'technical'
  }
});

console.log(response.messages);
```

### `stream(options: RunOptions): AsyncGenerator<TextStreamPart<ToolSet>>`

Execute an agent and stream the response in real-time.

**Parameters:**

Same as `generate()` method.

**Returns:**

An async generator that yields stream chunks as they arrive.

**Example:**

```typescript
const stream = client.stream({
  agentId: 'agent_123',
  variables: {
    query: 'What is the weather today?'
  }
});

for await (const chunk of stream) {
  if (chunk.type === 'text-delta') {
    process.stdout.write(chunk.textDelta);
  }
}
```

### `embed(options: EmbedOptions): Promise<EmbedResponse>`

Generate an embedding for a single text value.

**Parameters:**

Extends Vercel AI SDK's `embed` parameters. Only the `model` property is different:

```typescript
// All options from Vercel AI SDK's embed() are supported
// Only the model property uses Agent0's format:
type EmbedOptions = Omit<VercelEmbedOptions, 'model'> & {
  model: {
    provider_id: string;  // The provider ID (from your Agent0 providers)
    name: string;         // The embedding model name (e.g., 'text-embedding-3-small')
  };
};

// Common options include:
// - value: string           // The text to embed
// - maxRetries?: number     // Maximum number of retries
// - headers?: Record<string, string>
// - providerOptions?: {...} // Provider-specific options
// - experimental_telemetry?: {...}
// Plus any future options added to Vercel AI SDK!
```

**Returns:**

```typescript
interface EmbedResponse {
  embedding: number[];    // The embedding vector
}
```

**Example:**

```typescript
const result = await client.embed({
  model: {
    provider_id: 'your-openai-provider-id',
    name: 'text-embedding-3-small'
  },
  value: 'Hello, world!'
});

console.log('Embedding vector length:', result.embedding.length);
// Store or use the embedding for similarity search, etc.
```

### `embedMany(options: EmbedManyOptions): Promise<EmbedManyResponse>`

Generate embeddings for multiple text values in a single request.

**Parameters:**

Extends Vercel AI SDK's `embedMany` parameters. Only the `model` property is different:

```typescript
// All options from Vercel AI SDK's embedMany() are supported
// Only the model property uses Agent0's format:
type EmbedManyOptions = Omit<VercelEmbedManyOptions, 'model'> & {
  model: {
    provider_id: string;  // The provider ID (from your Agent0 providers)
    name: string;         // The embedding model name
  };
};

// Common options include:
// - values: string[]        // The texts to embed
// - maxRetries?: number     // Maximum number of retries
// - headers?: Record<string, string>
// - providerOptions?: {...} // Provider-specific options
// Plus any future options added to Vercel AI SDK!
```

**Returns:**

```typescript
interface EmbedManyResponse {
  embeddings: number[][]; // Array of embedding vectors (one per input value)
}
```

**Example:**

```typescript
const result = await client.embedMany({
  model: {
    provider_id: 'your-openai-provider-id',
    name: 'text-embedding-3-small'
  },
  values: [
    'First document to embed',
    'Second document to embed',
    'Third document to embed'
  ]
});

console.log('Number of embeddings:', result.embeddings.length);
result.embeddings.forEach((embedding, i) => {
  console.log(`Embedding ${i} length:`, embedding.length);
});
```

**Using Provider Options:**

Provider-specific options can be passed to customize embedding behavior:

```typescript
// Example: OpenAI with custom dimensions
const result = await client.embed({
  model: {
    provider_id: 'your-openai-provider-id',
    name: 'text-embedding-3-small'
  },
  value: 'Hello, world!',
  providerOptions: {
    openai: {
      dimensions: 256  // Reduce dimensions for smaller vectors
    }
  }
});

// Example: Google with task type
const googleResult = await client.embed({
  model: {
    provider_id: 'your-google-provider-id',
    name: 'text-embedding-004'
  },
  value: 'Search query text',
  providerOptions: {
    google: {
      taskType: 'RETRIEVAL_QUERY'  // Optimize for search queries
    }
  }
});
```

## Examples


### Basic Usage (Node.js)

```javascript
const { Agent0 } = require('agent0-js');

const client = new Agent0({
  apiKey: process.env.AGENT0_API_KEY
});

async function main() {
  try {
    const result = await client.generate({
      agentId: 'agent_123',
      variables: {
        name: 'Alice',
        task: 'summarize'
      }
    });

    console.log('Agent response:', result.messages);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

### Streaming with TypeScript

```typescript
import { Agent0 } from 'agent0-js';

const client = new Agent0({
  apiKey: process.env.AGENT0_API_KEY!
});

async function streamExample() {
  console.log('Agent response: ');

  const stream = client.stream({
    agentId: 'agent_123',
    variables: {
      prompt: 'Write a short story about robots'
    }
  });

  for await (const chunk of stream) {
    // Handle different chunk types
    switch (chunk.type) {
      case 'text-delta':
        process.stdout.write(chunk.textDelta);
        break;
      case 'tool-call':
        console.log('\nTool called:', chunk.toolName);
        break;
      case 'tool-result':
        console.log('\nTool result:', chunk.result);
        break;
    }
  }

  console.log('\n\nStream complete!');
}

streamExample();
```

### Embeddings for Semantic Search

Generate embeddings to power semantic search, similarity matching, or RAG (Retrieval-Augmented Generation) applications.

```typescript
import { Agent0 } from 'agent0-js';

const client = new Agent0({
  apiKey: process.env.AGENT0_API_KEY!
});

// Embed documents for a knowledge base
async function embedDocuments() {
  const documents = [
    'Machine learning is a subset of artificial intelligence.',
    'Neural networks are inspired by the human brain.',
    'Deep learning uses multiple layers of neural networks.',
  ];

  const result = await client.embedMany({
    model: {
      provider_id: 'your-openai-provider-id',
      name: 'text-embedding-3-small'
    },
    values: documents
  });

  // Store embeddings in your vector database
  result.embeddings.forEach((embedding, i) => {
    console.log(`Document ${i}: ${embedding.length} dimensions`);
    // vectorDB.insert({ text: documents[i], embedding });
  });
}

// Query with semantic search
async function semanticSearch(query: string) {
  const queryEmbedding = await client.embed({
    model: {
      provider_id: 'your-openai-provider-id',
      name: 'text-embedding-3-small'
    },
    value: query
  });

  // Use the embedding to find similar documents
  // const results = await vectorDB.search(queryEmbedding.embedding, { limit: 5 });
  console.log('Query embedding dimensions:', queryEmbedding.embedding.length);
}
```

### Using Variables


Variables allow you to pass dynamic data to your agents. Any variables defined in your agent's prompts will be replaced with the values you provide.

```typescript
// If your agent prompt contains: "Hello {{name}}, let's talk about {{topic}}"
const response = await client.generate({
  agentId: 'agent_123',
  variables: {
    name: 'Sarah',
    topic: 'machine learning'
  }
});
// Prompt becomes: "Hello Sarah, let's talk about machine learning"
```

### Staging and Production Environments

Agent0 supports deploying different versions of your agent to staging and production environments. This allows you to test changes before rolling them out to production.

The environment can be set at two levels with the following priority:
1. **Run-level** (highest priority): Set `environment` in `generate()` or `stream()` options
2. **Constructor-level**: Set `environment` when creating the `Agent0` client
3. **Default**: Falls back to `'production'`

```typescript
// Set default environment at constructor level
const stagingClient = new Agent0({
  apiKey: process.env.AGENT0_API_KEY!,
  environment: 'staging' // All runs will use staging by default
});

// This uses 'staging' from constructor
const response1 = await stagingClient.generate({
  agentId: 'agent_123',
  variables: { name: 'Test User' }
});

// Override constructor setting at run level
const response2 = await stagingClient.generate({
  agentId: 'agent_123',
  environment: 'production', // Overrides the constructor's 'staging'
  variables: { name: 'Real User' }
});

// Default client (no constructor environment) uses 'production'
const defaultClient = new Agent0({
  apiKey: process.env.AGENT0_API_KEY!
});

// This uses 'production' (the default)
const response3 = await defaultClient.generate({
  agentId: 'agent_123',
  variables: { name: 'User' }
});

// Run-level environment takes precedence
const response4 = await defaultClient.generate({
  agentId: 'agent_123',
  environment: 'staging',
  variables: { name: 'Test User' }
});
```

### Model Overrides

The `overrides` option allows you to dynamically configure the model at runtime. This is useful for:
- **Load Balancing**: Distribute requests across different providers
- **Fallbacks**: Switch to a backup model if the primary is unavailable  
- **A/B Testing**: Test different models with the same agent configuration
- **Cost Optimization**: Use cheaper models for non-critical requests

```typescript
// Override the model for a specific request
const response = await client.generate({
  agentId: 'agent_123',
  variables: { prompt: 'Hello world' },
  overrides: {
    model: { name: 'gpt-4o-mini' }, // Use a different model
    temperature: 0.5,               // Adjust temperature
    maxOutputTokens: 500            // Limit output length
  }
});

// Implement a simple fallback pattern
async function runWithFallback(agentId: string, variables: Record<string, string>) {
  try {
    return await client.generate({ agentId, variables });
  } catch (error) {
    // Fallback to a different provider/model
    return await client.generate({
      agentId,
      variables,
      overrides: {
        model: {
          provider_id: 'backup-provider-id',
          name: 'claude-3-haiku-20240307'
        }
      }
    });
  }
}
```

### Provider Options

The `providerOptions` option allows you to configure provider-specific reasoning and thinking behavior. Different providers have different options:

**OpenAI / Azure** - Use `reasoningEffort` to control how much reasoning the model does, and `reasoningSummary` to control whether the model returns its reasoning process:

```typescript
const response = await client.generate({
  agentId: 'agent_123',
  overrides: {
    providerOptions: {
      openai: {
        reasoningEffort: 'high', // 'minimal' | 'low' | 'medium' | 'high'
        reasoningSummary: 'auto' // 'auto' | 'detailed' - controls reasoning output
      }
    }
  }
});
```

- `reasoningSummary: 'auto'` - Returns a condensed summary of the reasoning process
- `reasoningSummary: 'detailed'` - Returns more comprehensive reasoning
- When enabled, reasoning summaries appear in the stream as events with type `'reasoning'` and in non-streaming responses within the `reasoning` field

**xAI (Grok)** - Use `reasoningEffort` to control reasoning:

```typescript
const response = await client.generate({
  agentId: 'agent_123',
  overrides: {
    providerOptions: {
      xai: {
        reasoningEffort: 'high' // 'low' | 'medium' | 'high'
      }
    }
  }
});
```

**Google Generative AI / Google Vertex** - Use `thinkingConfig` to control thinking (use either `thinkingLevel` or `thinkingBudget`, not both):

```typescript
// Using thinkingLevel (recommended for most cases)
const response = await client.generate({
  agentId: 'agent_123',
  overrides: {
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: 'high',     // 'low' | 'medium' | 'high'
          includeThoughts: true      // Include thinking in response
        }
      }
    }
  }
});

// OR using thinkingBudget (for fine-grained control)
const response = await client.generate({
  agentId: 'agent_123',
  overrides: {
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 8192,      // Number of thinking tokens
          includeThoughts: true
        }
      }
    }
  }
});
```

### Extra Messages

The `extraMessages` option allows you to programmatically append additional messages to the agent's prompt. These messages are used as-is without any variable substitution, making them ideal for:
- **Dynamic Context**: Add conversation history or context at runtime
- **Multi-turn Conversations**: Build chat applications by appending user/assistant turns
- **Retrieved Content**: Inject RAG results or retrieved documents

```typescript
// Add conversation history to the agent
const response = await client.generate({
  agentId: 'agent_123',
  variables: { topic: 'AI' },
  extraMessages: [
    { role: 'user', content: 'What is machine learning?' },
    { role: 'assistant', content: 'Machine learning is a subset of AI...' },
    { role: 'user', content: 'Tell me more about neural networks' }
  ]
});

// Inject retrieved context (RAG pattern)
const retrievedDocs = await searchDocuments(query);
const response = await client.generate({
  agentId: 'rag-agent',
  extraMessages: [
    { 
      role: 'user', 
      content: `Context:\n${retrievedDocs.join('\n')}\n\nQuestion: ${query}` 
    }
  ]
});
```

### Custom Tools (extraTools)

The `extraTools` option allows you to add custom tool definitions at runtime. These tools are merged with any tools defined in the agent configuration. Custom tools enable function calling without requiring an MCP server - the LLM will generate tool calls, but **execution must be handled externally** by your application.

This is useful for:
- **Dynamic Tool Injection**: Add context-specific tools at runtime
- **Function Calling Patterns**: Define tools that your application will execute
- **Hybrid Agents**: Combine MCP server tools with custom tools

```typescript
// Define custom tools for function calling
const response = await client.generate({
  agentId: 'agent_123',
  extraTools: [
    {
      title: 'get_weather',
      description: 'Get the current weather for a location',
      inputSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name or zip code'
          },
          units: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'Temperature units'
          }
        },
        required: ['location']
      }
    },
    {
      title: 'search_database',
      description: 'Search the company database for information',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results to return' }
        },
        required: ['query']
      }
    }
  ]
});

// The response may contain tool calls that your app needs to handle
for (const message of response.messages) {
  if (message.role === 'assistant') {
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        console.log('Tool called:', part.toolName);
        console.log('Arguments:', part.args);
        // Execute the tool and provide results back to the agent
      }
    }
  }
}
```

**Streaming with Custom Tools:**

```typescript
const stream = client.stream({
  agentId: 'agent_123',
  extraTools: [
    {
      title: 'lookup_user',
      description: 'Look up user information by ID',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string' }
        },
        required: ['userId']
      }
    }
  ]
});

for await (const chunk of stream) {
  if (chunk.type === 'tool-call') {
    console.log(`Tool ${chunk.toolName} called with:`, chunk.args);
  }
}
```

### MCP Custom Headers (`mcpOptions`)

If your MCP servers require dynamic headers at runtime (e.g., authentication tokens, tenant IDs), you can pass them via `mcpOptions`. First, configure the header names on your MCP server in the Agent0 dashboard (under **Custom Headers**), then provide the values at runtime.

Headers are keyed by MCP server ID:

```typescript
const response = await client.generate({
  agentId: 'agent_123',
  mcpOptions: {
    'mcp-server-id-1': {
      headers: {
        'X-User-Token': 'bearer-token-here',
        'X-Tenant-Id': 'tenant-456'
      }
    },
    'mcp-server-id-2': {
      headers: {
        'Authorization': 'Bearer another-token'
      }
    }
  }
});
```

**Streaming with Custom Headers:**

```typescript
const stream = client.stream({
  agentId: 'agent_123',
  mcpOptions: {
    'mcp-server-id': {
      headers: {
        'X-User-Token': userSession.token
      }
    }
  }
});

for await (const chunk of stream) {
  if (chunk.type === 'text-delta') {
    process.stdout.write(chunk.textDelta);
  }
}
```

> ⚠️ **Note**: Only header names that are pre-configured as "Custom Headers" on the MCP server will be sent. Any extra headers not in the allowed list are ignored.

### Error Handling

```typescript
import { Agent0 } from 'agent0-js';

const client = new Agent0({
  apiKey: process.env.AGENT0_API_KEY!
});

async function runAgentWithErrorHandling() {
  try {
    const response = await client.generate({
      agentId: 'agent_123',
      variables: { input: 'test' }
    });
    
    return response.messages;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Agent execution failed:', error.message);
      
      // Handle specific error cases
      if (error.message.includes('401')) {
        console.error('Invalid API key');
      } else if (error.message.includes('404')) {
        console.error('Agent not found');
      } else if (error.message.includes('429')) {
        console.error('Rate limit exceeded');
      }
    }
    
    throw error;
  }
}
```

### Using with Environment Variables

Create a `.env` file:

```bash
AGENT0_API_KEY=your_api_key_here
AGENT0_BASE_URL=https://app.agent0.com
```

Then use it in your application:

```typescript
import { Agent0 } from 'agent0-js';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Agent0({
  apiKey: process.env.AGENT0_API_KEY!,
  baseUrl: process.env.AGENT0_BASE_URL
});
```

## TypeScript Support

This SDK is written in TypeScript and includes full type definitions. You get autocomplete and type checking out of the box:

```typescript
import { Agent0, type RunOptions, type GenerateResponse } from 'agent0-js';

const client = new Agent0({
  apiKey: process.env.AGENT0_API_KEY!
});

// TypeScript will enforce correct types
const options: RunOptions = {
  agentId: 'agent_123',
  variables: {
    key: 'value' // Must be Record<string, string>
  }
};

const response: GenerateResponse = await client.generate(options);
```

## Best Practices

1. **Secure Your API Key**: Never hardcode API keys. Use environment variables or secret management services.

2. **Use Streaming for Long Responses**: For agents that generate lengthy content, use the `stream()` method for a better user experience.

3. **Handle Errors Gracefully**: Always wrap API calls in try-catch blocks and handle errors appropriately.

4. **Type Safety**: Use TypeScript for better development experience and fewer runtime errors.

5. **Set Timeouts**: For production applications, consider implementing timeout logic for long-running agent executions.

## Platform Compatibility

- **Node.js**: 18.x or higher
- **Browsers**: Modern browsers with fetch API support
- **Edge Runtimes**: Vercel Edge, Cloudflare Workers, etc.
- **React Native**: Supported (with appropriate polyfills)

## Support & Resources

- **Documentation**: [https://docs.agent0.com](https://docs.agent0.com)
- **Dashboard**: [https://app.agent0.com](https://app.agent0.com)
- **Issues**: Report bugs or request features on GitHub
- **Community**: Join our Discord community for support

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
