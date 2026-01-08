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
