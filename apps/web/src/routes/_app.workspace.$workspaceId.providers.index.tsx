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
import { PROVIDER_TYPES } from "@/lib/providers";
import { providersQuery, workspaceUserQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/workspace/$workspaceId/providers/")(
	{
		component: RouteComponent,
	},
);

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Delete confirmation modal state
	const deleteState = useOverlayState();
	const [providerToDelete, setProviderToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	// Fetch Providers
	const { data: providers, isLoading } = useQuery(providersQuery(workspaceId));
	const { data: user } = useQuery(workspaceUserQuery(workspaceId));

	// Delete mutation
	const deleteMutation = useMutation({
		mutationFn: async (providerId: string) => {
			const { error } = await supabase
				.from("providers")
				.delete()
				.eq("id", providerId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["providers", workspaceId] });
			toast.success("Provider deleted successfully.");
			deleteState.close();
			setProviderToDelete(null);
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to delete provider.",
			);
		},
	});

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<div className="shrink-0 flex justify-between items-center h-16 border-b border-default-200 box-content px-4">
				<h1 className="text-xl font-medium tracking-tight">Providers</h1>

				{user?.role === "admin" && (
					<Button
						variant="primary"
						onPress={() =>
							navigate({
								to: "/workspace/$workspaceId/providers/$providerId",
								params: { workspaceId, providerId: "new" },
							})
						}
					>
						<Plus size={18} />
						Create
					</Button>
				)}
			</div>
			<div className="flex-1 p-4 overflow-hidden flex flex-col">
				<Table className="flex-1 overflow-hidden">
					<Table.ScrollContainer className="h-full overflow-auto">
						<Table.Content aria-label="Providers Table">
							<Table.Header className="sticky top-0 z-10">
								<Table.Column>Name</Table.Column>
								<Table.Column>Type</Table.Column>
								<Table.Column>ID</Table.Column>
								<Table.Column>Last Updated</Table.Column>
								<Table.Column className="w-20">Actions</Table.Column>
							</Table.Header>
							<Table.Body
								items={providers || []}
								renderEmptyState={() =>
									isLoading ? (
										<p className="text-center text-default-400 p-6">
											Loading...
										</p>
									) : (
										<p className="text-center text-default-400 p-6">
											You haven't added any providers yet.
										</p>
									)
								}
							>
								{(item) => {
									const provider = PROVIDER_TYPES.find(
										(p) => p.key === item.type,
									);

									return (
										<Table.Row
											key={item.id}
											id={item.id}
											className="hover:bg-default-100 cursor-pointer"
											onAction={
												user?.role === "admin"
													? () =>
															navigate({
																to: "/workspace/$workspaceId/providers/$providerId",
																params: { workspaceId, providerId: item.id },
															})
													: undefined
											}
										>
											<Table.Cell>{item.name}</Table.Cell>
											<Table.Cell>
												<div className="flex items-center gap-2">
													{provider?.icon && (
														<provider.icon className="size-5" />
													)}
													{provider?.label}
												</div>
											</Table.Cell>
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
														variant="tertiary"
														isDisabled={user?.role !== "admin"}
													>
														<LucideEllipsisVertical className="size-4" />
													</Button>
													<Dropdown.Popover>
														<Dropdown.Menu>
															<Dropdown.Item
																id="edit"
																textValue="Edit"
																onAction={() => navigate({ to: item.id })}
															>
																<Label>Edit</Label>
															</Dropdown.Item>
															<Dropdown.Item
																id="delete"
																textValue="Delete"
																variant="danger"
																onAction={() => {
																	setProviderToDelete({
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
				title="Delete Provider"
				description={`Are you sure you want to delete "${providerToDelete?.name}"? This action cannot be undone and may affect agents using this provider.`}
				onConfirm={() => {
					if (providerToDelete) {
						deleteMutation.mutate(providerToDelete.id);
					}
				}}
				isLoading={deleteMutation.isPending}
				confirmText="Delete"
				confirmColor="danger"
			/>
		</div>
	);
}
