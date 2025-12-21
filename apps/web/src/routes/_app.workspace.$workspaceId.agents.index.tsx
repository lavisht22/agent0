import {
	addToast,
	Button,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
	Spinner,
	Table,
	TableBody,
	TableCell,
	TableColumn,
	TableHeader,
	TableRow,
	Tooltip,
	useDisclosure,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
	LucideChevronLeft,
	LucideChevronRight,
	LucideEllipsisVertical,
	Plus,
} from "lucide-react";
import { useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import IDCopy from "@/components/id-copy";
import { agentsQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/workspace/$workspaceId/agents/")({
	component: RouteComponent,
	validateSearch: (
		search: Record<string, unknown>,
	): {
		page: number;
	} => ({
		page: Number(search?.page ?? 1),
	}),
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const { page } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();

	// Delete confirmation modal state
	const { isOpen, onOpen, onOpenChange } = useDisclosure();
	const [agentToDelete, setAgentToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Fetch Agents
	const { data: agents, isLoading } = useQuery(agentsQuery(workspaceId, page));

	// Delete mutation
	const deleteMutation = useMutation({
		mutationFn: async (agentId: string) => {
			const { error } = await supabase
				.from("agents")
				.delete()
				.eq("id", agentId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			addToast({
				description: "Agent deleted successfully.",
				color: "success",
			});
			onOpenChange();
			setAgentToDelete(null);
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to delete agent.",
				color: "danger",
			});
		},
	});

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<div className="flex justify-between items-center h-16 border-b border-default-200 box-content px-4">
				<h1 className="text-xl font-medium tracking-tight">Agents</h1>

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
				aria-label="Agents Table"
				onRowAction={(key) => {
					if (!key) return;
					navigate({
						to: "$agentId",
						params: {
							agentId: key.toString(),
						},
					});
				}}
				shadow="none"
				classNames={{
					base: "overflow-auto flex-1 w-full",
				}}
				isHeaderSticky
				topContent={
					<div className="w-full flex justify-end items-center">
						<div className="flex gap-2">
							<Tooltip content="Previous">
								<Button
									size="sm"
									isIconOnly
									variant="flat"
									isDisabled={page === 1}
									onPress={() =>
										navigate({
											search: {
												page: page - 1,
											},
										})
									}
								>
									<LucideChevronLeft className="size-3.5" />
								</Button>
							</Tooltip>
							<Tooltip content="Next">
								<Button
									size="sm"
									isIconOnly
									variant="flat"
									isDisabled={!agents || agents.length < 20}
									onPress={() =>
										navigate({
											search: {
												page: page + 1,
											},
										})
									}
								>
									<LucideChevronRight className="size-3.5" />
								</Button>
							</Tooltip>
						</div>
					</div>
				}
			>
				<TableHeader>
					<TableColumn>Name</TableColumn>
					<TableColumn>ID</TableColumn>
					<TableColumn>Created At</TableColumn>
					<TableColumn className="w-20" hideHeader>
						Actions
					</TableColumn>
				</TableHeader>
				<TableBody
					items={agents || []}
					isLoading={isLoading}
					loadingContent={<Spinner />}
					emptyContent="You haven't created any agents yet."
				>
					{(item) => (
						<TableRow key={item.id} className="hover:bg-default-100">
							<TableCell>{item.name}</TableCell>
							<TableCell>
								<IDCopy id={item.id} />
							</TableCell>
							<TableCell>{format(item.created_at, "d LLL, hh:mm a")}</TableCell>
							<TableCell className="flex justify-end">
								<Dropdown>
									<DropdownTrigger>
										<Button isIconOnly variant="light">
											<LucideEllipsisVertical className="size-4" />
										</Button>
									</DropdownTrigger>
									<DropdownMenu>
										<DropdownItem
											key="edit"
											onPress={() =>
												navigate({
													to: "$agentId",
													params: {
														agentId: item.id,
													},
												})
											}
										>
											Edit
										</DropdownItem>
										<DropdownItem
											key="delete"
											className="text-danger"
											color="danger"
											onPress={() => {
												setAgentToDelete({ id: item.id, name: item.name });
												onOpen();
											}}
										>
											Delete
										</DropdownItem>
									</DropdownMenu>
								</Dropdown>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			<ConfirmationModal
				isOpen={isOpen}
				onOpenChange={onOpenChange}
				title="Delete Agent"
				description={`Are you sure you want to delete "${agentToDelete?.name}"? This action cannot be undone and will delete all versions associated with this agent.`}
				onConfirm={() => {
					if (agentToDelete) {
						deleteMutation.mutate(agentToDelete.id);
					}
				}}
				isLoading={deleteMutation.isPending}
				confirmText="Delete"
				confirmColor="danger"
			/>
		</div>
	);
}
