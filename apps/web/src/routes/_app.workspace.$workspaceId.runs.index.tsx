import {
	Button,
	Chip,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
	Spinner,
	Table,
	TableBody,
	TableCell,
	TableColumn,
	TableHeader,
	TableRow,
	Tooltip,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
	AlertCircle,
	CheckCircle2,
	FlaskConical,
	LucideChevronLeft,
	LucideChevronRight,
	LucideEllipsisVertical,
	RefreshCw,
} from "lucide-react";
import { AgentFilter } from "@/components/agent-filter";
import { DateRangePicker } from "@/components/date-range-picker";
import IDCopy from "@/components/id-copy";
import {
	StatusFilter,
	type StatusFilterValue,
} from "@/components/status-filter";
import { runsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/workspace/$workspaceId/runs/")({
	component: RouteComponent,
	validateSearch: (
		search: Record<string, unknown>,
	): {
		page: number;
		startDate?: string;
		endDate?: string;
		datePreset?: string;
		agentId?: string;
		status?: StatusFilterValue;
	} => {
		let dateValues:
			| { datePreset: string }
			| { startDate: string; endDate: string };

		if (!search.datePreset && !search.startDate && !search.endDate) {
			dateValues = {
				datePreset: "1hr",
			};
		} else if (search.datePreset) {
			dateValues = {
				datePreset: search.datePreset as string,
			};
		} else {
			dateValues = {
				startDate: search.startDate as string,
				endDate: search.endDate as string,
			};
		}

		return {
			page: Number(search?.page ?? 1),
			agentId: search.agentId as string | undefined,
			status: search.status as StatusFilterValue,
			...dateValues,
		};
	},
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const { page, agentId, status, ...dateValues } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const {
		data: runs,
		isLoading,
		isFetching,
		refetch,
	} = useQuery(runsQuery(workspaceId, page, dateValues, agentId, status));

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
						to: `$runId`,
						params: {
							runId: key.toString(),
						},
					});
				}}
				shadow="none"
				radius="none"
				topContent={
					<div className="w-full flex justify-between items-center">
						<div className="flex items-center gap-2">
							<DateRangePicker
								value={dateValues}
								onValueChange={(value) =>
									navigate({
										search: {
											...value,
											agentId,
											status,
											page: 1,
										},
									})
								}
							/>
							<AgentFilter
								workspaceId={workspaceId}
								value={agentId}
								onValueChange={(newAgentId) =>
									navigate({
										search: {
											...dateValues,
											agentId: newAgentId,
											status,
											page: 1,
										},
									})
								}
							/>
							<StatusFilter
								value={status}
								onValueChange={(newStatus) =>
									navigate({
										search: {
											...dateValues,
											agentId,
											status: newStatus,
											page: 1,
										},
									})
								}
							/>
						</div>
						<div className="flex gap-2">
							<Tooltip content="Refresh">
								<Button
									size="sm"
									isIconOnly
									variant="flat"
									onPress={() => refetch()}
									isDisabled={isFetching}
								>
									<RefreshCw
										className={`size-3.5 ${isFetching ? "animate-spin" : ""}`}
									/>
								</Button>
							</Tooltip>
							<Tooltip content="Previous">
								<Button
									size="sm"
									isIconOnly
									variant="flat"
									isDisabled={page === 1}
									onPress={() =>
										navigate({
											search: {
												...dateValues,
												agentId,
												status,
												page: page - 1,
											},
										})
									}
								>
									<LucideChevronLeft className="size-3.5" />
								</Button>
							</Tooltip>
							<Tooltip content="Next">
								<Button
									size="sm"
									isIconOnly
									variant="flat"
									isDisabled={!runs || runs.length < 20}
									onPress={() =>
										navigate({
											search: {
												...dateValues,
												agentId,
												status,
												page: page + 1,
											},
										})
									}
								>
									<LucideChevronRight className="size-3.5" />
								</Button>
							</Tooltip>
						</div>
					</div>
				}
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
					loadingContent={<Spinner />}
					emptyContent="No runs found."
				>
					{(item) => {
						return (
							<TableRow key={item.id} className="hover:bg-default-100">
								<TableCell>
									{format(item.created_at, "d LLL, hh:mm a")}
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
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
										{item.is_test && (
											<Chip
												startContent={<FlaskConical className="size-3" />}
												color="warning"
												variant="flat"
												size="sm"
											>
												Test
											</Chip>
										)}
									</div>
								</TableCell>

								<TableCell>{item.versions?.agents?.name || "-"}</TableCell>
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
												onPress={() =>
													navigate({ to: "$runId", params: { runId: item.id } })
												}
											>
												View
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
