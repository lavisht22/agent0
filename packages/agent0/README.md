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

## Methods

### `generate(options: RunOptions): Promise<GenerateResponse>`

Execute an agent and get the complete response.

**Parameters:**

```typescript
interface RunOptions {
  agentId: string;                    // The ID of the agent to run
  variables?: Record<string, string>; // Variables to pass to the agent
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
