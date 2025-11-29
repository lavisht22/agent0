import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { LucideMinusCircle, LucideTrash } from "lucide-react";
import { z } from "zod";
import { VariablesTextArea } from "./variables-text-area";

const systemMessageSchema = z.object({
	role: z.literal("system"),
	content: z.string().min(1, "System message content is required"),
});

const userMessageSchema = z.object({
	role: z.literal("user"),
	content: z
		.array(
			z.union([
				z.object({
					type: z.literal("text"),
					text: z.string(),
				}),
				z.object({
					type: z.literal("image"),
					image: z.string(),
					mediaType: z.string().optional(),
				}),
				z.object({
					type: z.literal("file"),
					data: z.string(),
					mediaType: z.string(),
				}),
			]),
		)
		.min(1, "User message must have at least one content part"),
});

export const assistantMessageSchema = z.object({
	role: z.literal("assistant"),
	content: z
		.array(
			z.union([
				z.object({
					type: z.literal("text"),
					text: z.string(),
				}),
				z.object({
					type: z.literal("reasoning"),
					text: z.string(),
				}),
				z.object({
					type: z.literal("file"),
					data: z.string(),
					mediaType: z.string(),
					fileName: z.string().optional(),
				}),
				z.object({
					type: z.literal("tool-call"),
					toolCallId: z.string(),
					toolName: z.string(),
					input: z.any(),
				}),
				z.object({
					type: z.literal("tool-result"),
					toolCallId: z.string(),
					toolName: z.string(),
					output: z.any(),
					isError: z.boolean().optional(),
				}),
			]),
		)
		.min(1, "Assistant message must have at least one content part"),
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
		}),
	),
});

export const messageSchema = z.discriminatedUnion("role", [
	systemMessageSchema,
	userMessageSchema,
	assistantMessageSchema,
	toolMessageSchema,
]);

export type MessageT = z.infer<typeof messageSchema>;

function SystemMessage({
	value,
	onValueChange,
}: {
	value: string;
	onValueChange: (value: string) => void;
}) {
	return (
		<Card>
			<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
				<span className="text-sm text-default-500">System</span>
			</CardHeader>
			<CardBody className="p-3 border-t border-default-200">
				<VariablesTextArea
					placeholder="Enter system message..."
					maxRows={1000000000000}
					value={value}
					onChange={(e) => onValueChange(e.target.value)}
					onVariablePress={() => {}}
				/>
			</CardBody>
		</Card>
	);
}

function UserMessage({
	value,
	onValueChange,
}: {
	value: Extract<MessageT, { role: "user" }>["content"];
	onValueChange: (
		value: Extract<MessageT, { role: "user" }>["content"] | null,
	) => void;
}) {
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
						<LucideMinusCircle className="size-3.5" />
					</Button>
				</div>
			</CardHeader>
			<CardBody className="p-3 border-t border-default-200 flex flex-col gap-2">
				{value.map((part, index) => {
					if (part.type === "text") {
						return (
							<div key={`${index + 1}`}>
								<div className="flex">
									<VariablesTextArea
										maxRows={1000000000000}
										placeholder="Enter user message..."
										value={part.text}
										onChange={(e) => {
											const newContent = [...value];
											newContent[index] = { ...part, text: e.target.value };
											onValueChange(newContent);
										}}
										onVariablePress={() => {}}
									/>
									<Button
										className="-mr-2"
										size="sm"
										isIconOnly
										variant="light"
										onPress={() => {
											const newContent = [...value];
											newContent.splice(index, 1);
											onValueChange(newContent);
										}}
									>
										<LucideTrash className="size-3.5" />
									</Button>
								</div>
							</div>
						);
					}
					return null;
				})}
			</CardBody>
		</Card>
	);
}

function AssistantMessage({
	isReadOnly,
	value,
	onValueChange,
}: {
	isReadOnly?: boolean;
	value: Extract<MessageT, { role: "assistant" }>["content"];
	onValueChange: (
		value: Extract<MessageT, { role: "assistant" }>["content"] | null,
	) => void;
}) {
	return (
		<Card>
			<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
				<span className="text-sm text-default-500">Assistant</span>
				{!isReadOnly && (
					<div className="flex gap-2">
						<Button
							size="sm"
							isIconOnly
							variant="light"
							onPress={() => onValueChange(null)}
						>
							<LucideMinusCircle className="size-3.5" />
						</Button>
					</div>
				)}
			</CardHeader>
			<CardBody className="p-3 border-t border-default-200 flex flex-col gap-2">
				{value.map((part, index) => {
					if (part.type === "text") {
						return (
							<div key={`${index + 1}`} className="flex">
								<VariablesTextArea
									readOnly={isReadOnly}
									maxRows={1000000000000}
									placeholder="Enter assistant message..."
									value={part.text}
									onChange={(e) => {
										const newContent = [...value];
										newContent[index] = { ...part, text: e.target.value };
										onValueChange(newContent);
									}}
									onVariablePress={() => {}}
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
											onValueChange(newContent);
										}}
									>
										<LucideTrash className="size-3.5" />
									</Button>
								)}
							</div>
						);
					}
					return null;
				})}
			</CardBody>
		</Card>
	);
}

interface MessagesProps {
	value: MessageT[];
	onValueChange: (value: MessageT[]) => void;
	isReadOnly?: boolean;
}

export function Messages({
	value,
	onValueChange,
	isReadOnly = false,
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
						/>
					);
				}

				return null;
			})}
		</div>
	);
}
