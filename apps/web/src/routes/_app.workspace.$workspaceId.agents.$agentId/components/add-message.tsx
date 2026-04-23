import { Button, Dropdown, Label } from "@heroui/react";
import { LucideListPlus } from "lucide-react";
import { nanoid } from "nanoid";
import type { MessageT } from "@/components/messages";

export function AddMessage({ onAdd }: { onAdd: (m: MessageT) => void }) {
	return (
		<Dropdown>
			<Button size="sm" variant="tertiary">
				<LucideListPlus className="size-3.5" />
				Add
			</Button>
			<Dropdown.Popover>
				<Dropdown.Menu
					onAction={(key) => {
						if (key === "user") {
							onAdd({
								id: nanoid(),
								role: "user",
								content: [{ type: "text", text: "" }],
							});
						} else if (key === "assistant") {
							onAdd({
								id: nanoid(),
								role: "assistant",
								content: [{ type: "text", text: "" }],
							});
						} else if (key === "tool") {
							onAdd({
								id: nanoid(),
								role: "tool",
								content: [
									{
										type: "tool-result",
										toolCallId: "",
										toolName: "",
										output: {
											type: "json",
											value: {},
										},
									},
								],
							});
						}
					}}
				>
					<Dropdown.Item id="user" textValue="User Message">
						<Label>User Message</Label>
					</Dropdown.Item>
					<Dropdown.Item id="assistant" textValue="Assistant Message">
						<Label>Assistant Message</Label>
					</Dropdown.Item>
					<Dropdown.Item id="tool" textValue="Tool Message">
						<Label>Tool Message</Label>
					</Dropdown.Item>
				</Dropdown.Menu>
			</Dropdown.Popover>
		</Dropdown>
	);
}
