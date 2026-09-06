import { Accordion, Button } from "@heroui/react";
import {
	AlertCircle,
	Check,
	Copy,
	LucideFileText,
	ShieldX,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import {
	formatBase64Size,
	imageSrc,
	isImageMediaType,
	resolveFileData,
} from "@/lib/file-data";
import type { AssistantMessageT } from "./assistant-message";
import type { ToolMessageT } from "./tool-message";

type ToolCallPart = Extract<
	AssistantMessageT["content"][number],
	{ type: "tool-call" }
>;
type ToolResultPart = ToolMessageT["content"][number];

// One part of a `content`-type result (the multi-part shape MCP servers
// return). AI SDK v7 emits `file` with a tagged `data` union; before it the
// part was `file-data` (and `media` earlier still) with a bare base64 string.
// Run logs hold every one of those shapes, so `data` is read as unknown and
// normalized by `resolveFileData`.
type ToolContentItem =
	| { type: "text"; text: string }
	| { type: "file" | "file-data" | "media"; data: unknown; mediaType?: string };

// AI SDK tool-result output envelope. The model output is always wrapped as
// `{ type, value }`.
type ToolOutput =
	| { type: "text" | "error-text"; value: string }
	| { type: "json" | "error-json"; value: unknown }
	| { type: "execution-denied"; reason?: string }
	| { type: "content"; value: ToolContentItem[] }
	| { type?: string; value?: unknown };

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	return (
		<Button
			size="sm"
			isIconOnly
			variant="ghost"
			onPress={async () => {
				try {
					await navigator.clipboard.writeText(text);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				} catch {
					// Clipboard unavailable (e.g. insecure context) — silently ignore.
				}
			}}
		>
			{copied ? (
				<Check className="size-3.5 text-success" />
			) : (
				<Copy className="size-3.5 text-muted" />
			)}
		</Button>
	);
}

function JsonBlock({ value }: { value: unknown }) {
	const text =
		typeof value === "string" ? value : JSON.stringify(value, null, 2);

	return (
		<div className="relative group">
			<pre className="bg-surface-secondary rounded-[10px] p-3 pr-10 text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto font-mono">
				{text}
			</pre>
			<div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
				<CopyButton text={text} />
			</div>
		</div>
	);
}

function TextBlock({ text }: { text: string }) {
	return (
		<div className="relative group">
			<div className="bg-surface-secondary rounded-[10px] p-3 pr-10 text-sm whitespace-pre-wrap break-words max-h-96 overflow-auto">
				{text}
			</div>
			<div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
				<CopyButton text={text} />
			</div>
		</div>
	);
}

export function FilePart({
	data,
	mediaType,
	filename,
}: {
	data: unknown;
	mediaType?: string;
	filename?: string;
}) {
	const file = resolveFileData(data);

	// Raw bytes or a provider reference — nothing to render on its own, so show
	// the payload rather than breaking the whole message list.
	if (!file) {
		return <JsonBlock value={data} />;
	}

	// A tagged `{ type: "text" }` file is an inline text document.
	if (file.kind === "text") {
		return <TextBlock text={file.value} />;
	}

	if (isImageMediaType(mediaType)) {
		return (
			<div className="bg-surface-secondary w-full rounded-[10px] p-2 flex justify-center items-center">
				<img
					src={imageSrc(file, mediaType)}
					alt={filename || "Tool output"}
					className="max-w-full max-h-72 object-contain"
				/>
			</div>
		);
	}

	const size = file.kind === "base64" ? formatBase64Size(file.value) : null;

	return (
		<div className="bg-surface-secondary w-full rounded-[10px] p-3 flex items-center gap-3">
			<div className="shrink-0 size-10 bg-surface-tertiary rounded-lg flex items-center justify-center">
				<LucideFileText className="size-5 text-foreground" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate">
					{filename || mediaType || "File"}
				</p>
				{file.kind === "url" ? (
					<a
						href={file.value}
						target="_blank"
						rel="noreferrer"
						className="text-xs text-muted hover:underline break-all"
					>
						{file.value}
					</a>
				) : (
					size && <p className="text-xs text-muted">{size}</p>
				)}
			</div>
		</div>
	);
}

