import { Card, CardBody, CardHeader } from "@heroui/react";
import { useMemo } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { z } from "zod";
import { Variables } from "./variables";

export const systemMessageSchema = z.object({
	role: z.literal("system"),
	content: z.string().min(1, "System message content is required"),
	providerOptions: z.any().optional(),
});

export function SystemMessage({
	isReadOnly,
	value,
	onValueChange,
	onVariablePress,
}: {
	isReadOnly?: boolean;
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
					readOnly={isReadOnly}
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
