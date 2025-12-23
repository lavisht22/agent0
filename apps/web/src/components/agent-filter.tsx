import { Autocomplete, AutocompleteItem } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { LucideBot } from "lucide-react";
import { agentsLiteQuery, agentsQuery } from "@/lib/queries";

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
		<Autocomplete
			startContent={<LucideBot className="size-3.5 shrink-0" />}
			variant="bordered"
			aria-label="Filter by agent"
			placeholder="All Agents"
			size="sm"
			classNames={{
				base: "w-64",
				popoverContent: "w-96",
			}}
			isClearable
			selectedKey={value ?? null}
			onSelectionChange={(key) => {
				onValueChange(key ? String(key) : undefined);
			}}
		>
			{(agents || []).map((agent) => (
				<AutocompleteItem key={agent.id}>{agent.name}</AutocompleteItem>
			))}
		</Autocomplete>
	);
}
