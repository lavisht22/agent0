import {
	Avatar,
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
import { useMemo, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import IDCopy from "@/components/id-copy";
import { PageHeader } from "@/components/page-header";

import { apiKeysQuery, workspacesQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/workspace/$workspaceId/api-keys/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Delete confirmation modal state
	const deleteState = useOverlayState();
	const [keyToDelete, setKeyToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Fetch API Keys
	const { data: apiKeys, isLoading } = useQuery(apiKeysQuery(workspaceId));
	const { data: workspaces } = useQuery(workspacesQuery);

	const workspace = useMemo(() => {
		return workspaces?.find((workspace) => workspace.id === workspaceId);
	}, [workspaces, workspaceId]);

	// Delete mutation
	const deleteMutation = useMutation({
		mutationFn: async (keyId: string) => {
			const { error } = await supabase
				.from("api_keys")
				.delete()
				.eq("id", keyId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["api-keys", workspaceId] });
			toast.success("API key deleted successfully.");
			deleteState.close();
			setKeyToDelete(null);
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to delete API key.",
			);
		},
	});

	const redactKey = (key: string) => {
		if (!key) return "••••••••••••••••";
		// Show prefix (first 8 chars if available) and redact the rest
		const prefix = key.substring(0, 8);
		return `${prefix}••••••••••••••••`;
	};

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<PageHeader breadcrumbs={[{ label: "API Keys" }]}>
				<Button
					variant="primary"
					onPress={() =>
						navigate({
							to: "/workspace/$workspaceId/api-keys/new",
							params: { workspaceId },
						})
					}
				>
					<Plus size={18} />
					Create
				</Button>
			</PageHeader>

			<div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
				<Table className="flex-1 overflow-hidden">
					<Table.ScrollContainer className="flex-1 overflow-y-auto">
						<Table.Content aria-label="API Keys Table">
							<Table.Header className="sticky top-0 z-10">
								<Table.Column>Name</Table.Column>
								<Table.Column>API Key</Table.Column>
								<Table.Column>Created By</Table.Column>
								<Table.Column>Created At</Table.Column>
								<Table.Column className="w-20"></Table.Column>
							</Table.Header>
							<Table.Body
								items={apiKeys || []}
								renderEmptyState={() =>
									isLoading ? (
										<p className="text-center text-muted p-6">Loading...</p>
									) : (
										<p className="text-center text-muted p-6">
											You haven't created any API keys yet.
										</p>
									)
								}
							>
								{(item) => {
									const user = workspace?.workspace_user.find(
										(user) => user.user_id === item.user_id,
									)?.users;
									const userName = user?.name || "Unknown";

									return (
										<Table.Row key={item.id} id={item.id}>
											<Table.Cell>{item.name}</Table.Cell>
											<Table.Cell>
												<IDCopy id={item.key} redacted={redactKey(item.key)} />
											</Table.Cell>
											<Table.Cell>
												<div className="flex items-center gap-2">
													<Avatar size="sm">
														<Avatar.Image
															src={`https://api.dicebear.com/9.x/initials/svg?seed=${userName}`}
															alt={userName}
														/>
														<Avatar.Fallback>
															{userName
																?.split(" ")
																.map((s) => s[0])
																.join("")
																.slice(0, 2)
																.toUpperCase() || "?"}
														</Avatar.Fallback>
													</Avatar>
													<div className="flex flex-col min-w-0">
														<span className="text-sm font-medium truncate">
															{userName}
														</span>
													</div>
												</div>
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
														<Dropdown.Menu>
															<Dropdown.Item
																id="delete"
																textValue="Delete"
																variant="danger"
																onAction={() => {
																	setKeyToDelete({
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
									);
								}}
							</Table.Body>
						</Table.Content>
					</Table.ScrollContainer>
				</Table>
			</div>

			<ConfirmationModal
				isOpen={deleteState.isOpen}
				onOpenChange={deleteState.setOpen}
				title="Delete API Key"
				description={`Are you sure you want to delete "${keyToDelete?.name}"? This action cannot be undone.`}
				onConfirm={() => {
					if (keyToDelete) {
						deleteMutation.mutate(keyToDelete.id);
					}
				}}
				isLoading={deleteMutation.isPending}
				confirmText="Delete"
				confirmColor="danger"
			/>
		</div>
	);
}
