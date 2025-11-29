import {
	Button,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
	Table,
	TableBody,
	TableCell,
	TableColumn,
	TableHeader,
	TableRow,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LucideEllipsisVertical, Plus } from "lucide-react";
import { agentsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/workspace/$workspaceId/agents/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();

	// Fetch Agents
	const { data: agents, isLoading } = useQuery(agentsQuery(workspaceId));

	return (
		<div className="p-6">
			<div className="flex justify-between items-center mb-6">
				<div>
					<h1 className="text-2xl font-medium tracking-tight">Agents</h1>
					<p className="text-default-500">
						Manage your AI agents in this workspace
					</p>
				</div>
				<Button
					color="primary"
					startContent={<Plus size={18} />}
					onPress={() =>
						navigate({
							to: "/workspace/$workspaceId/agents/$agentId",
							params: { workspaceId, agentId: "new" },
						})
					}
				>
					Create
				</Button>
			</div>

			<Table
				onRowAction={(key) => {
					console.log("ROW", key);
					if (!key) return;
					navigate({
						to: key.toString(),
					});
				}}
				shadow="none"
				classNames={{ wrapper: "p-0" }}
			>
				<TableHeader>
					<TableColumn>Name</TableColumn>
					<TableColumn className="w-20" hideHeader>
						Actions
					</TableColumn>
				</TableHeader>
				<TableBody
					items={agents || []}
					isLoading={isLoading}
					emptyContent="You haven't created any agents yet."
				>
					{(item) => (
						<TableRow key={item.id} className="hover:bg-default-100">
							<TableCell>{item.name}</TableCell>
							<TableCell className="flex justify-end">
								<Dropdown>
									<DropdownTrigger>
										<Button isIconOnly variant="light">
											<LucideEllipsisVertical className="size-4" />
										</Button>
									</DropdownTrigger>
									<DropdownMenu>
										<DropdownItem
											key={item.id}
											onPress={() => navigate({ to: item.id })}
										>
											Edit agent
										</DropdownItem>
									</DropdownMenu>
								</Dropdown>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
