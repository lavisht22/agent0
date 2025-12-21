import {
	addToast,
	Button,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
	Input,
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
	Search,
} from "lucide-react";
import { useEffect, useState } from "react";
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
		search?: string;
	} => ({
		page: Number(search?.page ?? 1),
		search: (search?.search as string) || undefined,
	}),
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const { page, search: searchQuery } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();

	// Delete confirmation modal state
	const { isOpen, onOpen, onOpenChange } = useDisclosure();
	const [agentToDelete, setAgentToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Fetch Agents
	const { data: agents, isLoading } = useQuery(
		agentsQuery(workspaceId, page, searchQuery),
	);

	// Local state for search input with debounce
	const [localSearch, setLocalSearch] = useState(searchQuery || "");

	// Sync local state when URL search changes (e.g., browser back/forward)
	useEffect(() => {
		setLocalSearch(searchQuery || "");
	}, [searchQuery]);

	// Debounce URL update
	useEffect(() => {
		const trimmed = localSearch.trim();
		const currentSearch = searchQuery || "";

		// Don't update if the values are the same
		if (trimmed === currentSearch) return;

		const timer = setTimeout(() => {
			navigate({
				search: {
					page: 1,
					search: trimmed || undefined,
				},
			});
		}, 300);

		return () => clearTimeout(timer);
	}, [localSearch, searchQuery, navigate]);

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
					<div className="w-full flex justify-between items-center">
						<div className="flex items-center gap-2">
							<Input
								size="sm"
								placeholder="Search agents..."
								startContent={<Search className="size-3.5 text-default-400" />}
								className="w-64"
								value={localSearch}
								onValueChange={setLocalSearch}
								isClearable
								onClear={() => setLocalSearch("")}
							/>
						</div>
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
												search: searchQuery,
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
												search: searchQuery,
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
