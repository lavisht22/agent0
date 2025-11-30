import {
	Avatar,
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
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Check, Copy, LucideEllipsisVertical, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { apiKeysQuery, workspacesQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/workspace/$workspaceId/api-keys/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [copiedId, setCopiedId] = useState<string | null>(null);

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
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to delete API key.",
				color: "danger",
			});
		},
	});

	const handleCopy = async (keyId: string, plainKey: string) => {
		try {
			await navigator.clipboard.writeText(plainKey);
			setCopiedId(keyId);
			addToast({
				description: "API key copied to clipboard",
				color: "success",
			});
			setTimeout(() => setCopiedId(null), 2000);
		} catch {
			addToast({
				description: "Failed to copy API key",
				color: "danger",
			});
		}
	};

	const redactKey = (key: string) => {
		if (!key) return "••••••••••••••••";
		// Show prefix (first 8 chars if available) and redact the rest
		const prefix = key.substring(0, 8);
		return `${prefix}••••••••••••••••`;
	};

	return (
		<div className="p-6">
			<div className="flex justify-between items-center mb-6">
				<div>
					<h1 className="text-2xl font-medium tracking-tight">API Keys</h1>
					<p className="text-default-500">
						Manage API keys for programmatic access to your workspace
					</p>
				</div>
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

			<Table shadow="none" classNames={{ wrapper: "p-0" }}>
				<TableHeader>
					<TableColumn>Name</TableColumn>
					<TableColumn>API Key</TableColumn>
					<TableColumn>Created At</TableColumn>
					<TableColumn>Created By</TableColumn>
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
							<TableRow key={item.id} className="hover:bg-default-100">
								<TableCell>{item.name}</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										<code className="text-xs font-mono">
											{redactKey(item.id)}
										</code>
										<Button
											isIconOnly
											size="sm"
											variant="light"
											onPress={() => handleCopy(item.id, item.id)}
										>
											{copiedId === item.id ? (
												<Check className="size-4 text-success" />
											) : (
												<Copy className="size-4" />
											)}
										</Button>
									</div>
								</TableCell>
								<TableCell>
									{format(item.created_at, "d LLL, hh:mm a")}
								</TableCell>
								<TableCell>
									<div className="flex gap-2 items-center">
										<Avatar
											size="sm"
											src={`https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`}
											fallback={user?.name?.slice(0, 1)}
										/>
										<p>{user?.name}</p>
									</div>
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
													if (
														window.confirm(
															`Are you sure you want to delete "${item.name}"? This action cannot be undone.`,
														)
													) {
														deleteMutation.mutate(item.id);
													}
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
		</div>
	);
}
