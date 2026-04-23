import { ComboBox, Input, ListBox } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { LucideBot } from "lucide-react";
import { agentsLiteQuery } from "@/lib/queries";

interface AgentFilterProps {
	workspaceId: string;
	value: string | undefined;
	onValueChange: (value: string | undefined) => void;
}

export function AgentFilter({
	workspaceId,
	value,
	onValueChange,
}: AgentFilterProps) {
	const { data: agents } = useQuery(agentsLiteQuery(workspaceId));

	return (
		<ComboBox
			aria-label="Filter by agent"
			className="w-64"
			selectedKey={value ?? null}
			onSelectionChange={(key) => {
				onValueChange(key ? String(key) : undefined);
			}}
		>
			<ComboBox.InputGroup>
				<LucideBot className="size-3.5 shrink-0" />
				<Input placeholder="All Agents" />
				<ComboBox.Trigger />
			</ComboBox.InputGroup>
			<ComboBox.Popover className="w-96">
				<ListBox items={agents || []}>
					{(agent) => (
						<ListBox.Item id={agent.id} textValue={agent.name}>
							{agent.name}
							<ListBox.ItemIndicator />
						</ListBox.Item>
					)}
				</ListBox>
			</ComboBox.Popover>
		</ComboBox>
	);
}
