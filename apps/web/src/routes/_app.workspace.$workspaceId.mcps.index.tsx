import {
	Button,
	Dropdown,
	Label,
	Table,
	toast,
	useOverlayState,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { LucideEllipsisVertical, Plus } from "lucide-react";
import { useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import IDCopy from "@/components/id-copy";
import { PageHeader } from "@/components/page-header";
import { mcpsQuery, workspaceUserQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/workspace/$workspaceId/mcps/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Delete confirmation modal state
	const deleteState = useOverlayState();
	const [mcpToDelete, setMcpToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Fetch MCPs
	const { data: mcps } = useQuery(mcpsQuery(workspaceId));
	const { data: user } = useQuery(workspaceUserQuery(workspaceId));

	// Delete mutation
	const deleteMutation = useMutation({
		mutationFn: async (mcpId: string) => {
			const { error } = await supabase.from("mcps").delete().eq("id", mcpId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
			toast.success("MCP server deleted successfully.");
			deleteState.close();
			setMcpToDelete(null);
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to delete MCP server.",
			);
		},
	});

	const refreshMcpMutation = useMutation({
		mutationFn: async (mcp_id: string) => {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				throw new Error("You must be logged in to refresh MCP.");
			}

			const baseURL = import.meta.env.DEV ? "http://localhost:2223" : "";

			const response = await fetch(`${baseURL}/internal/refresh-mcp`, {
				method: "POST",
				body: JSON.stringify({ mcp_id }),
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			if (!response.ok) {
				throw new Error("Failed to refresh MCP");
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
			toast.success("MCP server tools refreshed successfully.");
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to refresh MCP.",
			);
		},
	});

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<PageHeader breadcrumbs={[{ label: "MCP Servers" }]}>
				{user?.role === "admin" && (
					<Button
						variant="primary"
						onPress={() =>
							navigate({
								to: "/workspace/$workspaceId/mcps/$mcpId",
								params: { workspaceId, mcpId: "new" },
							})
						}
					>
						<Plus size={18} />
						Create
					</Button>
				)}
			</PageHeader>

			<div className="flex-1 p-4 flex flex-col">
				<Table className="flex-1 overflow-hidden">
					<Table.ScrollContainer className="flex-1 overflow-y-auto">
						<Table.Content aria-label="MCP Servers Table">
							<Table.Header className="sticky top-0 z-10">
								<Table.Column>Name</Table.Column>
								<Table.Column>ID</Table.Column>
								<Table.Column>Last Updated</Table.Column>
								<Table.Column className="w-20"></Table.Column>
							</Table.Header>
							<Table.Body
								items={mcps || []}
								renderEmptyState={() => (
									<p className="text-center text-muted p-6">
										You haven't added any MCP servers yet.
									</p>
								)}
							>
								{(item) => (
									<Table.Row
										key={item.id}
										id={item.id}
										className="hover:bg-surface-hover cursor-pointer"
										onAction={
											user?.role === "admin"
												? () =>
														navigate({
															to: "/workspace/$workspaceId/mcps/$mcpId",
															params: { workspaceId, mcpId: item.id },
														})
												: undefined
										}
									>
										<Table.Cell>{item.name}</Table.Cell>
										<Table.Cell>
											<IDCopy id={item.id} />
										</Table.Cell>
										<Table.Cell>
											{format(item.updated_at, "d LLL, hh:mm a")}
										</Table.Cell>
										<Table.Cell className="flex justify-end">
											<Dropdown>
												<Button
													isIconOnly
													variant="ghost"
													isDisabled={
														user?.role !== "admin" && user?.role !== "writer"
													}
												>
													<LucideEllipsisVertical className="size-4" />
												</Button>
												<Dropdown.Popover>
													<Dropdown.Menu>
														<Dropdown.Item
															id="refresh"
															textValue="Refresh"
															onAction={() =>
																refreshMcpMutation.mutate(item.id)
															}
														>
															<Label>Refresh</Label>
														</Dropdown.Item>
														<Dropdown.Item
															id="edit"
															textValue="Edit"
															isDisabled={user?.role !== "admin"}
															onAction={() => navigate({ to: item.id })}
														>
															<Label>Edit</Label>
														</Dropdown.Item>
														<Dropdown.Item
															id="delete"
															textValue="Delete"
															variant="danger"
															isDisabled={user?.role !== "admin"}
															onAction={() => {
																setMcpToDelete({
																	id: item.id,
																	name: item.name,
																});
																deleteState.open();
															}}
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
				title="Delete MCP Server"
				description={`Are you sure you want to delete "${mcpToDelete?.name}"? This action cannot be undone and may affect agents using this MCP server.`}
				onConfirm={() => {
					if (mcpToDelete) {
						deleteMutation.mutate(mcpToDelete.id);
					}
				}}
				isLoading={deleteMutation.isPending}
				confirmText="Delete"
				confirmColor="danger"
			/>
		</div>
	);
}
