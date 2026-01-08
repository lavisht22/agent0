import { Button, Card, CardBody, CardHeader, cn } from "@heroui/react";
import { LucideTrash2 } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { ThemedJsonEditor } from "./themed-json-editor";
import { Variables } from "./variables";

export const toolMessageSchema = z.object({
	id: z.string(),
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

type ToolMessageContent = z.infer<typeof toolMessageSchema>["content"];

function ToolMessagePart({
	isReadOnly,
	value,
	onValueChange,
}: {
	isReadOnly?: boolean;
	value: ToolMessageContent[number];
	onValueChange: (value: ToolMessageContent[number]) => void;
}) {
	if (value.type === "tool-result") {
		return (
			<div
				className={cn(
					"w-full space-y-2 bg-default-50 dark:bg-default-100 rounded-large",
					(value.output as { type: string; value: unknown })?.type.startsWith(
						"error",
					)
						? "bg-red-50 dark:bg-red-900/30"
						: "",
				)}
			>
				<ThemedJsonEditor
					viewOnly={isReadOnly}
					data={value}
					setData={(newData) => {
						onValueChange(newData as ToolMessageContent[number]);
					}}
				/>
			</div>
		);
	}
}

export type ToolMessageT = z.infer<typeof toolMessageSchema>;

export function ToolMessage({
	isReadOnly,
	value,
	onValueChange,
	onVariablePress,
}: {
	isReadOnly?: boolean;
	value: ToolMessageT;
	onValueChange: (value: ToolMessageT | null) => void;
	onVariablePress: () => void;
}) {
	const variables = useMemo(() => {
		const str = JSON.stringify(value.content);

		const matches = str.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value.content]);

	return (
		<Card>
			<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
				<span className="text-sm text-default-500">Tool | {value.id}</span>
			</CardHeader>
			<CardBody className="p-3 border-t border-default-200 flex flex-col gap-3">
				{value.content.map((part, index) => {
					return (
						<div key={`${index + 1}`} className="flex">
							<ToolMessagePart
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
				{variables.length > 0 && (
					<Variables variables={variables} onVariablePress={onVariablePress} />
				)}
			</CardBody>
		</Card>
	);
}
