import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerHeader,
	Textarea,
} from "@heroui/react";
import { useMemo } from "react";
import type { MessageT } from "./messages";

interface VariablesDrawerProps {
	isOpen: boolean;
	onOpenChange: () => void;
	messages: MessageT[];
	values: Record<string, string>;
	onValuesChange: (values: Record<string, string>) => void;
}

export function VariablesDrawer({
	isOpen,
	onOpenChange,
	messages,
	values,
	onValuesChange,
}: VariablesDrawerProps) {
	const variables = useMemo(() => {
		const vars = new Set<string>();

		const extract = (text: string) => {
			const matches = text.matchAll(/\{\{(.*?)\}\}/g);
			for (const m of matches) {
				vars.add(m[1].trim());
			}
		};

		for (const msg of messages) {
			if (msg.role === "system") {
				extract(msg.content);
			} else if (msg.role === "user" || msg.role === "assistant") {
				for (const part of msg.content) {
					if (part.type === "text") {
						extract(part.text);
					}
				}
			}
		}

		return Array.from(vars);
	}, [messages]);

	return (
		<Drawer isOpen={isOpen} onOpenChange={onOpenChange} scrollBehavior="inside">
			<DrawerContent>
				<DrawerHeader>Variables</DrawerHeader>
				<DrawerBody>
					<div className="flex flex-col gap-4">
						{variables.length === 0 && (
							<p className="text-default-500 text-sm">
								No variables found in messages.
							</p>
						)}
						{variables.map((variable) => (
							<Textarea
								maxRows={10}
								key={variable}
								label={variable}
								placeholder={`Value for ${variable}`}
								value={values[variable] || ""}
								onValueChange={(val) =>
									onValuesChange({ ...values, [variable]: val })
								}
							/>
						))}
					</div>
				</DrawerBody>
			</DrawerContent>
		</Drawer>
	);
}