// A single-item accordion that reads as a standalone collapsible card. The
// trigger is the whole header row; panel content goes in `children`. Collapsed
// by default (no `defaultExpandedKeys`).
function ToolAccordion({
	id,
	header,
	children,
}: {
	id: string;
	header: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<Accordion variant="surface" className="w-full border border-border">
			<Accordion.Item id={id}>
				<Accordion.Heading>
					<Accordion.Trigger>
						<div className="flex items-center gap-2 min-w-0">{header}</div>
						<Accordion.Indicator />
					</Accordion.Trigger>
				</Accordion.Heading>
				<Accordion.Panel>
					<Accordion.Body className="space-y-2 text-foreground">
						{children}
					</Accordion.Body>
				</Accordion.Panel>
			</Accordion.Item>
		</Accordion>
	);
}

export function ToolCallView({ value }: { value: ToolCallPart }) {
	const hasInput =
		value.input != null &&
		!(typeof value.input === "object" && Object.keys(value.input).length === 0);

	return (
		<ToolAccordion
			id="call"
			header={
				<>
					<Wrench className="size-3.5 text-muted shrink-0" />
					<span className="text-sm font-mono font-medium shrink-0">
						{value.toolName || "tool"}
					</span>
					{value.toolCallId && (
						<span className="text-[11px] font-mono text-muted truncate">
							{value.toolCallId}
						</span>
					)}
				</>
			}
		>
			{hasInput ? (
				<JsonBlock value={value.input} />
			) : (
				<p className="text-xs text-muted italic">No input</p>
			)}
		</ToolAccordion>
	);
}

function ToolResultBody({ output }: { output: ToolOutput }) {
	if (!output || typeof output !== "object" || !("type" in output)) {
		return <JsonBlock value={output} />;
	}

	switch (output.type) {
		case "text":
		case "error-text":
			return <TextBlock text={String(output.value ?? "")} />;
		case "json":
		case "error-json":
			return <JsonBlock value={output.value} />;
		case "execution-denied":
			return (
				<div className="flex items-center gap-2 text-sm text-warning">
					<ShieldX className="size-4 shrink-0" />
					<span>
						Execution denied
						{"reason" in output && output.reason ? `: ${output.reason}` : ""}
					</span>
				</div>
			);
		case "content":
			return (
				<div className="space-y-2">
					{((output.value ?? []) as ToolContentItem[]).map((item, index) => {
						if (item?.type === "text") {
							return (
								<TextBlock
									key={`${index + 1}`}
									text={String(item.text ?? "")}
								/>
							);
						}

						if (item && typeof item === "object" && "data" in item) {
							return (
								<FilePart
									key={`${index + 1}`}
									data={item.data}
									mediaType={item.mediaType}
								/>
							);
						}

						return <JsonBlock key={`${index + 1}`} value={item} />;
					})}
				</div>
			);
		default:
			return <JsonBlock value={"value" in output ? output.value : output} />;
	}
}

export function ToolResultView({ value }: { value: ToolResultPart }) {
	const output = value.output as ToolOutput;
	const isError =
		value.isError === true ||
		(typeof output?.type === "string" && output.type.startsWith("error"));

	return (
		<ToolAccordion
			id="result"
			header={
				<>
					{isError ? (
						<AlertCircle className="size-3.5 text-danger shrink-0" />
					) : (
						<Check className="size-3.5 text-success shrink-0" />
					)}
					<span className="text-sm font-mono font-medium shrink-0">
						{value.toolName || "tool"}
					</span>
					{value.toolCallId && (
						<span className="text-[11px] font-mono text-muted truncate">
							{value.toolCallId}
						</span>
					)}
				</>
			}
		>
			<ToolResultBody output={output} />
		</ToolAccordion>
	);
}
