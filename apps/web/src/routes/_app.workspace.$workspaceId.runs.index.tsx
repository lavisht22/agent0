import { Button, Chip, Dropdown, Label, Table, Tooltip } from "@heroui/react";
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
import { PageHeader } from "@/components/page-header";
import {
	StatusFilter,
	type StatusFilterValue,
} from "@/components/status-filter";
import { runsQuery } from "@/lib/queries";

function formatTokens(tokens: number): string {
	if (tokens >= 1000) {
		const k = tokens / 1000;
		// Remove trailing zeros after decimal point
		return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
	}
	return tokens.toString();
}

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
		isFetching,
		refetch,
	} = useQuery(runsQuery(workspaceId, page, dateValues, agentId, status));

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<PageHeader breadcrumbs={[{ label: "Runs" }]} />

			<div className="flex-1 overflow-y-auto flex flex-col p-4 gap-4">
				<div className="shrink-0 w-full flex justify-between items-center">
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
						<Tooltip delay={0}>
							<Tooltip.Trigger>
								<Button
									size="sm"
									isIconOnly
									variant="tertiary"
									onPress={() => refetch()}
									isDisabled={isFetching}
								>
									<RefreshCw
										className={`size-3.5 ${isFetching ? "animate-spin" : ""}`}
									/>
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>Refresh</Tooltip.Content>
						</Tooltip>
						<Tooltip delay={0}>
							<Tooltip.Trigger>
								<Button
									size="sm"
									isIconOnly
									variant="tertiary"
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
							</Tooltip.Trigger>
							<Tooltip.Content>Previous</Tooltip.Content>
						</Tooltip>
						<Tooltip delay={0}>
							<Tooltip.Trigger>
								<Button
									size="sm"
									isIconOnly
									variant="tertiary"
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
							</Tooltip.Trigger>
							<Tooltip.Content>Next</Tooltip.Content>
						</Tooltip>
					</div>
				</div>

				<Table className="flex-1 overflow-hidden">
					<Table.ScrollContainer className="flex-1 overflow-y-auto">
						<Table.Content aria-label="Runs Table">
							<Table.Header className="sticky top-0 z-10">
								<Table.Column>Created At</Table.Column>
								<Table.Column>Status</Table.Column>
								<Table.Column>Time</Table.Column>
								<Table.Column>Cost</Table.Column>
								<Table.Column>Agent</Table.Column>
								<Table.Column>ID</Table.Column>
								<Table.Column className="w-20"></Table.Column>
							</Table.Header>
							<Table.Body
								items={runs || []}
								renderEmptyState={() => (
									<p className="text-center text-muted p-6">No runs found.</p>
								)}
							>
								{(item) => (
									<Table.Row
										key={item.id}
										id={item.id}
										className="hover:bg-surface-hover cursor-pointer"
										onAction={() =>
											navigate({
												to: "$runId",
												params: { runId: item.id },
											})
										}
									>
										<Table.Cell>
											{format(item.created_at, "d LLL, hh:mm a")}
										</Table.Cell>
										<Table.Cell>
											<div className="flex items-center gap-2">
												{item.is_error ? (
													<Chip variant="soft" color="danger" size="sm">
														<AlertCircle className="size-3" />
														Error
													</Chip>
												) : (
													<Chip variant="soft" color="success" size="sm">
														<CheckCircle2 className="size-3" />
														Success
													</Chip>
												)}
												{item.is_test && (
													<Chip variant="soft" color="warning" size="sm">
														<FlaskConical className="size-3" />
														Test
													</Chip>
												)}
											</div>
										</Table.Cell>

										<Table.Cell>
											{(item.pre_processing_time +
												item.first_token_time +
												item.response_time) /
												1000}
											<span className="font-semibold text-xs text-muted ml-0.5">
												s
											</span>
										</Table.Cell>
										<Table.Cell>
											{item.cost
												? `$${item.cost.toFixed(5)} (${formatTokens(item.tokens ?? 0)} tokens)`
												: "-"}
										</Table.Cell>

										<Table.Cell>
											{item.agent_versions?.agents?.name || "-"}
										</Table.Cell>
										<Table.Cell>
											<IDCopy id={item.id} />
										</Table.Cell>

										<Table.Cell className="flex justify-end">
											<Dropdown>
												<Button isIconOnly variant="ghost">
													<LucideEllipsisVertical className="size-4" />
												</Button>
												<Dropdown.Popover>
													<Dropdown.Menu>
														<Dropdown.Item
															id="view"
															textValue="View"
															onAction={() =>
																navigate({
																	to: "$runId",
																	params: { runId: item.id },
																})
															}
														>
															<Label>View</Label>
														</Dropdown.Item>
													</Dropdown.Menu>
												</Dropdown.Popover>
											</Dropdown>
										</Table.Cell>
									</Table.Row>
								)}
							</Table.Body>
						</Table.Content>
					</Table.ScrollContainer>
				</Table>
			</div>
		</div>
	);
}
