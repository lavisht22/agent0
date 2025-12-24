import type { TextStreamPart, ToolSet } from "ai";
import type {
	Agent0Config,
	EmbedManyOptions,
	EmbedManyResponse,
	EmbedOptions,
	EmbedResponse,
	GenerateResponse,
	RunOptions,
} from "./types";

export class Agent0 {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: Agent0Config) {
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl || "https://app.agent0.com"; // Default URL, can be overridden
	}

	private async fetchApi(endpoint: string, body: unknown): Promise<Response> {
		const url = `${this.baseUrl}${endpoint}`;

		const headers = {
			"Content-Type": "application/json",
			"x-api-key": this.apiKey,
		};

		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10 * 60 * 1000),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`API request failed: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		return response;
	}

	async generate(options: RunOptions): Promise<GenerateResponse> {
		const response = await this.fetchApi("/api/v1/run", {
			agent_id: options.agentId,
			environment: options.environment,
			variables: options.variables,
			overrides: options.overrides,
			extra_messages: options.extraMessages,
			extra_tools: options.extraTools,
			stream: false,
		});

		return await response.json();
	}

	async *stream(
		options: RunOptions,
	): AsyncGenerator<TextStreamPart<ToolSet>, void, unknown> {
		const response = await this.fetchApi("/api/v1/run", {
			agent_id: options.agentId,
			environment: options.environment,
			variables: options.variables,
			overrides: options.overrides,
			extra_messages: options.extraMessages,
			extra_tools: options.extraTools,
			stream: true,
		});

		if (!response.body) {
			throw new Error("Response body is empty");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");

				// Keep the last incomplete line in the buffer
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmedLine = line.trim();
					if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

					const data = trimmedLine.slice(6);
					try {
						const parsed = JSON.parse(data) as TextStreamPart<ToolSet>;
						yield parsed;
					} catch (e) {
						console.warn("Failed to parse stream chunk:", data, e);
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	/**
	 * Generate an embedding for a single value using the specified model.
	 * Accepts all options from Vercel AI SDK's embed function.
	 *
	 * @param options - The embedding options (extends Vercel AI SDK's embed parameters)
	 * @returns The embedding vector
	 */
	async embed(options: EmbedOptions): Promise<EmbedResponse> {
		// Pass all options directly to the API
		const response = await this.fetchApi("/api/v1/embed", options);
		return await response.json();
	}

	/**
	 * Generate embeddings for multiple values using the specified model.
	 * Accepts all options from Vercel AI SDK's embedMany function.
	 *
	 * @param options - The embedding options (extends Vercel AI SDK's embedMany parameters)
	 * @returns The embedding vectors (one per input value)
	 */
	async embedMany(options: EmbedManyOptions): Promise<EmbedManyResponse> {
		// Pass all options directly to the API
		const response = await this.fetchApi("/api/v1/embed-many", options);
		return await response.json();
	}
}

// Re-export types for convenience
export type {
	Agent0Config,
	CustomTool,
	EmbedManyOptions,
	EmbedManyResponse,
	EmbedModel,
	EmbedOptions,
	EmbedResponse,
	Environment,
	GenerateResponse,
	ModelOverrides,
	ProviderOptions,
	RunOptions,
} from "./types";
