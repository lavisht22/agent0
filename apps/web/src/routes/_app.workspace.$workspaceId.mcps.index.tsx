import {
	addToast,
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
	useDisclosure,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { LucideEllipsisVertical, Plus } from "lucide-react";
import { useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import IDCopy from "@/components/id-copy";
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
	const { isOpen, onOpen, onOpenChange } = useDisclosure();
	const [mcpToDelete, setMcpToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Fetch MCPs
	const { data: mcps, isLoading } = useQuery(mcpsQuery(workspaceId));
	const { data: user } = useQuery(workspaceUserQuery(workspaceId));

	// Delete mutation
	const deleteMutation = useMutation({
		mutationFn: async (mcpId: string) => {
			const { error } = await supabase.from("mcps").delete().eq("id", mcpId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
			addToast({
				description: "MCP server deleted successfully.",
				color: "success",
			});
			onOpenChange();
			setMcpToDelete(null);
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error
						? error.message
						: "Failed to delete MCP server.",
				color: "danger",
			});
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

			const response = await fetch(`${baseURL}/api/v1/refresh-mcp`, {
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
			addToast({
				description: "MCP server tools refreshed successfully.",
				color: "success",
			});
		},
		onError: (error) => {
			addToast({
				title:
					error instanceof Error ? error.message : "Failed to refresh MCP.",
				color: "danger",
			});
		},
	});

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<div className="flex justify-between items-center h-16 border-b border-default-200 box-content px-4">
				<h1 className="text-xl font-medium tracking-tight">MCP Servers</h1>

				{user?.role === "admin" && (
					<Button
						color="primary"
						startContent={<Plus size={18} />}
						onPress={() =>
							navigate({
								to: "/workspace/$workspaceId/mcps/$mcpId",
								params: { workspaceId, mcpId: "new" },
							})
						}
					>
						Create
					</Button>
				)}
			</div>

			<Table
				aria-label="MCP Servers Table"
				onRowAction={(key) => {
					if (!key || user?.role !== "admin") return;

					navigate({
						to: key.toString(),
					});
				}}
				shadow="none"
				classNames={{
					wrapper: "bg-background",
					base: "overflow-y-auto flex-1",
				}}
				isHeaderSticky
			>
				<TableHeader>
					<TableColumn>Name</TableColumn>
					<TableColumn>ID</TableColumn>
					<TableColumn>Last Updated</TableColumn>
					<TableColumn className="w-20" hideHeader>
						Actions
					</TableColumn>
				</TableHeader>
				<TableBody
					items={mcps || []}
					isLoading={isLoading}
					emptyContent="You haven't added any MCP servers yet."
				>
					{(item) => {
						return (
							<TableRow key={item.id} className="hover:bg-default-100">
								<TableCell>{item.name}</TableCell>
								<TableCell>
									<IDCopy id={item.id} />
								</TableCell>
								<TableCell>
									{format(item.updated_at, "d LLL, hh:mm a")}
								</TableCell>
								<TableCell className="flex justify-end">
									<Dropdown isDisabled={user?.role !== "admin"}>
										<DropdownTrigger>
											<Button isIconOnly variant="light">
												<LucideEllipsisVertical className="size-4" />
											</Button>
										</DropdownTrigger>
										<DropdownMenu>
											<DropdownItem
												key="refresh"
												onPress={() => refreshMcpMutation.mutate(item.id)}
											>
												Refresh
											</DropdownItem>
											<DropdownItem
												key="edit"
												onPress={() => navigate({ to: item.id })}
											>
												Edit
											</DropdownItem>
											<DropdownItem
												key="delete"
												className="text-danger"
												color="danger"
												onPress={() => {
													setMcpToDelete({
														id: item.id,
														name: item.name,
													});
													onOpen();
												}}
											>
												Delete
											</DropdownItem>
										</DropdownMenu>
									</Dropdown>
								</TableCell>
							</TableRow>
						);
					}}
				</TableBody>
			</Table>

			<ConfirmationModal
				isOpen={isOpen}
				onOpenChange={onOpenChange}
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
