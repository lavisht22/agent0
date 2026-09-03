import type {
	GenerateTextStepStartEvent,
	StepResult,
	TextStreamPart,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	ToolSet,
} from "ai";
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
 * v7 hands `onChunk` every stream part, including lifecycle/boundary/finish
 * parts. Only the parts that carry model output count as activity, so
 * `first_chunk` and `sinceActivityMs` keep measuring time-to-first-token rather
 * than time-to-stream-open.
 */
const CONTENT_CHUNK_TYPES = new Set<TextStreamPart<ToolSet>["type"]>([
	"text-delta",
	"reasoning-delta",
	"source",
	"file",
	"reasoning-file",
	"tool-input-start",
	"tool-input-delta",
	"tool-call",
	"tool-result",
	"raw",
]);

export const isContentChunk = (chunk: TextStreamPart<ToolSet>): boolean =>
	CONTENT_CHUNK_TYPES.has(chunk.type);

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
		onStart: () => {
			touch();
			log("generation_start");
		},
		onStepStart: (event: GenerateTextStepStartEvent<ToolSet>) => {
			currentStep = event.stepNumber;
			currentTool = undefined;
			currentToolCallId = undefined;
			touch();
			log("step_start", {
				stepNumber: event.stepNumber,
				messageCount: event.messages?.length,
			});
		},
		// v7 dropped `stepNumber` from the tool-execution events; tool calls only
		// run inside a step, so the value tracked by onStepStart is the same one.
		onToolExecutionStart: (event: ToolExecutionStartEvent<ToolSet>) => {
			currentTool = event.toolCall.toolName;
			currentToolCallId = event.toolCall.toolCallId;
			touch();
			log("tool_start", {
				stepNumber: currentStep,
				toolName: event.toolCall.toolName,
				toolCallId: event.toolCall.toolCallId,
			});
		},
		onToolExecutionEnd: (event: ToolExecutionEndEvent<ToolSet>) => {
			touch();
			// v7 replaced the `success`/`error` pair with a discriminated
			// `toolOutput`, and `durationMs` with `toolExecutionMs`.
			const failed = event.toolOutput.type === "tool-error";
			const error = failed ? event.toolOutput.error : undefined;
			log("tool_finish", {
				stepNumber: currentStep,
				toolName: event.toolCall.toolName,
				toolCallId: event.toolCall.toolCallId,
				success: !failed,
				durationMs: event.toolExecutionMs,
				error: failed
					? error instanceof Error
						? { name: error.name, message: error.message }
						: String(error)
					: undefined,
			});
			currentTool = undefined;
			currentToolCallId = undefined;
		},
	};

	const onStepEnd = (step: StepResult<ToolSet>) => {
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
		onStepEnd,
		onChunk,
		onError,
	};
};

export type RunLogger = ReturnType<typeof createRunLogger>;
