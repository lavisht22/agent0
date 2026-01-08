import { Card, CardBody, CardHeader } from "@heroui/react";
import { Reorder } from "framer-motion";
import { useMemo } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { z } from "zod";
import { Variables } from "./variables";

export const systemMessageSchema = z.object({
	id: z.string(),
	role: z.literal("system"),
	content: z.string().min(1, "System message content is required"),
	providerOptions: z.any().optional(),
});

export type SystemMessageT = z.infer<typeof systemMessageSchema>;

export function SystemMessage({
	isReadOnly,
	value,
	onValueChange,
	onVariablePress,
}: {
	isReadOnly?: boolean;
	value: SystemMessageT;
	onValueChange: (value: SystemMessageT) => void;
	onVariablePress: () => void;
}) {
	const variables = useMemo(() => {
		if (typeof value.content !== "string") return [];

		const matches = value.content.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value.content]);

	return (
		<Reorder.Item key={value.id} value={value} dragListener={false}>
			<Card>
				<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
					<span className="text-sm text-default-500">System</span>
				</CardHeader>
				<CardBody className="p-3 border-t border-default-200 gap-4">
					<TextareaAutosize
						className="outline-none w-full resize-none text-sm scrollbar-hide"
						readOnly={isReadOnly}
						placeholder="Enter system message..."
						maxRows={1000}
						value={value.content}
						onChange={(e) =>
							onValueChange({ ...value, content: e.target.value })
						}
					/>
					<Variables variables={variables} onVariablePress={onVariablePress} />
				</CardBody>
			</Card>
		</Reorder.Item>
	);
}
