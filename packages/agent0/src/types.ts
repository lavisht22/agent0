import type { ModelMessage } from "ai";

export interface Agent0Config {
    apiKey: string;
    baseUrl?: string;
}

/**
 * Model configuration overrides for runtime customization.
 * Allows downstream applications to implement load balancing, fallbacks, and dynamic model switching.
 */
export interface ModelOverrides {
    /** Override the model provider and name */
    model?: {
        provider_id?: string;
        name?: string;
    };
    /** Override max output tokens */
    maxOutputTokens?: number;
    /** Override temperature */
    temperature?: number;
    /** Override max step count */
    maxStepCount?: number;
}

export interface RunOptions {
    agentId: string;
    variables?: Record<string, string>;
    /** Runtime model overrides for load balancing, fallbacks, etc. */
    overrides?: ModelOverrides;
    /** Extra messages to append to the agent's prompt (used as-is, no variable substitution) */
    extraMessages?: ModelMessage[];
}

export interface GenerateResponse {
    messages: ModelMessage[];
    text: string;
}
