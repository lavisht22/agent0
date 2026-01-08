import {
	Button,
	Card,
	CardBody,
	CardHeader,
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
import { LucideFileText, LucidePlus, LucideTrash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { z } from "zod";
import { Variables } from "./variables";

export const userMessageSchema = z.object({
	id: z.string(),
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

type UserMessageContent = z.infer<typeof userMessageSchema>["content"];

function UserMessagePart({
	isReadOnly,
	value,
	onValueChange,
}: {
	isReadOnly?: boolean;
	value: UserMessageContent[number];
	onValueChange: (value: UserMessageContent[number]) => void;
}) {
	if (value.type === "text") {
		return (
			<TextareaAutosize
				className="outline-none w-full resize-none text-sm scrollbar-hide"
				readOnly={isReadOnly}
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

export type UserMessageT = z.infer<typeof userMessageSchema>;

export function UserMessage({
	isReadOnly,
	value,
	onValueChange,
	onVariablePress,
}: {
	isReadOnly?: boolean;
	value: UserMessageT;
	onValueChange: (value: UserMessageT | null) => void;
	onVariablePress: () => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isEmbedModalOpen, setIsEmbedModalOpen] = useState(false);
	const [embedType, setEmbedType] = useState<"image" | "file">("image");
	const [embedData, setEmbedData] = useState("");
	const [embedMediaType, setEmbedMediaType] = useState("");

	const variables = useMemo(() => {
		const str = JSON.stringify(value.content);

		const matches = str.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value.content]);

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
			const newContent = [...value.content];

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

			onValueChange({ ...value, content: newContent });
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
		const newContent = [...value.content];

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

		onValueChange({ ...value, content: newContent });
		setIsEmbedModalOpen(false);
		setEmbedData("");
		setEmbedMediaType("");
		setEmbedType("image");
	};

	return (
		<>
			<Card>
				<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
					<span className="text-sm text-default-500">User | {value.id}</span>
					{!isReadOnly && (
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
					)}
				</CardHeader>
				<CardBody className="p-3 border-t border-default-200 flex flex-col gap-2">
					{value.content.map((part, index) => {
						return (
							<div key={`${index + 1}`} className="flex">
								<UserMessagePart
									isReadOnly={isReadOnly}
									value={part}
									onValueChange={(v) => {
										const newContent = [...value.content];
										newContent[index] = v;
										onValueChange({ ...value, content: newContent });
									}}
								/>

								{!isReadOnly && (
									<Button
										className="-mr-2"
										size="sm"
										isIconOnly
										variant="light"
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
										<LucideTrash2 className="size-3.5" />
									</Button>
								)}
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
