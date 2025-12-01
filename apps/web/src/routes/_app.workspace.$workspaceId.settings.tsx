import {
	addToast,
	Button,
	Divider,
	Input,
	Table,
	TableBody,
	TableCell,
	TableColumn,
	TableHeader,
	TableRow,
	User,
	useDisclosure,
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

	// Check if current user is admin
	const { data: isAdmin, isLoading: isAdminLoading } = useQuery({
		queryKey: ["workspace-role", workspaceId],
		queryFn: async () => {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return false;

			const { data, error } = await supabase
				.from("workspace_user")
				.select("role")
				.eq("workspace_id", workspaceId)
				.eq("user_id", user.id)
				.single();

			if (error) return false;

			return data?.role === "admin";
		},
		enabled: !!workspaceId,
	});

	const {
		isOpen: isDeleteWorkspaceOpen,
		onOpen: onDeleteWorkspaceOpen,
		onOpenChange: onDeleteWorkspaceOpenChange,
	} = useDisclosure();

	const {
		isOpen: isRemoveMemberOpen,
		onOpen: onRemoveMemberOpen,
		onOpenChange: onRemoveMemberOpenChange,
	} = useDisclosure();

	const [memberToRemove, setMemberToRemove] = useState<any>(null);

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
			addToast({
				description: "Workspace name updated successfully.",
				color: "success",
			});
		},
		onError: (error) => {
			addToast({
				description: error.message,
				color: "danger",
			});
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

			addToast({
				description: "Workspace deleted successfully.",
				color: "success",
			});

			navigate({ to: "/" });
		},
		onError: (error) => {
			addToast({
				description: error.message,
				color: "danger",
			});
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
			addToast({
				description: "Member removed successfully.",
				color: "success",
			});
			setMemberToRemove(null);
			onRemoveMemberOpenChange();
		},
		onError: (error) => {
			addToast({
				description: error.message,
				color: "danger",
			});
		},
	});

	if (!isAdmin)
		return (
			<div className="p-6 text-default-500">
				<p>You do not have permission to view this page.</p>
			</div>
		);

	return (
		<div className="p-6 max-w-4xl mx-auto space-y-6">
			<div>
				<h1 className="text-2xl font-medium tracking-tight">
					Workspace Settings
				</h1>
				<p className="text-default-500">
					Manage your workspace settings and members.
				</p>
			</div>
			<div className="flex gap-2 items-end">
				<Input
					fullWidth
					variant="bordered"
					labelPlacement="outside"
					label="Name"
					value={name}
					onValueChange={setName}
					isInvalid={name.length === 0}
				/>

				{workspace && name !== workspace.name && (
					<Button
						color="primary"
						isLoading={updateWorkspaceNameMutation.isPending}
						onPress={() => updateWorkspaceNameMutation.mutate(name)}
					>
						Update
					</Button>
				)}
			</div>

			<div className="space-y-2">
				<div className="flex justify-between items-end">
					<h3 className="text-sm font-medium">Team Members</h3>
					<Button
						size="sm"
						startContent={<UserPlus className="size-3.5" />}
						variant="flat"
						onPress={() => {
							addToast({
								description: "Member invitation is not implemented yet.",
								color: "warning",
							});
						}}
					>
						Add
					</Button>
				</div>

				<Table
					aria-label="Team members table"
					classNames={{ wrapper: "p-0" }}
					shadow="none"
				>
					<TableHeader>
						<TableColumn>User</TableColumn>
						<TableColumn>Role</TableColumn>
						<TableColumn>Added At</TableColumn>
						<TableColumn>Actions</TableColumn>
					</TableHeader>
					<TableBody>
						{(workspace?.workspace_user || []).map((wu) => (
							<TableRow key={wu.user_id}>
								<TableCell>
									<User
										name={wu.users?.name || "Unknown"}
										avatarProps={{
											size: "sm",
											src: `https://api.dicebear.com/9.x/initials/svg?seed=${wu.users?.name}`,
											fallback: wu.users?.name?.slice(0, 1),
										}}
									/>
								</TableCell>
								<TableCell className="capitalize">{wu.role}</TableCell>
								<TableCell>{format(wu.created_at, "d LLL, hh:mm a")}</TableCell>
								<TableCell>
									<Button
										isIconOnly
										color="danger"
										variant="light"
										onPress={() => {
											setMemberToRemove(wu);
											onRemoveMemberOpen();
										}}
									>
										<Trash2 size={18} />
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<Divider />

			{/* Danger Zone */}
			<div className="flex items-end justify-between">
				<div>
					<p className="text-sm font-medium">Delete Workspace</p>
					<p className="text-sm text-default-500">
						Permanently delete this workspace and all of its data. This action
						cannot be undone.
					</p>
				</div>
				<Button color="danger" onPress={onDeleteWorkspaceOpen}>
					Delete
				</Button>
			</div>

			{/* Modals */}
			<ConfirmationModal
				isOpen={isDeleteWorkspaceOpen}
				onOpenChange={onDeleteWorkspaceOpenChange}
				title="Delete Workspace"
				description="Are you sure you want to delete this workspace? This action cannot be undone and will permanently delete all data associated with this workspace."
				onConfirm={() => deleteWorkspaceMutation.mutate()}
				isLoading={deleteWorkspaceMutation.isPending}
				confirmText="Delete Workspace"
				confirmColor="danger"
			/>

			<ConfirmationModal
				isOpen={isRemoveMemberOpen}
				onOpenChange={onRemoveMemberOpenChange}
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
	);
}
