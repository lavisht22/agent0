import type { ModelMessage } from "ai";

export interface Agent0Config {
    apiKey: string;
    baseUrl?: string;
}

export interface RunOptions {
    agentId: string;
    variables?: Record<string, string>;
}

export interface GenerateResponse {
    messages: ModelMessage[];
    text: string;
}
