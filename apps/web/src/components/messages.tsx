import {
	Button,
	Card,
	CardBody,
	CardHeader,
	cn,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
	Input,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	Radio,
	RadioGroup,
} from "@heroui/react";
import { defaultTheme, JsonEditor } from "json-edit-react";
import {
	LucideBraces,
	LucideFileText,
	LucidePlus,
	LucideTrash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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

	if (value.type === "image") {
		// Construct the image src from base64 or URL
		const imageSrc = value.image.startsWith("data:")
			? value.image
			: value.image.startsWith("http")
				? value.image
				: `data:${value.mediaType || "image/png"};base64,${value.image}`;

		return (
			<div className="bg-default-50 w-full rounded-large p-2 flex justify-center items-center">
				<img
					src={imageSrc}
					alt="Preview"
					className="max-w-full max-h-full h-48 object-contain"
					onError={(e) => {
						// Show placeholder on error
						e.currentTarget.style.display = "none";
					}}
				/>
			</div>
		);
	}

	if (value.type === "file") {
		// Calculate approximate file size from base64 string
		const approximateSize = value.data
			? Math.round((value.data.length * 3) / 4 / 1024)
			: 0;
		const sizeDisplay =
			approximateSize > 1024
				? `${(approximateSize / 1024).toFixed(2)} MB`
				: `${approximateSize} KB`;

		return (
			<div className="bg-default-50 w-full rounded-large p-3">
				<div className="flex items-center gap-3">
					<div className="shrink-0 w-12 h-12 bg-default-200 rounded-lg flex items-center justify-center">
						<LucideFileText className="size-6 text-default-600" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-default-900 truncate">
							{value.mediaType || "Unknown file type"}
						</p>
						{approximateSize > 0 && (
							<p className="text-xs text-default-500">{sizeDisplay}</p>
						)}
					</div>
				</div>
			</div>
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
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isEmbedModalOpen, setIsEmbedModalOpen] = useState(false);
	const [embedType, setEmbedType] = useState<"image" | "file">("image");
	const [embedData, setEmbedData] = useState("");
	const [embedMediaType, setEmbedMediaType] = useState("");

	const variables = useMemo(() => {
		const str = JSON.stringify(value);

		const matches = str.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value]);

	// Convert file to base64
	const fileToBase64 = (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				// Remove data URL prefix if present
				const base64 = result.includes(",") ? result.split(",")[1] : result;
				resolve(base64);
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	};

	// Handle file upload
	const handleFileUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		try {
			const base64Data = await fileToBase64(file);
			const newContent = [...value];

			// Detect if it's an image based on MIME type
			if (file.type.startsWith("image/")) {
				newContent.push({
					type: "image",
					image: base64Data,
					mediaType: file.type,
				});
			} else {
				newContent.push({
					type: "file",
					data: base64Data,
					mediaType: file.type,
				});
			}

			onValueChange(newContent);
		} catch (error) {
			console.error("Error converting file to base64:", error);
		}

		// Reset file input
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	// Handle embed modal submit
	const handleEmbedSubmit = () => {
		const newContent = [...value];

		if (embedType === "image") {
			newContent.push({
				type: "image",
				image: embedData,
				mediaType: embedMediaType || undefined,
			});
		} else {
			newContent.push({
				type: "file",
				data: embedData,
				mediaType: embedMediaType,
			});
		}

		onValueChange(newContent);
		setIsEmbedModalOpen(false);
		setEmbedData("");
		setEmbedMediaType("");
		setEmbedType("image");
	};

	return (
		<>
			<Card>
				<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
					<span className="text-sm text-default-500">User</span>
					<Dropdown>
						<DropdownTrigger>
							<Button size="sm" isIconOnly variant="light">
								<LucidePlus className="size-3.5" />
							</Button>
						</DropdownTrigger>
						<DropdownMenu>
							<DropdownItem
								key="upload"
								onPress={() => fileInputRef.current?.click()}
							>
								Upload
							</DropdownItem>
							<DropdownItem
								key="embed"
								onPress={() => setIsEmbedModalOpen(true)}
							>
								Embed
							</DropdownItem>
						</DropdownMenu>
					</Dropdown>
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

			{/* Hidden file input for upload */}
			<input
				ref={fileInputRef}
				type="file"
				className="hidden"
				onChange={handleFileUpload}
			/>

			{/* Embed Modal */}
			<Modal isOpen={isEmbedModalOpen} onOpenChange={setIsEmbedModalOpen}>
				<ModalContent>
					{(onClose) => (
						<>
							<ModalHeader>Embed Content</ModalHeader>
							<ModalBody>
								<RadioGroup
									label="Content Type"
									value={embedType}
									onValueChange={(value) =>
										setEmbedType(value as "image" | "file")
									}
								>
									<Radio value="image">Image</Radio>
									<Radio value="file">File</Radio>
								</RadioGroup>

								<Input
									variant="bordered"
									label={embedType === "image" ? "Image Data" : "File Data"}
									placeholder="Base64 encoded data or URL"
									value={embedData}
									onChange={(e) => setEmbedData(e.target.value)}
								/>

								<Input
									variant="bordered"
									label="Media Type"
									placeholder={
										embedType === "image"
											? "e.g., image/png (optional)"
											: "e.g., application/pdf"
									}
									value={embedMediaType}
									onChange={(e) => setEmbedMediaType(e.target.value)}
									isRequired={embedType === "file"}
								/>
							</ModalBody>
							<ModalFooter>
								<Button variant="light" onPress={onClose}>
									Cancel
								</Button>
								<Button
									color="primary"
									onPress={handleEmbedSubmit}
									isDisabled={
										!embedData || (embedType === "file" && !embedMediaType)
									}
								>
									Add
								</Button>
							</ModalFooter>
						</>
					)}
				</ModalContent>
			</Modal>
		</>
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
					<Dropdown>
						<DropdownTrigger>
							<Button size="sm" isIconOnly variant="light">
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
			<div
				className={cn(
					"w-full space-y-2 bg-default-50 rounded-large",
					(value.output as { type: string; value: unknown })?.type.startsWith(
						"error",
					)
						? "bg-red-50"
						: "",
				)}
			>
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
