import {
	Button,
	Card,
	CardBody,
	CardHeader,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
} from "@heroui/react";
import { defaultTheme, JsonEditor } from "json-edit-react";
import { LucideBraces, LucidePlus, LucideTrash2 } from "lucide-react";
import { useMemo } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { z } from "zod";

const systemMessageSchema = z.object({
	role: z.literal("system"),
	content: z.string().min(1, "System message content is required"),
	providerOptions: z.any().optional(),
});

const userMessageSchema = z.object({
	role: z.literal("user"),
	content: z
		.array(
			z.union([
				z.object({
					type: z.literal("text"),
					text: z.string(),
					providerOptions: z.any().optional(),
				}),
				z.object({
					type: z.literal("image"),
					image: z.string(),
					mediaType: z.string().optional(),
					providerOptions: z.any().optional(),
				}),
				z.object({
					type: z.literal("file"),
					data: z.string(),
					mediaType: z.string(),
					providerOptions: z.any().optional(),
				}),
			]),
		)
		.min(1, "User message must have at least one content part"),
	providerOptions: z.any().optional(),
});

export const assistantMessageSchema = z.object({
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

export const toolMessageSchema = z.object({
	role: z.literal("tool"),
	content: z.array(
		z.object({
			type: z.literal("tool-result"),
			toolCallId: z.string(),
			toolName: z.string(),
			output: z.unknown(),
			isError: z.boolean().optional(),
			providerOptions: z.any().optional(),
		}),
	),
	providerOptions: z.any().optional(),
});

export const messageSchema = z.discriminatedUnion("role", [
	systemMessageSchema,
	userMessageSchema,
	assistantMessageSchema,
	toolMessageSchema,
]);

export type MessageT = z.infer<typeof messageSchema>;

function Variables({
	variables,
	onVariablePress,
}: {
	variables: string[];
	onVariablePress: () => void;
}) {
	return (
		<div className="flex flex-wrap gap-1 items-center">
			{variables.map((variable) => (
				<Button
					color="warning"
					size="sm"
					key={variable}
					startContent={<LucideBraces className="size-3" />}
					className="gap-1 h-6 px-2"
					variant="flat"
					onPress={() => onVariablePress()}
				>
					{variable}
				</Button>
			))}
		</div>
	);
}

function SystemMessage({
	value,
	onValueChange,
	onVariablePress,
}: {
	value: string;
	onValueChange: (value: string) => void;
	onVariablePress: () => void;
}) {
	const variables = useMemo(() => {
		if (typeof value !== "string") return [];

		const matches = value.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value]);

	return (
		<Card>
			<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
				<span className="text-sm text-default-500">System</span>
			</CardHeader>
			<CardBody className="p-3 border-t border-default-200 flex flex-col gap-4">
				<TextareaAutosize
					className="outline-none w-full resize-none text-sm"
					placeholder="Enter system message..."
					maxRows={1000000000000}
					value={value}
					onChange={(e) => onValueChange(e.target.value)}
				/>
				<Variables variables={variables} onVariablePress={onVariablePress} />
			</CardBody>
		</Card>
	);
}

function UserMessagePart({
	value,
	onValueChange,
}: {
	value: z.infer<typeof userMessageSchema>["content"][number];
	onValueChange: (
		value: z.infer<typeof userMessageSchema>["content"][number],
	) => void;
}) {
	if (value.type === "text") {
		return (
			<TextareaAutosize
				className="outline-none w-full resize-none text-sm"
				placeholder="Enter user message..."
				maxRows={1000000000000}
				value={value.text}
				onChange={(e) => onValueChange({ ...value, text: e.target.value })}
			/>
		);
	}

	return null;
}

function UserMessage({
	value,
	onValueChange,
	onVariablePress,
}: {
	value: Extract<MessageT, { role: "user" }>["content"];
	onValueChange: (
		value: Extract<MessageT, { role: "user" }>["content"] | null,
	) => void;
	onVariablePress: () => void;
}) {
	const variables = useMemo(() => {
		const str = JSON.stringify(value);

		const matches = str.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value]);

	return (
		<Card>
			<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
				<span className="text-sm text-default-500">User</span>
				<div className="flex gap-2">
					<Button
						size="sm"
						isIconOnly
						variant="light"
						onPress={() => onValueChange(null)}
					>
						<LucideTrash2 className="size-3.5" />
					</Button>
				</div>
			</CardHeader>
			<CardBody className="p-3 border-t border-default-200 flex flex-col gap-2">
				{value.map((part, index) => {
					return (
						<div key={`${index + 1}`} className="flex">
							<UserMessagePart
								value={part}
								onValueChange={(v) => {
									const newContent = [...value];
									newContent[index] = v;
									onValueChange(newContent);
								}}
							/>

							<Button
								className="-mr-2"
								size="sm"
								isIconOnly
								variant="light"
								onPress={() => {
									const newContent = [...value];
									newContent.splice(index, 1);

									if (newContent.length === 0) {
										onValueChange(null);
										return;
									}

									onValueChange(newContent);
								}}
							>
								<LucideTrash2 className="size-3.5" />
							</Button>
						</div>
					);
				})}
				<Variables variables={variables} onVariablePress={onVariablePress} />
			</CardBody>
		</Card>
	);
}

function AssistantMessagePart({
	isReadOnly,
	value,
	onValueChange,
}: {
	isReadOnly?: boolean;
	value: z.infer<typeof assistantMessageSchema>["content"][number];
	onValueChange: (
		value: z.infer<typeof assistantMessageSchema>["content"][number],
	) => void;
}) {
	if (value.type === "text") {
		return (
			<TextareaAutosize
				className="outline-none w-full resize-none text-sm"
				readOnly={isReadOnly}
				maxRows={1000000000000}
				placeholder="Enter assistant message..."
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
				className="outline-none w-full resize-none text-sm text-default-500"
				readOnly={isReadOnly}
				maxRows={10}
				placeholder="Enter assistant reasoning..."
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
			<div className="w-full space-y-2 bg-default-50 rounded-large">
				<JsonEditor
					viewOnly={isReadOnly}
					theme={[
						defaultTheme,
						{
							container: {
								backgroundColor: "transparent",
								fontSize: "12px",
							},
						},
					]}
					data={value}
					setData={(newData) => {
						onValueChange(
							newData as z.infer<
								typeof assistantMessageSchema
							>["content"][number],
						);
					}}
				/>
			</div>
		);
	}
}

function AssistantMessage({
	isReadOnly,
	value,
	onValueChange,
	onVariablePress,
}: {
	isReadOnly?: boolean;
	value: Extract<MessageT, { role: "assistant" }>["content"];
	onValueChange: (
		value: Extract<MessageT, { role: "assistant" }>["content"] | null,
	) => void;
	onVariablePress: () => void;
}) {
	const variables = useMemo(() => {
		const str = JSON.stringify(value);

		const matches = str.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value]);

	return (
		<Card>
			<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
				<span className="text-sm text-default-500">Assistant</span>
				{!isReadOnly && (
					<div className="flex gap-2">
						<Dropdown>
							<DropdownTrigger>
								<Button
									size="sm"
									isIconOnly
									variant="light"
									onPress={() => onValueChange(null)}
								>
									<LucidePlus className="size-3.5" />
								</Button>
							</DropdownTrigger>
							<DropdownMenu>
								<DropdownItem
									key="text"
									onPress={() =>
										onValueChange([
											...value,
											{
												type: "text",
												text: "",
											},
										])
									}
								>
									Text Part
								</DropdownItem>
								<DropdownItem
									key="reasoning"
									onPress={() =>
										onValueChange([
											...value,
											{
												type: "reasoning",
												text: "",
											},
										])
									}
								>
									Reasoning Part
								</DropdownItem>
								<DropdownItem
									key="tool-call"
									onPress={() =>
										onValueChange([
											...value,
											{
												type: "tool-call",
												toolCallId: "",
												toolName: "",
												input: {},
											},
										])
									}
								>
									Tool Call Part
								</DropdownItem>
							</DropdownMenu>
						</Dropdown>
					</div>
				)}
			</CardHeader>
			<CardBody className="p-3 border-t border-default-200 flex flex-col gap-3">
				{value.map((part, index) => {
					return (
						<div key={`${index + 1}`} className="flex">
							<AssistantMessagePart
								isReadOnly={isReadOnly}
								value={part}
								onValueChange={(newPart) => {
									const newContent = [...value];
									newContent[index] = newPart;
									onValueChange(newContent);
								}}
							/>
							{!isReadOnly && (
								<Button
									className="-mr-2"
									size="sm"
									isIconOnly
									variant="light"
									onPress={() => {
										const newContent = [...value];
										newContent.splice(index, 1);

										if (newContent.length === 0) {
											onValueChange(null);
											return;
										}

										onValueChange(newContent);
									}}
								>
									<LucideTrash2 className="size-3.5" />
								</Button>
							)}
						</div>
					);
				})}
				{variables.length > 0 && (
					<Variables variables={variables} onVariablePress={onVariablePress} />
				)}
			</CardBody>
		</Card>
	);
}

function ToolMessagePart({
	isReadOnly,
	value,
	onValueChange,
}: {
	isReadOnly?: boolean;
	value: z.infer<typeof toolMessageSchema>["content"][number];
	onValueChange: (
		value: z.infer<typeof toolMessageSchema>["content"][number],
	) => void;
}) {
	if (value.type === "tool-result") {
		return (
			<div className="w-full space-y-2 bg-default-50 rounded-large">
				<JsonEditor
					viewOnly={isReadOnly}
					theme={[
						defaultTheme,
						{
							container: {
								backgroundColor: "transparent",
								fontSize: "12px",
							},
						},
					]}
					data={value}
					setData={(newData) => {
						onValueChange(
							newData as z.infer<typeof toolMessageSchema>["content"][number],
						);
					}}
				/>
			</div>
		);
	}
}

function ToolMessage({
	isReadOnly,
	value,
	onValueChange,
	onVariablePress,
}: {
	isReadOnly?: boolean;
	value: Extract<MessageT, { role: "tool" }>["content"];
	onValueChange: (
		value: Extract<MessageT, { role: "tool" }>["content"] | null,
	) => void;
	onVariablePress: () => void;
}) {
	const variables = useMemo(() => {
		const str = JSON.stringify(value);

		const matches = str.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value]);

	return (
		<Card>
			<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
				<span className="text-sm text-default-500">Tool</span>
			</CardHeader>
			<CardBody className="p-3 border-t border-default-200 flex flex-col gap-3">
				{value.map((part, index) => {
					return (
						<div key={`${index + 1}`} className="flex">
							<ToolMessagePart
								isReadOnly={isReadOnly}
								value={part}
								onValueChange={(newPart) => {
									const newContent = [...value];
									newContent[index] = newPart;
									onValueChange(newContent);
								}}
							/>
							{!isReadOnly && (
								<Button
									className="-mr-2"
									size="sm"
									isIconOnly
									variant="light"
									onPress={() => {
										const newContent = [...value];
										newContent.splice(index, 1);

										if (newContent.length === 0) {
											onValueChange(null);
											return;
										}

										onValueChange(newContent);
									}}
								>
									<LucideTrash2 className="size-3.5" />
								</Button>
							)}
						</div>
					);
				})}
				{variables.length > 0 && (
					<Variables variables={variables} onVariablePress={onVariablePress} />
				)}
			</CardBody>
		</Card>
	);
}

interface MessagesProps {
	value: MessageT[];
	onValueChange: (value: MessageT[]) => void;
	isReadOnly?: boolean;
	onVariablePress: () => void;
}

export function Messages({
	value,
	onValueChange,
	isReadOnly = false,
	onVariablePress,
}: MessagesProps) {
	return (
		<div className="flex flex-col gap-4">
			{value.map((message, index) => {
				if (message.role === "system") {
					return (
						<SystemMessage
							key={`${index + 1}`}
							value={message.content}
							onValueChange={(content) => {
								const newMessages = [...value];

								newMessages[index] = {
									role: "system",
									content,
								};

								onValueChange(newMessages);
							}}
							onVariablePress={onVariablePress}
						/>
					);
				}

				if (message.role === "user") {
					return (
						<UserMessage
							key={`${index + 1}`}
							value={message.content}
							onValueChange={(content) => {
								const newMessages = [...value];

								if (content === null) {
									newMessages.splice(index, 1);
								} else {
									newMessages[index] = {
										role: "user",
										content,
									};
								}

								onValueChange(newMessages);
							}}
							onVariablePress={onVariablePress}
						/>
					);
				}

				if (message.role === "assistant") {
					return (
						<AssistantMessage
							key={`${index + 1}`}
							isReadOnly={isReadOnly}
							value={message.content}
							onValueChange={(content) => {
								const newMessages = [...value];

								if (content === null) {
									newMessages.splice(index, 1);
								} else {
									newMessages[index] = {
										role: "assistant",
										content,
									};
								}

								onValueChange(newMessages);
							}}
							onVariablePress={onVariablePress}
						/>
					);
				}

				if (message.role === "tool") {
					return (
						<ToolMessage
							key={`${index + 1}`}
							isReadOnly={isReadOnly}
							value={message.content}
							onValueChange={(content) => {
								const newMessages = [...value];

								if (content === null) {
									newMessages.splice(index, 1);
								} else {
									newMessages[index] = {
										role: "tool",
										content,
									};
								}

								onValueChange(newMessages);
							}}
							onVariablePress={onVariablePress}
						/>
					);
				}

				return null;
			})}
		</div>
	);
}
