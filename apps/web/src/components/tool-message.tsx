import { Button, Card, cn } from "@heroui/react";
import { Reorder, useDragControls } from "framer-motion";
import { LucideGripVertical, LucideX } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { MonacoJsonEditor } from "./monaco-json-editor";
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
					"border border-border overflow-hidden rounded-[14px] w-full space-y-2",
					(value.output as { type: string; value: unknown })?.type.startsWith(
						"error",
					)
						? "border-danger"
						: "",
				)}
			>
				<MonacoJsonEditor
					readOnly={isReadOnly}
					value={JSON.stringify(value, null, 2)}
					onValueChange={(newData) => {
						onValueChange(JSON.parse(newData));
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

	const controls = useDragControls();

	return (
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
						<span className="text-sm text-muted">Tool</span>
					</div>
				</Card.Header>
				<Card.Content className="gap-3">
					{value.content.map((part, index) => {
						return (
							<div key={`${index + 1}`} className="flex items-start">
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
					{variables.length > 0 && (
						<Variables
							variables={variables}
							onVariablePress={onVariablePress}
						/>
					)}
				</Card.Content>
			</Card>
		</Reorder.Item>
	);
}
