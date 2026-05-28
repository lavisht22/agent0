import type { TextStreamPart, ToolSet } from "ai";
import type {
	Agent0Config,
	EmbedManyOptions,
	EmbedManyResponse,
	EmbedOptions,
	EmbedResponse,
	Environment,
	GenerateResponse,
	RunOptions,
} from "./types";

export class Agent0 {
	private apiKey: string;
	private workspaceId: string;
	private baseUrl: string;
	private environment?: Environment;

	constructor(config: Agent0Config) {
		this.apiKey = config.apiKey;
		this.workspaceId = config.workspaceId;
		this.baseUrl = config.baseUrl || "https://app.agent0.com"; // Default URL, can be overridden
		this.environment = config.environment;
	}

	/**
	 * Resolve the environment to use: run-level > constructor-level > default 'production'
	 */
	private resolveEnvironment(runEnvironment?: Environment): Environment {
		return runEnvironment ?? this.environment ?? "production";
	}

	private async fetchApi(
		endpoint: string,
		body: unknown,
		signal?: AbortSignal,
	): Promise<Response> {
		const url = `${this.baseUrl}${endpoint}`;

		const headers = {
			"Content-Type": "application/json",
			"x-api-key": this.apiKey,
		};

		const timeoutSignal = AbortSignal.timeout(10 * 60 * 1000);
		const combinedSignal = signal
			? anySignal([signal, timeoutSignal])
			: timeoutSignal;

		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: combinedSignal,
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
		const response = await this.fetchApi(
			`/api/v1/workspaces/${this.workspaceId}/runs`,
			{
				agent_id: options.agentId,
				environment: this.resolveEnvironment(options.environment),
				variables: options.variables,
				overrides: options.overrides,
				extra_messages: options.extraMessages,
				extra_tools: options.extraTools,
				mcp_options: options.mcpOptions,
				stream: false,
			},
			options.signal,
		);

		return await response.json();
	}

	async *stream(
		options: RunOptions,
	): AsyncGenerator<TextStreamPart<ToolSet>, void, unknown> {
		const response = await this.fetchApi(
			`/api/v1/workspaces/${this.workspaceId}/runs`,
			{
				agent_id: options.agentId,
				environment: this.resolveEnvironment(options.environment),
				variables: options.variables,
				overrides: options.overrides,
				extra_messages: options.extraMessages,
				extra_tools: options.extraTools,
				mcp_options: options.mcpOptions,
				stream: true,
			},
			options.signal,
		);

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
		const { signal, ...body } = options;
		const response = await this.fetchApi(
			`/api/v1/workspaces/${this.workspaceId}/embed`,
			body,
			signal,
		);
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
		const { signal, ...body } = options;
		const response = await this.fetchApi(
			`/api/v1/workspaces/${this.workspaceId}/embed-many`,
			body,
			signal,
		);
		return await response.json();
	}
}

// AbortSignal.any was added in Node 20.3; fall back for older runtimes.
function anySignal(signals: AbortSignal[]): AbortSignal {
	if (typeof AbortSignal.any === "function") {
		return AbortSignal.any(signals);
	}
	const controller = new AbortController();
	for (const s of signals) {
		if (s.aborted) {
			controller.abort(s.reason);
			return controller.signal;
		}
		s.addEventListener("abort", () => controller.abort(s.reason), {
			once: true,
		});
	}
	return controller.signal;
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
