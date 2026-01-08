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
import { LucidePlus, LucideTrash2 } from "lucide-react";
import { useMemo } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { z } from "zod";
import { ThemedJsonEditor } from "./themed-json-editor";
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
			<div className="w-full space-y-2 bg-default-50 dark:bg-default-100 rounded-large">
				<ThemedJsonEditor
					viewOnly={isReadOnly}
					data={value}
					setData={(newData) => {
						onValueChange(newData as AssistantMessageContent[number]);
					}}
				/>
			</div>
		);
	}
}

export function AssistantMessage({
	id,
	isReadOnly,
	value,
	onValueChange,
	onVariablePress,
}: {
	id: string;
	isReadOnly?: boolean;
	value: AssistantMessageContent;
	onValueChange: (value: AssistantMessageContent | null) => void;
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
				<span className="text-sm text-default-500">Assistant | {id}</span>
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
