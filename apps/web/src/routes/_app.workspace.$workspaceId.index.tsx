import {
	Button,
	Card,
	Chip,
	ListBox,
	Separator,
	Skeleton,
	Spinner,
	Tooltip,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
	Activity,
	AlertCircle,
	Bot,
	CheckCircle2,
	Clock,
	DollarSign,
	FlaskConical,
	PlayCircle,
	RefreshCw,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import {
	DateRangePicker,
	type DateRangeValue,
} from "@/components/date-range-picker";
import { PageHeader } from "@/components/page-header";
import {
	dashboardStatsQuery,
	recentRunsQuery,
	topAgentsQuery,
} from "@/lib/queries";

export const Route = createFileRoute("/_app/workspace/$workspaceId/")({
	component: RouteComponent,
});

function formatTokens(tokens: number): string {
	if (tokens >= 1000000) {
		const m = tokens / 1000000;
		return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
	}
	if (tokens >= 1000) {
		const k = tokens / 1000;
		return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
	}
	return tokens.toString();
}

function formatCost(cost: number): string {
	if (cost >= 1) {
		return `$${cost.toFixed(2)}`;
	}
	if (cost >= 0.01) {
		return `$${cost.toFixed(3)}`;
	}
	return `$${cost.toFixed(5)}`;
}

function formatTime(ms: number): string {
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(2)}s`;
	}
	return `${Math.round(ms)}ms`;
}

function StatCard({
	title,
	value,
	subtitle,
	icon: Icon,
	isLoading,
}: {
	title: string;
	value: string | number;
	subtitle?: string;
	icon: React.ComponentType<{ className?: string }>;
	isLoading?: boolean;
}) {
	return (
		<Card>
			<Card.Content className="gap-2">
				<div className="flex justify-between items-start">
					<div className="flex-1">
						<p className="text-sm text-muted">{title}</p>
						{isLoading ? (
							<Skeleton className="h-8 w-20 mt-1 rounded-lg" />
						) : (
							<p className="text-2xl font-semibold mt-1">{value}</p>
						)}
						{subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
					</div>
					<div className="p-2 rounded-lg text-muted">
						<Icon className="size-5" />
					</div>
				</div>
			</Card.Content>
		</Card>
	);
}

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();

	const [dateFilter, setDateFilter] = useState<DateRangeValue>({
		datePreset: "24hr",
	});

	const {
		data: stats,
		isLoading: statsLoading,
		isFetching: statsFetching,
		refetch: refetchStats,
	} = useQuery(dashboardStatsQuery(workspaceId, dateFilter));

	const {
		data: recentRuns,
		isLoading: runsLoading,
		refetch: refetchRuns,
	} = useQuery(recentRunsQuery(workspaceId));

	const {
		data: topAgents,
		isLoading: agentsLoading,
		refetch: refetchAgents,
	} = useQuery(topAgentsQuery(workspaceId, dateFilter));

	const handleRefresh = () => {
		refetchStats();
		refetchRuns();
		refetchAgents();
	};

	return (
		<div className="h-screen overflow-y-auto">
			<PageHeader
				breadcrumbs={[{ label: "Dashboard" }]}
				className="sticky top-0 bg-background z-10"
			>
				<DateRangePicker value={dateFilter} onValueChange={setDateFilter} />
				<Tooltip delay={0}>
					<Tooltip.Trigger>
						<Button
							size="sm"
							isIconOnly
							variant="tertiary"
							onPress={handleRefresh}
							isDisabled={statsFetching}
						>
							<RefreshCw
								className={`size-3.5 ${statsFetching ? "animate-spin" : ""}`}
							/>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>Refresh</Tooltip.Content>
				</Tooltip>
			</PageHeader>

			<div className="p-4 space-y-6">
				{/* Stats Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<StatCard
						title="Total Runs"
						value={stats?.totalRuns ?? 0}
						subtitle={`${stats?.successfulRuns ?? 0} successful, ${stats?.failedRuns ?? 0} failed`}
						icon={Activity}
						isLoading={statsLoading}
					/>
					<StatCard
						title="Success Rate"
						value={`${(stats?.successRate ?? 0).toFixed(1)}%`}
						subtitle={
							stats?.totalRuns
								? `${stats.successfulRuns} of ${stats.totalRuns} runs`
								: "No runs yet"
						}
						icon={TrendingUp}
						isLoading={statsLoading}
					/>
					<StatCard
						title="Total Cost"
						value={formatCost(stats?.totalCost ?? 0)}
						subtitle={`${formatTokens(stats?.totalTokens ?? 0)} tokens used`}
						icon={DollarSign}
						isLoading={statsLoading}
					/>
					<StatCard
						title="Avg Response Time"
						value={formatTime(stats?.avgResponseTime ?? 0)}
						subtitle="End-to-end latency"
						icon={Clock}
						isLoading={statsLoading}
					/>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
					{/* Top Agents */}
					<Card className="lg:col-span-2">
						<Card.Header className="flex flex-row w-full items-center justify-between">
							<div className="flex items-center gap-2">
								<Bot className="size-5 text-muted" />
								<span className="font-medium">Top Agents</span>
							</div>
							<Button
								size="sm"
								variant="tertiary"
								onPress={() =>
									navigate({
										to: "/workspace/$workspaceId/agents",
										params: { workspaceId },
										search: { page: 1 },
									})
								}
							>
								View All
							</Button>
						</Card.Header>
						<Separator />
						<Card.Content className="p-0">
							{agentsLoading ? (
								<div className="flex items-center justify-center py-8">
									<Spinner size="sm" />
								</div>
							) : !topAgents || topAgents.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-8 text-muted">
									<Bot className="size-8 mb-2" />
									<p className="text-sm">No agent activity</p>
									<p className="text-xs">Create and run an agent to start</p>
								</div>
							) : (
								<ListBox aria-label="Top agents">
									{topAgents.map((agent) => (
										<ListBox.Item
											key={agent.id}
											id={agent.id}
											textValue={agent.name}
											className="px-4 py-3"
											onAction={() =>
												navigate({
													to: `/workspace/${workspaceId}/agents/${agent.id}`,
												})
											}
										>
											<div className="flex items-center justify-between w-full gap-3">
												<div className="flex flex-col min-w-0">
													<span className="text-sm font-medium truncate">
														{agent.name}
													</span>
													<span className="text-xs text-muted truncate">
														{`${agent.runs} runs • ${
															agent.runs > 0
																? (
																		((agent.runs - agent.errors) / agent.runs) *
																		100
																	).toFixed(0)
																: 0
														}% success`}
													</span>
												</div>
												<div className="text-right shrink-0">
													<p className="text-sm">{formatCost(agent.cost)}</p>
													{agent.errors > 0 && (
														<p className="text-xs text-danger">
															{agent.errors} errors
														</p>
													)}
												</div>
											</div>
										</ListBox.Item>
									))}
								</ListBox>
							)}
						</Card.Content>
					</Card>

					{/* Recent Runs */}
					<Card className="lg:col-span-2">
						<Card.Header className="flex flex-row w-full items-center justify-between">
							<div className="flex items-center gap-2">
								<PlayCircle className="size-5 text-muted" />
								<span className="font-medium">Recent Runs</span>
							</div>
							<Button
								size="sm"
								variant="tertiary"
								onPress={() =>
									navigate({
										to: "/workspace/$workspaceId/runs",
										params: { workspaceId },
										search: { page: 1 },
									})
								}
							>
								View All
							</Button>
						</Card.Header>
						<Separator />
						<Card.Content className="p-0">
							{runsLoading ? (
								<div className="flex items-center justify-center py-8">
									<Spinner size="sm" />
								</div>
							) : !recentRuns || recentRuns.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-8 text-muted">
									<PlayCircle className="size-8 mb-2" />
									<p className="text-sm">No runs yet</p>
									<p className="text-xs">Run an agent to see activity here</p>
								</div>
							) : (
								<ListBox aria-label="Recent runs">
									{recentRuns.map((run) => (
										<ListBox.Item
											key={run.id}
											id={run.id}
											textValue={
												run.agent_versions?.agents?.name || "Unknown Agent"
											}
											className="px-4 py-3"
											onAction={() =>
												navigate({
													to: `/workspace/${workspaceId}/runs/${run.id}`,
												})
											}
										>
											<div className="flex items-center justify-between w-full gap-3">
												<div className="flex items-center gap-2 min-w-0">
													{run.is_error ? (
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
													{run.is_test && (
														<Chip variant="soft" color="warning" size="sm">
															<FlaskConical className="size-3" />
															Test
														</Chip>
													)}
													<div className="flex flex-col min-w-0">
														<span className="text-sm font-medium truncate">
															{run.agent_versions?.agents?.name ||
																"Unknown Agent"}
														</span>
														<span className="text-xs text-muted truncate">
															{format(run.created_at, "MMM d, h:mm a")}
														</span>
													</div>
												</div>
												<div className="text-right shrink-0">
													<p className="text-sm">
														{run.cost ? formatCost(run.cost) : "-"}
													</p>
													<p className="text-xs text-muted">
														{formatTime(
															(run.pre_processing_time || 0) +
																(run.first_token_time || 0) +
																(run.response_time || 0),
														)}
													</p>
												</div>
											</div>
										</ListBox.Item>
									))}
								</ListBox>
							)}
						</Card.Content>
					</Card>
				</div>
			</div>
		</div>
	);
}
