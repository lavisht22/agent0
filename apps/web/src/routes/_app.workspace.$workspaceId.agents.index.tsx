import {
	Button,
	CloseButton,
	Dropdown,
	InputGroup,
	Label,
	Table,
	Tooltip,
	toast,
	useOverlayState,
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
import { TagChip } from "@/components/tag-chip";
import { TagsSelect } from "@/components/tags-select";
import { agentsQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/workspace/$workspaceId/agents/")({
	component: RouteComponent,
	validateSearch: (
		search: Record<string, unknown>,
	): {
		page: number;
		search?: string;
		tags?: string[];
	} => ({
		page: Number(search?.page ?? 1),
		search: (search?.search as string) || undefined,
		tags: (search?.tags as string[]) || undefined,
	}),
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const { page, search: searchQuery, tags: selectedTags } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();

	// Delete confirmation modal state
	const deleteState = useOverlayState();
	const [agentToDelete, setAgentToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Fetch Agents with tag filter
	const { data: agents, isLoading } = useQuery(
		agentsQuery(workspaceId, page, searchQuery, selectedTags),
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
					tags: selectedTags,
				},
			});
		}, 300);

		return () => clearTimeout(timer);
	}, [localSearch, searchQuery, navigate, selectedTags]);

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
			toast.success("Agent deleted successfully.");
			deleteState.close();
			setAgentToDelete(null);
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to delete agent.",
			);
		},
	});

	return (
		<div className="h-screen flex flex-col">
			<div className="shrink-0 flex justify-between items-center h-16 border-b border-border box-content px-4">
				<h1 className="text-xl font-medium tracking-tight">Agents</h1>

				<Button
					variant="primary"
					onPress={() =>
						navigate({
							to: "/workspace/$workspaceId/agents/$agentId",
							params: { workspaceId, agentId: "new" },
						})
					}
				>
					<Plus size={18} />
					Create
				</Button>
			</div>

			<div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
				<div className="w-full flex justify-between items-center">
					<div className="flex items-center gap-2">
						<InputGroup className="w-64">
							<InputGroup.Prefix>
								<Search className="size-3.5 text-muted" />
							</InputGroup.Prefix>
							<InputGroup.Input
								placeholder="Search agents..."
								value={localSearch}
								onChange={(e) => setLocalSearch(e.target.value)}
							/>
							<InputGroup.Suffix>
								{localSearch && (
									<CloseButton
										aria-label="Clear search"
										onPress={() => setLocalSearch("")}
									/>
								)}
							</InputGroup.Suffix>
						</InputGroup>
						<div className="w-64">
							<TagsSelect
								workspaceId={workspaceId}
								selectedTags={selectedTags || []}
								onTagsChange={(tags) =>
									navigate({
										search: {
											page: 1,
											search: searchQuery,
											tags: tags.length > 0 ? tags : undefined,
										},
									})
								}
							/>
						</div>
					</div>
					<div className="flex gap-2">
						<Tooltip delay={0}>
							<Tooltip.Trigger>
								<Button
									size="sm"
									variant="tertiary"
									isDisabled={page === 1}
									onPress={() =>
										navigate({
											search: {
												page: page - 1,
												search: searchQuery,
												tags: selectedTags,
											},
										})
									}
								>
									<LucideChevronLeft className="size-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content placement="top">Previous</Tooltip.Content>
						</Tooltip>
						<Tooltip delay={0}>
							<Tooltip.Trigger>
								<Button
									size="sm"
									variant="tertiary"
									isDisabled={!agents || agents.length < 20}
									onPress={() =>
										navigate({
											search: {
												page: page + 1,
												search: searchQuery,
												tags: selectedTags,
											},
										})
									}
								>
									<LucideChevronRight className="size-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content placement="top">Next</Tooltip.Content>
						</Tooltip>
					</div>
				</div>
				<Table className="flex-1 overflow-hidden">
					<Table.ScrollContainer className="h-full overflow-auto">
						<Table.Content aria-label="Agents Table">
							<Table.Header className="sticky top-0 z-10">
								<Table.Column id="name">Name</Table.Column>
								<Table.Column id="tags">Tags</Table.Column>
								<Table.Column id="id">ID</Table.Column>
								<Table.Column id="createdAt">Created At</Table.Column>
								<Table.Column id="actions" className="w-20"></Table.Column>
							</Table.Header>
							<Table.Body
								items={agents || []}
								renderEmptyState={() => (
									<p className="text-center text-muted p-6">
										{searchQuery ||
										(selectedTags?.length && selectedTags.length > 0)
											? "No agents found matching your criteria."
											: "You haven't created any agents yet."}
									</p>
								)}
							>
								{(item) => (
									<Table.Row
										key={item.id}
										id={item.id}
										href={`/workspace/${workspaceId}/agents/${item.id}`}
									>
										<Table.Cell>{item.name}</Table.Cell>
										<Table.Cell>
											<div className="flex gap-1 flex-wrap">
												{item.agent_tags?.map((at) =>
													at.tags ? (
														<TagChip
															key={at.tags.id}
															name={at.tags.name}
															color={at.tags.color}
														/>
													) : null,
												)}
											</div>
										</Table.Cell>
										<Table.Cell>
											<IDCopy id={item.id} />
										</Table.Cell>
										<Table.Cell>
											{format(item.created_at, "d LLL, hh:mm a")}
										</Table.Cell>
										<Table.Cell className="flex justify-end">
											<Dropdown>
												<Button isIconOnly variant="ghost">
													<LucideEllipsisVertical className="size-4" />
												</Button>
												<Dropdown.Popover>
													<Dropdown.Menu
														onAction={(key) => {
															if (key === "edit") {
																navigate({
																	to: "$agentId",
																	params: {
																		agentId: item.id,
																	},
																});
															} else if (key === "delete") {
																setAgentToDelete({
																	id: item.id,
																	name: item.name,
																});
																deleteState.open();
															}
														}}
													>
														<Dropdown.Item id="edit" textValue="Edit">
															<Label>Edit</Label>
														</Dropdown.Item>
														<Dropdown.Item
															id="delete"
															textValue="Delete"
															variant="danger"
														>
															<Label>Delete</Label>
														</Dropdown.Item>
													</Dropdown.Menu>
												</Dropdown.Popover>
											</Dropdown>
										</Table.Cell>
									</Table.Row>
								)}
							</Table.Body>
						</Table.Content>
					</Table.ScrollContainer>
				</Table>
			</div>
			<ConfirmationModal
				isOpen={deleteState.isOpen}
				onOpenChange={deleteState.setOpen}
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
