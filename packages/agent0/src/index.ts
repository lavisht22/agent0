import type { TextStreamPart, ToolSet } from 'ai';
import type { Agent0Config, GenerateResponse, RunOptions } from './types';

export class Agent0 {
    private apiKey: string;
    private baseUrl: string;

    constructor(config: Agent0Config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://app.agent0.com'; // Default URL, can be overridden
    }

    private async fetchApi(endpoint: string, body: unknown): Promise<Response> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return response;
    }

    async generate(options: RunOptions): Promise<GenerateResponse> {
        const response = await this.fetchApi('/api/v1/run', {
            agent_id: options.agentId,
            variables: options.variables,
            overrides: options.overrides,
            extra_messages: options.extraMessages,
            stream: false,
        });

        return await response.json();
    }

    async *stream(options: RunOptions): AsyncGenerator<TextStreamPart<ToolSet>, void, unknown> {
        const response = await this.fetchApi('/api/v1/run', {
            agent_id: options.agentId,
            variables: options.variables,
            overrides: options.overrides,
            extra_messages: options.extraMessages,
            stream: true,
        });

        if (!response.body) {
            throw new Error('Response body is empty');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep the last incomplete line in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    const data = trimmedLine.slice(6);
                    try {
                        const parsed = JSON.parse(data) as TextStreamPart<ToolSet>;
                        yield parsed;
                    } catch (e) {
                        console.warn('Failed to parse stream chunk:', data, e);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
