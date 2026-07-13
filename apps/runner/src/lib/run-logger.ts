import type { StepResult, ToolSet } from "ai";
import { RUN_TIMEOUT } from "./timeouts.js";

export type RunLogContext = {
	runId: string;
	parentRunId?: string | null;
	modelId?: string;
	agentId?: string;
	isStream?: boolean;
	isTest?: boolean;
};

const toolNamesFromStep = (step: StepResult<ToolSet>): string[] => {
	const fromCalls = (step.toolCalls ?? []).map((t) => t.toolName);
	if (fromCalls.length > 0) return fromCalls;
	const names: string[] = [];
	for (const part of step.content ?? []) {
		if (part.type === "tool-call" && "toolName" in part) {
			names.push(String(part.toolName));
		}
	}
	return names;
};

/**
 * Structured JSON logs for multi-step agent runs. Grep docker logs with:
 *   grep '"scope":"agent-run"' | grep '<runId>'
 */
export const createRunLogger = (ctx: RunLogContext) => {
	const startedAt = Date.now();
	let lastActivityAt = startedAt;
	let currentStep: number | undefined;
	let currentTool: string | undefined;
	let currentToolCallId: string | undefined;
	let chunkCount = 0;

	const log = (event: string, data: Record<string, unknown> = {}) => {
		// Single-line JSON so Coolify / docker logs stay greppable.
		console.log(
			JSON.stringify({
				scope: "agent-run",
				event,
				ts: new Date().toISOString(),
				elapsedMs: Date.now() - startedAt,
				sinceActivityMs: Date.now() - lastActivityAt,
				runId: ctx.runId,
				parentRunId: ctx.parentRunId ?? null,
				modelId: ctx.modelId,
				agentId: ctx.agentId,
				isStream: ctx.isStream ?? false,
				isTest: ctx.isTest ?? false,
				stepNumber: currentStep,
				toolName: currentTool,
				toolCallId: currentToolCallId,
				...data,
			}),
		);
	};

	const touch = () => {
		lastActivityAt = Date.now();
	};

	const start = (extra: Record<string, unknown> = {}) => {
		log("run_start", {
			timeout: { ...RUN_TIMEOUT },
			...extra,
		});
	};

	const end = (status: string, extra: Record<string, unknown> = {}) => {
		log("run_end", { status, chunkCount, ...extra });
	};

	const onAbortSignal = (signal?: AbortSignal) => {
		if (!signal) return;
		const onAbort = () => {
			const reason = signal.reason;
			log("abort_signal", {
				reason:
					reason instanceof Error
						? { name: reason.name, message: reason.message }
						: reason != null
							? String(reason)
							: "aborted",
				currentStep,
				currentTool,
				currentToolCallId,
			});
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
	};

	/** Spread into streamText / generateText for lifecycle hooks. */
	const lifecycle = {
		experimental_onStart: () => {
			touch();
			log("generation_start");
		},
		experimental_onStepStart: (event: {
			stepNumber: number;
			messages: unknown[];
		}) => {
			currentStep = event.stepNumber;
			currentTool = undefined;
			currentToolCallId = undefined;
			touch();
			log("step_start", {
				stepNumber: event.stepNumber,
				messageCount: event.messages?.length,
			});
		},
		experimental_onToolCallStart: (event: {
			stepNumber: number | undefined;
			toolCall: { toolName: string; toolCallId: string };
		}) => {
			currentStep = event.stepNumber ?? currentStep;
			currentTool = event.toolCall.toolName;
			currentToolCallId = event.toolCall.toolCallId;
			touch();
			log("tool_start", {
				stepNumber: event.stepNumber,
				toolName: event.toolCall.toolName,
				toolCallId: event.toolCall.toolCallId,
			});
		},
		experimental_onToolCallFinish: (event: {
			stepNumber: number | undefined;
			toolCall: { toolName: string; toolCallId: string };
			durationMs: number;
			success: boolean;
			error?: unknown;
		}) => {
			touch();
			log("tool_finish", {
				stepNumber: event.stepNumber,
				toolName: event.toolCall.toolName,
				toolCallId: event.toolCall.toolCallId,
				success: event.success,
				durationMs: event.durationMs,
				error:
					event.success === false
						? event.error instanceof Error
							? { name: event.error.name, message: event.error.message }
							: String(event.error)
						: undefined,
			});
			currentTool = undefined;
			currentToolCallId = undefined;
		},
	};

	const onStepFinish = (step: StepResult<ToolSet>) => {
		touch();
		currentStep = step.stepNumber ?? currentStep;
		log("step_finish", {
			stepNumber: step.stepNumber,
			finishReason: step.finishReason,
			toolNames: toolNamesFromStep(step),
			inputTokens: step.usage?.inputTokens,
			outputTokens: step.usage?.outputTokens,
			totalTokens: step.usage?.totalTokens,
		});
	};

	const onChunk = () => {
		chunkCount += 1;
		touch();
		// Only log the first chunk of the run and first of each step-ish
		// silence break would be noisy; activity is tracked via sinceActivityMs.
		if (chunkCount === 1) {
			log("first_chunk");
		}
	};

	const onError = (error: unknown) => {
		log("generation_error", {
			error:
				error instanceof Error
					? { name: error.name, message: error.message }
					: String(error),
			currentStep,
			currentTool,
			currentToolCallId,
			chunkCount,
		});
	};

	return {
		log,
		touch,
		start,
		end,
		onAbortSignal,
		lifecycle,
		onStepFinish,
		onChunk,
		onError,
	};
};

export type RunLogger = ReturnType<typeof createRunLogger>;
