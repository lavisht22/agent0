import { Button, Card, Dropdown, Label } from "@heroui/react";
import { Reorder, useDragControls } from "framer-motion";
import { LucideGripVertical, LucidePlus, LucideX } from "lucide-react";
import { useMemo } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { z } from "zod";
import { MonacoJsonEditor } from "./monaco-json-editor";
import { Variables } from "./variables";

export const assistantMessageSchema = z.object({
	id: z.string(),
	role: z.literal("assistant"),
	content: z
		.array(
			z.union([
				z.object({
					type: z.literal("text"),
					text: z.string(),
					providerOptions: z.any().optional(),
				}),
				z.object({
					type: z.literal("reasoning"),
					text: z.string(),
					providerOptions: z.any().optional(),
				}),
				z.object({
					type: z.literal("file"),
					data: z.string(),
					mediaType: z.string(),
					fileName: z.string().optional(),
					providerOptions: z.any().optional(),
				}),
				z.object({
					type: z.literal("tool-call"),
					toolCallId: z.string(),
					toolName: z.string(),
					input: z.any(),
					providerOptions: z.any().optional(),
				}),
			]),
		)
		.min(1, "Assistant message must have at least one content part"),
	providerOptions: z.any().optional(),
});

type AssistantMessageContent = z.infer<
	typeof assistantMessageSchema
>["content"];

function AssistantMessagePart({
	isReadOnly,
	value,
	onValueChange,
}: {
	isReadOnly?: boolean;
	value: AssistantMessageContent[number];
	onValueChange: (value: AssistantMessageContent[number]) => void;
}) {
	if (value.type === "text") {
		return (
			<TextareaAutosize
				className="outline-none w-full resize-none text-sm scrollbar-hide"
				readOnly={isReadOnly}
				maxRows={1000000000000}
				placeholder="Assistant message..."
				value={value.text}
				onChange={(e) => {
					onValueChange({
						...value,
						text: e.target.value,
					});
				}}
			/>
		);
	}

	if (value.type === "reasoning") {
		return (
			<TextareaAutosize
				className="outline-none w-full resize-none text-sm scrollbar-hide text-default-500 italic"
				readOnly={isReadOnly}
				maxRows={1000000000000}
				placeholder="Assistant reasoning..."
				value={value.text}
				onChange={(e) => {
					onValueChange({
						...value,
						text: e.target.value,
					});
				}}
			/>
		);
	}

	if (value.type === "tool-call") {
		return (
			<div className="w-full space-y-2 rounded-[14px] border border-default-200 overflow-hidden">
				<MonacoJsonEditor
					readOnly={isReadOnly}
					value={JSON.stringify(value, null, 2)}
					onValueChange={(newData) => {
						onValueChange(JSON.parse(newData));
					}}
				/>
			</div>
		);
	}
}

export type AssistantMessageT = z.infer<typeof assistantMessageSchema>;

export function AssistantMessage({
	isReadOnly,
	value,
	onValueChange,
	onVariablePress,
}: {
	isReadOnly?: boolean;
	value: AssistantMessageT;
	onValueChange: (value: AssistantMessageT | null) => void;
	onVariablePress: () => void;
}) {
	const variables = useMemo(() => {
		const str = JSON.stringify(value.content);

		const matches = str.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value.content]);

	const controls = useDragControls();

	return (
		<Reorder.Item
			key={value.id}
			value={value}
			layout="position"
			dragListener={false}
			dragControls={controls}
		>
			<Card>
				<Card.Header className="flex flex-row items-center justify-between pb-3 border-b border-default-200 z-0">
					<div className="flex items-center gap-2">
						{!isReadOnly && (
							<div
								className="reorder-handle cursor-grab"
								onPointerDown={(e) => controls.start(e)}
							>
								<LucideGripVertical className="size-3.5 text-default-500" />
							</div>
						)}
						<span className="text-sm text-default-500">Assistant</span>
					</div>
					{!isReadOnly && (
						<Dropdown>
							<Button size="sm" isIconOnly variant="tertiary">
								<LucidePlus className="size-3.5" />
							</Button>
							<Dropdown.Popover>
								<Dropdown.Menu
									onAction={(key) => {
										if (key === "text") {
											onValueChange({
												...value,
												content: [
													...value.content,
													{
														type: "text",
														text: "",
													},
												],
											});
										} else if (key === "reasoning") {
											onValueChange({
												...value,
												content: [
													...value.content,
													{
														type: "reasoning",
														text: "",
													},
												],
											});
										} else if (key === "tool-call") {
											onValueChange({
												...value,
												content: [
													...value.content,
													{
														type: "tool-call",
														toolCallId: "",
														toolName: "",
														input: {},
													},
												],
											});
										}
									}}
								>
									<Dropdown.Item id="text" textValue="Text Part">
										<Label>Text Part</Label>
									</Dropdown.Item>
									<Dropdown.Item id="reasoning" textValue="Reasoning Part">
										<Label>Reasoning Part</Label>
									</Dropdown.Item>
									<Dropdown.Item id="tool-call" textValue="Tool Call Part">
										<Label>Tool Call Part</Label>
									</Dropdown.Item>
								</Dropdown.Menu>
							</Dropdown.Popover>
						</Dropdown>
					)}
				</Card.Header>
				<Card.Content className="gap-3">
					{value.content.map((part, index) => {
						return (
							<div key={`${index + 1}`} className="flex items-start">
								<AssistantMessagePart
									isReadOnly={isReadOnly}
									value={part}
									onValueChange={(newPart) => {
										const newContent = [...value.content];
										newContent[index] = newPart;
										onValueChange({ ...value, content: newContent });
									}}
								/>
								{!isReadOnly && (
									<Button
										size="sm"
										isIconOnly
										variant="ghost"
										onPress={() => {
											const newContent = [...value.content];
											newContent.splice(index, 1);

											if (newContent.length === 0) {
												onValueChange(null);
												return;
											}

											onValueChange({ ...value, content: newContent });
										}}
									>
										<LucideX className="size-3.5" />
									</Button>
								)}
							</div>
						);
					})}
					{variables.length > 0 && (
						<Variables
							variables={variables}
							onVariablePress={onVariablePress}
						/>
					)}
				</Card.Content>
			</Card>
		</Reorder.Item>
	);
}
