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
	const { isOpen, onOpen, onOpenChange } = useDisclosure();
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
			addToast({
				description: "Provider deleted successfully.",
				color: "success",
			});
			onOpenChange();
			setProviderToDelete(null);
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to delete provider.",
				color: "danger",
			});
		},
	});

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<div className="flex justify-between items-center h-16 border-b border-default-200 box-content px-4">
				<h1 className="text-xl font-medium tracking-tight">Providers</h1>

				{user?.role === "admin" && (
					<Button
						color="primary"
						startContent={<Plus size={18} />}
						onPress={() =>
							navigate({
								to: "/workspace/$workspaceId/providers/$providerId",
								params: { workspaceId, providerId: "new" },
							})
						}
					>
						Create
					</Button>
				)}
			</div>

			<Table
				aria-label="Providers Table"
				onRowAction={(key) => {
					if (!key || user?.role !== "admin") return;

					navigate({
						to: key.toString(),
					});
				}}
				shadow="none"
				classNames={{ base: "overflow-scroll flex-1" }}
				isHeaderSticky
			>
				<TableHeader>
					<TableColumn>Name</TableColumn>
					<TableColumn>Type</TableColumn>
					<TableColumn>ID</TableColumn>
					<TableColumn>Last Updated</TableColumn>
					<TableColumn className="w-20" hideHeader>
						Actions
					</TableColumn>
				</TableHeader>
				<TableBody
					items={providers || []}
					isLoading={isLoading}
					emptyContent="You haven't added any providers yet."
				>
					{(item) => {
						const provider = PROVIDER_TYPES.find((p) => p.key === item.type);

						return (
							<TableRow key={item.id} className="hover:bg-default-100">
								<TableCell>{item.name}</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										{provider?.icon && <provider.icon className="size-5" />}
										{provider?.label}
									</div>
								</TableCell>
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
													setProviderToDelete({
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
