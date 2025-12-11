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
		<div className="flex flex-col gap-4">
			{value.map((message, index) => {
				if (message.role === "system") {
					return (
						<SystemMessage
							key={`${index + 1}`}
							isReadOnly={isReadOnly}
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
							isReadOnly={isReadOnly}
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
