import type { ModelMessage, StepResult, ToolSet } from 'ai';

export type VersionData = {
    model: { provider_id: string; name: string };
    messages: ModelMessage[],
    maxOutputTokens?: number,
    outputFormat?: "text" | "json",
    temperature?: number,
    maxStepCount?: number,
};

export type RunData = {
    request?: VersionData & { model: { provider_id: string, name: string }, stream: boolean },
    overrides?: {
        model?: {
            provider_id?: string;
            name?: string;
        };
        maxOutputTokens?: number;
        temperature?: number;
        maxStepCount?: number;
    },
    steps?: StepResult<ToolSet>[],
    error?: {
        name: string;
        message: string;
        cause?: unknown;
    },
    metrics: {
        preProcessingTime: number,
        firstTokenTime: number,
        responseTime: number,
    }
};
