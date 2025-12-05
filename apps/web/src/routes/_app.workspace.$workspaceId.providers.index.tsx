import {
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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { LucideEllipsisVertical, Plus } from "lucide-react";
import { PROVIDER_TYPES } from "@/lib/providers";
import { providersQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/workspace/$workspaceId/providers/")(
	{
		component: RouteComponent,
	},
);

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();

	// Fetch Providers
	const { data: providers, isLoading } = useQuery(providersQuery(workspaceId));

	return (
		<div className="p-6 space-y-6">
			<div className="flex justify-between items-center">
				<div>
					<h1 className="text-2xl font-medium tracking-tight">Providers</h1>
					<p className="text-default-500">
						Manage your AI provider configurations
					</p>
				</div>
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
			</div>

			<Table
				aria-label="Providers Table"
				onRowAction={(key) => {
					if (!key) return;

					navigate({
						to: key.toString(),
					});
				}}
				shadow="none"
				classNames={{ wrapper: "p-0" }}
			>
				<TableHeader>
					<TableColumn>Name</TableColumn>
					<TableColumn>Type</TableColumn>
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
								<TableCell>{provider?.label}</TableCell>
								<TableCell>
									{format(item.updated_at, "d LLL, hh:mm a")}
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
												key={item.id}
												onPress={() => navigate({ to: item.id })}
											>
												Edit
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
