import { Reorder } from "framer-motion";
import { z } from "zod";
import { AssistantMessage, assistantMessageSchema } from "./assistant-message";
import { SystemMessage, systemMessageSchema } from "./system-message";
import { ToolMessage, toolMessageSchema } from "./tool-message";
import { UserMessage, userMessageSchema } from "./user-message";

export const messageSchema = z.discriminatedUnion("role", [
	systemMessageSchema,
	userMessageSchema,
	assistantMessageSchema,
	toolMessageSchema,
]);

export type MessageT = z.infer<typeof messageSchema>;

// The AI SDK types assistant/user content as `string | Array<...part>`: a
// plain-text reply (no tool calls) is stored as a bare string. Our message
// components assume content is always an array of parts, so wrap any string
// content in a single text part before rendering. Response messages also lack
// an `id`, so synthesize a stable one for React keys / reordering.
export function normalizeMessages(messages: MessageT[]): MessageT[] {
	return messages.map((message, index) => {
		const m = message as MessageT & { id?: string };
		const id = m.id ?? `msg-${index}`;
		const content: unknown = (m as { content: unknown }).content;

		if (
			(m.role === "assistant" || m.role === "user") &&
			typeof content === "string"
		) {
			return {
				...m,
				id,
				content: [{ type: "text", text: content }],
			} as MessageT;
		}

		return (m.id ? m : { ...m, id }) as MessageT;
	});
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
		<Reorder.Group
			axis="y"
			values={value}
			onReorder={onValueChange}
			className="flex flex-col gap-4"
		>
			{value.map((message, index) => {
				if (message.role === "system") {
					return (
						<SystemMessage
							key={message.id}
							isReadOnly={isReadOnly}
							value={message}
							onValueChange={(updatedMessage) => {
								const newMessages = [...value];
								newMessages[index] = updatedMessage;
								onValueChange(newMessages);
							}}
							onVariablePress={onVariablePress}
						/>
					);
				}

				if (message.role === "user") {
					return (
						<UserMessage
							key={message.id}
							isReadOnly={isReadOnly}
							value={message}
							onValueChange={(updatedMessage) => {
								const newMessages = [...value];

								if (updatedMessage === null) {
									newMessages.splice(index, 1);
								} else {
									newMessages[index] = updatedMessage;
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
							key={message.id}
							isReadOnly={isReadOnly}
							value={message}
							onValueChange={(updatedMessage) => {
								const newMessages = [...value];

								if (updatedMessage === null) {
									newMessages.splice(index, 1);
								} else {
									newMessages[index] = updatedMessage;
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
							key={message.id}
							isReadOnly={isReadOnly}
							value={message}
							onValueChange={(updatedMessage) => {
								const newMessages = [...value];

								if (updatedMessage === null) {
									newMessages.splice(index, 1);
								} else {
									newMessages[index] = updatedMessage;
								}

								onValueChange(newMessages);
							}}
							onVariablePress={onVariablePress}
						/>
					);
				}

				return null;
			})}
		</Reorder.Group>
	);
}
