import {
	Avatar,
	Button,
	Input,
	Label,
	Separator,
	Spinner,
	Table,
	TextField,
	toast,
	useOverlayState,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { workspacesQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/workspace/$workspaceId/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: workspaces } = useQuery(workspacesQuery);

	const workspace = useMemo(
		() => workspaces?.find((w) => w.id === workspaceId),
		[workspaces, workspaceId],
	);

	const [name, setName] = useState("");

	useEffect(() => {
		if (workspace) setName(workspace.name);
	}, [workspace]);

	const deleteWorkspaceState = useOverlayState();
	const removeMemberState = useOverlayState();

	const [memberToRemove, setMemberToRemove] = useState<
		NonNullable<typeof workspace>["workspace_user"][number] | null
	>(null);

	// Workspace Name Mutation
	const updateWorkspaceNameMutation = useMutation({
		mutationFn: async (name: string) => {
			const { error } = await supabase
				.from("workspaces")
				.update({ name })
				.eq("id", workspaceId);
			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["workspaces"] });
			toast.success("Workspace name updated successfully.");
		},
		onError: (error) => {
			toast.danger(error.message);
		},
	});

	// Delete Workspace Mutation
	const deleteWorkspaceMutation = useMutation({
		mutationFn: async () => {
			const { error } = await supabase
				.from("workspaces")
				.delete()
				.eq("id", workspaceId);
			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["workspaces"] });

			toast.success("Workspace deleted successfully.");

			navigate({ to: "/" });
		},
		onError: (error) => {
			toast.danger(error.message);
		},
	});

	// Remove Member Mutation
	const removeMemberMutation = useMutation({
		mutationFn: async (userId: string) => {
			const { error } = await supabase
				.from("workspace_user")
				.delete()
				.eq("workspace_id", workspaceId)
				.eq("user_id", userId);
			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["workspaces"] });
			toast.success("Member removed successfully.");
			setMemberToRemove(null);
			removeMemberState.close();
		},
		onError: (error) => {
			toast.danger(error.message);
		},
	});

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<div className="flex justify-between items-center h-16 border-b border-border box-content px-4">
				<h1 className="text-xl font-medium tracking-tight">
					Workspace Settings
				</h1>
			</div>
			<div className="flex-1 overflow-scroll">
				<div className="max-w-4xl mx-auto space-y-6 p-6">
					<div className="flex gap-2 items-end">
						<TextField
							name="name"
							className="w-full"
							isInvalid={name.length === 0}
						>
							<Label>Name</Label>
							<Input value={name} onChange={(e) => setName(e.target.value)} />
						</TextField>

						{workspace && name !== workspace.name && (
							<Button
								variant="primary"
								isPending={updateWorkspaceNameMutation.isPending}
								onPress={() => updateWorkspaceNameMutation.mutate(name)}
							>
								{({ isPending }) => (
									<>
										{isPending && <Spinner color="current" size="sm" />}
										Update
									</>
								)}
							</Button>
						)}
					</div>

					<div className="space-y-2">
						<div className="flex justify-between items-end">
							<h3 className="text-sm font-medium">Team Members</h3>
							<Button
								size="sm"
								variant="tertiary"
								onPress={() => {
									toast.warning("Member invitation is not implemented yet.");
								}}
							>
								<UserPlus className="size-3.5" />
								Add
							</Button>
						</div>

						<Table>
							<Table.ScrollContainer>
								<Table.Content aria-label="Team members table">
									<Table.Header>
										<Table.Column>User</Table.Column>
										<Table.Column>Role</Table.Column>
										<Table.Column>Added At</Table.Column>
										<Table.Column>Actions</Table.Column>
									</Table.Header>
									<Table.Body
										items={workspace?.workspace_user || []}
										renderEmptyState={() => (
											<p className="text-center text-muted p-6">
												No members yet.
											</p>
										)}
									>
										{(wu) => {
											const memberName = wu.users?.name || "Unknown";
											return (
												<Table.Row key={wu.user_id} id={wu.user_id}>
													<Table.Cell>
														<div className="flex items-center gap-2">
															<Avatar size="sm">
																<Avatar.Image
																	src={`https://api.dicebear.com/9.x/initials/svg?seed=${memberName}`}
																	alt={memberName}
																/>
																<Avatar.Fallback>
																	{memberName
																		?.split(" ")
																		.map((s) => s[0])
																		.join("")
																		.slice(0, 2)
																		.toUpperCase() || "?"}
																</Avatar.Fallback>
															</Avatar>
															<div className="flex flex-col min-w-0">
																<span className="text-sm font-medium truncate">
																	{memberName}
																</span>
															</div>
														</div>
													</Table.Cell>
													<Table.Cell className="capitalize">
														{wu.role}
													</Table.Cell>
													<Table.Cell>
														{format(wu.created_at, "d LLL, hh:mm a")}
													</Table.Cell>
													<Table.Cell>
														<Button
															isIconOnly
															variant="danger-soft"
															onPress={() => {
																setMemberToRemove(wu);
																removeMemberState.open();
															}}
														>
															<Trash2 size={18} />
														</Button>
													</Table.Cell>
												</Table.Row>
											);
										}}
									</Table.Body>
								</Table.Content>
							</Table.ScrollContainer>
						</Table>
					</div>

					<Separator />

					{/* Danger Zone */}
					<div className="flex items-end justify-between">
						<div>
							<p className="text-sm font-medium">Delete Workspace</p>
							<p className="text-sm text-muted">
								Permanently delete this workspace and all of its data. This
								action cannot be undone.
							</p>
						</div>
						<Button variant="danger" onPress={deleteWorkspaceState.open}>
							Delete
						</Button>
					</div>

					{/* Modals */}
					<ConfirmationModal
						isOpen={deleteWorkspaceState.isOpen}
						onOpenChange={deleteWorkspaceState.setOpen}
						title="Delete Workspace"
						description="Are you sure you want to delete this workspace? This action cannot be undone and will permanently delete all data associated with this workspace."
						onConfirm={() => deleteWorkspaceMutation.mutate()}
						isLoading={deleteWorkspaceMutation.isPending}
						confirmText="Delete Workspace"
						confirmColor="danger"
					/>

					<ConfirmationModal
						isOpen={removeMemberState.isOpen}
						onOpenChange={removeMemberState.setOpen}
						title="Remove Member"
						description={`Are you sure you want to remove ${memberToRemove?.users?.name || "this member"} from the workspace?`}
						onConfirm={() => {
							if (memberToRemove) {
								removeMemberMutation.mutate(memberToRemove.user_id);
							}
						}}
						isLoading={removeMemberMutation.isPending}
						confirmText="Remove Member"
						confirmColor="danger"
					/>
				</div>
			</div>
		</div>
	);
}
