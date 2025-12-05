import {
	Button,
	Chip,
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
import {
	AlertCircle,
	CheckCircle2,
	LucideEllipsisVertical,
} from "lucide-react";
import IDCopy from "@/components/id-copy";
import { runsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/workspace/$workspaceId/runs/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const { data: runs, isLoading } = useQuery(runsQuery(workspaceId));

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<div className="flex justify-between items-center h-16 border-b border-default-200 box-content px-4">
				<h1 className="text-xl font-medium tracking-tight">Runs</h1>
			</div>

			<Table
				aria-label="Runs Table"
				onRowAction={(key) => {
					if (!key) return;

					navigate({
						to: key.toString(),
					})
				}}
				shadow="none"
				radius="none"
				// topContent={<div className="h-10 w-full bg-red-200">Filters</div>}
				// bottomContent={
				// 	<div className="h-10 w-full bg-red-200">LoadMore/Pagination</div>
				// }
				classNames={{
					base: "overflow-scroll flex-1",
				}}
				isHeaderSticky
			>
				<TableHeader>
					<TableColumn>Created At</TableColumn>
					<TableColumn>Status</TableColumn>
					<TableColumn>Agent</TableColumn>
					<TableColumn>ID</TableColumn>
					<TableColumn className="w-20" hideHeader>
						Actions
					</TableColumn>
				</TableHeader>
				<TableBody
					items={runs || []}
					isLoading={isLoading}
					emptyContent="No runs found."
				>
					{(item) => {
						return (
							<TableRow key={item.id} className="hover:bg-default-100">
								<TableCell>
									{format(item.created_at, "d LLL, hh:mm a")}
								</TableCell>
								<TableCell>
									{item.is_error ? (
										<Chip
											startContent={<AlertCircle className="size-3" />}
											color="danger"
											variant="flat"
											size="sm"
										>
											Error
										</Chip>
									) : (
										<Chip
											startContent={<CheckCircle2 className="size-3" />}
											color="success"
											variant="flat"
											size="sm"
										>
											Success
										</Chip>
									)}
								</TableCell>

								<TableCell>
									{item.versions?.agents?.name || "Unknown"}
								</TableCell>
								<TableCell>
									<IDCopy id={item.id} />
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
												View
											</DropdownItem>
										</DropdownMenu>
									</Dropdown>
								</TableCell>
							</TableRow>
						)
					}}
				</TableBody>
			</Table>
		</div>
	)
}
