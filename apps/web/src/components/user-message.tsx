import { Button, Card } from "@heroui/react";
import { Reorder, useDragControls } from "framer-motion";
import {
	LucideFileText,
	LucideGripVertical,
	LucidePlus,
	LucideX,
} from "lucide-react";
import { useMemo, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { z } from "zod";
import {
	formatBase64Size,
	imageSrc,
	isImageMediaType,
	resolveFileData,
} from "@/lib/file-data";
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
			<div
				className={`w-full min-w-0${isReadOnly ? " max-h-80 overflow-y-auto scrollbar-thin" : ""}`}
			>
				<TextareaAutosize
					className="outline-none w-full resize-none text-sm scrollbar-hide"
					readOnly={isReadOnly}
					placeholder="Enter user message..."
					maxRows={1000000000000}
					value={value.text}
					onChange={(e) => onValueChange({ ...value, text: e.target.value })}
				/>
			</div>
		);
	}

	if (value.type === "image") {
		// v7 may wrap the bytes as `{ type: "data", data }`; older parts (and
		// everything the editor writes) store a bare base64 string or URL.
		const file = resolveFileData(value.image);

		if (!file) {
			return null;
		}

		return (
			<div className="bg-surface-secondary w-full rounded-[14px] p-2 flex justify-center items-center">
				<img
					src={imageSrc(file, value.mediaType)}
					alt="Preview"
					className="max-w-full max-h-full h-48 object-contain"
					onError={(e) => {
						e.currentTarget.style.display = "none";
					}}
				/>
			</div>
		);
	}

	if (value.type === "file") {
		const file = resolveFileData(value.data);

		// v7 writes images as file parts too, so preview them like image parts.
		if (file && file.kind !== "text" && isImageMediaType(value.mediaType)) {
			return (
				<div className="bg-surface-secondary w-full rounded-[14px] p-2 flex justify-center items-center">
					<img
						src={imageSrc(file, value.mediaType)}
						alt="Preview"
						className="max-w-full max-h-full h-48 object-contain"
						onError={(e) => {
							e.currentTarget.style.display = "none";
						}}
					/>
				</div>
			);
		}

		const sizeDisplay =
			file?.kind === "base64" ? formatBase64Size(file.value) : null;

		return (
			<div className="bg-surface-secondary w-full rounded-[14px] p-3">
				<div className="flex items-center gap-3">
					<div className="shrink-0 w-12 h-12 bg-surface-tertiary rounded-lg flex items-center justify-center">
						<LucideFileText className="size-6 text-foreground" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-foreground truncate">
							{value.mediaType || "Unknown file type"}
						</p>
						{sizeDisplay && <p className="text-xs text-muted">{sizeDisplay}</p>}
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

	const variables = useMemo(() => {
		const str = JSON.stringify(value.content);

		const matches = str.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value.content]);

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

	const handleFileUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const files = Array.from(event.target.files ?? []);
		if (files.length === 0) return;

		try {
			// v7 deprecated `image` parts; images and other files are both `file`
			// parts now, told apart only by media type. `mediaType` is required
			// here where it was optional on `image`, and the browser reports an
			// empty `file.type` for extensionless files.
			const parts = files.map(async (file) => ({
				type: "file" as const,
				data: await fileToBase64(file),
				mediaType: file.type || "application/octet-stream",
			}));

			// One update for the whole selection. `value` is captured from props,
			// so appending a part at a time would have each write overwrite the
			// one before it and only the last file would survive.
			onValueChange({
				...value,
				content: [...value.content, ...(await Promise.all(parts))],
			});
		} catch (error) {
			console.error("Error converting file to base64:", error);
		}

		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const controls = useDragControls();

	return (
		<>
			<Reorder.Item
				key={value.id}
				value={value}
				layout="position"
				dragListener={false}
				dragControls={controls}
			>
				<Card className="text-default-foreground">
					<Card.Header className="flex flex-row items-center justify-between z-0">
						<div className="flex items-center gap-2">
							{!isReadOnly && (
								<div
									className="reorder-handle cursor-grab"
									onPointerDown={(e) => controls.start(e)}
								>
									<LucideGripVertical className="size-3.5 text-muted" />
								</div>
							)}
							<span className="text-sm text-muted">User</span>
						</div>
						{!isReadOnly && (
							<Button
								size="sm"
								isIconOnly
								variant="tertiary"
								aria-label="Attach files"
								onPress={() => fileInputRef.current?.click()}
							>
								<LucidePlus className="size-3.5" />
							</Button>
						)}
					</Card.Header>
					<Card.Content className="gap-2">
						{value.content.map((part, index) => {
							return (
								<div key={`${index + 1}`} className="flex items-start">
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
						<Variables
							variables={variables}
							onVariablePress={onVariablePress}
						/>
					</Card.Content>
				</Card>
			</Reorder.Item>

			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={handleFileUpload}
			/>
		</>
	);
}
