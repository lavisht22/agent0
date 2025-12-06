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
	User,
	useDisclosure,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { LucideEllipsisVertical, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import IDCopy from "@/components/id-copy";

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
	const { isOpen, onOpen, onOpenChange } = useDisclosure();
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
			addToast({
				description: "API key deleted successfully.",
				color: "success",
			});
			onOpenChange();
			setKeyToDelete(null);
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to delete API key.",
				color: "danger",
			});
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
			<div className="flex justify-between items-center h-16 border-b border-default-200 box-content px-4">
				<h1 className="text-xl font-medium tracking-tight">API Keys</h1>

				<Button
					color="primary"
					startContent={<Plus size={18} />}
					onPress={() =>
						navigate({
							to: "/workspace/$workspaceId/api-keys/new",
							params: { workspaceId },
						})
					}
				>
					Create
				</Button>
			</div>

			<Table
				aria-label="API Keys Table"
				shadow="none"
				radius="none"
				classNames={{ base: "overflow-scroll flex-1" }}
				isHeaderSticky
			>
				<TableHeader>
					<TableColumn>Name</TableColumn>
					<TableColumn>API Key</TableColumn>
					<TableColumn>Created By</TableColumn>
					<TableColumn>Created At</TableColumn>
					<TableColumn className="w-20" hideHeader>
						Actions
					</TableColumn>
				</TableHeader>
				<TableBody
					items={apiKeys || []}
					isLoading={isLoading}
					emptyContent="You haven't created any API keys yet."
				>
					{(item) => {
						const user = workspace?.workspace_user.find(
							(user) => user.user_id === item.user_id,
						)?.users;

						return (
							<TableRow key={item.id}>
								<TableCell>{item.name}</TableCell>
								<TableCell>
									<IDCopy id={item.id} redacted={redactKey(item.id)} />
								</TableCell>
								<TableCell>
									<User
										name={user?.name}
										avatarProps={{
											size: "sm",
											src: `https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`,
											fallback: user?.name?.slice(0, 1),
										}}
									/>
								</TableCell>
								<TableCell>
									{format(item.created_at, "d LLL, hh:mm a")}
								</TableCell>

								<TableCell className="flex justify-end">
									<Dropdown>
										<DropdownTrigger>
											<Button isIconOnly variant="light">
												<LucideEllipsisVertical className="size-4" />
											</Button>
										</DropdownTrigger>
										<DropdownMenu>
											<DropdownItem
												key="delete"
												className="text-danger"
												color="danger"
												onPress={() => {
													setKeyToDelete({ id: item.id, name: item.name });
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
