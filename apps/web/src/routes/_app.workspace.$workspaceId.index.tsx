import {
	Button,
	Card,
	CardBody,
	CardHeader,
	Chip,
	Divider,
	Skeleton,
	Spinner,
	Tooltip,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
	Activity,
	AlertCircle,
	Bot,
	CheckCircle2,
	Clock,
	Coins,
	DollarSign,
	FlaskConical,
	KeySquare,
	PlayCircle,
	Plus,
	Plug,
	RefreshCw,
	Server,
	TrendingUp,
	Zap,
} from "lucide-react";
import { useState } from "react";
import {
	DateRangePicker,
	type DateRangeValue,
} from "@/components/date-range-picker";
import {
	dashboardStatsQuery,
	recentRunsQuery,
	topAgentsQuery,
	workspaceSetupQuery,
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
	color,
	isLoading,
}: {
	title: string;
	value: string | number;
	subtitle?: string;
	icon: React.ComponentType<{ className?: string }>;
	color: "primary" | "success" | "warning" | "danger" | "secondary";
	isLoading?: boolean;
}) {
	const colorClasses = {
		primary: "bg-primary-100 text-primary-600",
		success: "bg-success-100 text-success-600",
		warning: "bg-warning-100 text-warning-600",
		danger: "bg-danger-100 text-danger-600",
		secondary: "bg-secondary-100 text-secondary-600",
	};

	return (
		<Card shadow="none" className="border border-default-200">
			<CardBody className="gap-2">
				<div className="flex justify-between items-start">
					<div className="flex-1">
						<p className="text-sm text-default-500">{title}</p>
						{isLoading ? (
							<Skeleton className="h-8 w-20 mt-1 rounded-lg" />
						) : (
							<p className="text-2xl font-semibold mt-1">{value}</p>
						)}
						{subtitle && (
							<p className="text-xs text-default-400 mt-1">{subtitle}</p>
						)}
					</div>
					<div className={`p-2 rounded-lg ${colorClasses[color]}`}>
						<Icon className="size-5" />
					</div>
				</div>
			</CardBody>
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

	const { data: setup, isLoading: setupLoading } = useQuery(
		workspaceSetupQuery(workspaceId),
	);

	const handleRefresh = () => {
		refetchStats();
		refetchRuns();
		refetchAgents();
	};

	return (
		<div className="h-screen overflow-y-auto">
			{/* Header */}
			<div className="flex justify-between items-center h-16 border-b border-default-200 box-content px-4 sticky top-0 bg-background z-10">
				<h1 className="text-xl font-medium tracking-tight">Dashboard</h1>
				<div className="flex items-center gap-2">
					<DateRangePicker value={dateFilter} onValueChange={setDateFilter} />
					<Tooltip content="Refresh">
						<Button
							size="sm"
							isIconOnly
							variant="flat"
							onPress={handleRefresh}
							isDisabled={statsFetching}
						>
							<RefreshCw
								className={`size-3.5 ${statsFetching ? "animate-spin" : ""}`}
							/>
						</Button>
					</Tooltip>
				</div>
			</div>

			<div className="p-4 space-y-6">
				{/* Stats Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<StatCard
						title="Total Runs"
						value={stats?.totalRuns ?? 0}
						subtitle={`${stats?.successfulRuns ?? 0} successful, ${stats?.failedRuns ?? 0} failed`}
						icon={Activity}
						color="primary"
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
						color={
							(stats?.successRate ?? 0) >= 90
								? "success"
								: (stats?.successRate ?? 0) >= 70
									? "warning"
									: "danger"
						}
						isLoading={statsLoading}
					/>
					<StatCard
						title="Total Cost"
						value={formatCost(stats?.totalCost ?? 0)}
						subtitle={`${formatTokens(stats?.totalTokens ?? 0)} tokens used`}
						icon={DollarSign}
						color="warning"
						isLoading={statsLoading}
					/>
					<StatCard
						title="Avg Response Time"
						value={formatTime(stats?.avgResponseTime ?? 0)}
						subtitle="End-to-end latency"
						icon={Clock}
						color="secondary"
						isLoading={statsLoading}
					/>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					{/* Recent Runs */}
					<Card
						shadow="none"
						className="border border-default-200 lg:col-span-2"
					>
						<CardHeader className="flex justify-between items-center">
							<div className="flex items-center gap-2">
								<PlayCircle className="size-5 text-default-500" />
								<span className="font-medium">Recent Runs</span>
							</div>
							<Button
								size="sm"
								variant="light"
								as={Link}
								to={`/workspace/${workspaceId}/runs`}
							>
								View All
							</Button>
						</CardHeader>
						<Divider />
						<CardBody className="p-0">
							{runsLoading ? (
								<div className="flex items-center justify-center py-8">
									<Spinner size="sm" />
								</div>
							) : recentRuns && recentRuns.length > 0 ? (
								<div className="divide-y divide-default-100">
									{recentRuns.map((run) => (
										<div
											key={run.id}
											className="flex items-center justify-between px-4 py-3 hover:bg-default-50 cursor-pointer"
											onClick={() =>
												navigate({
													to: `/workspace/${workspaceId}/runs/${run.id}`,
												})
											}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													navigate({
														to: `/workspace/${workspaceId}/runs/${run.id}`,
													});
												}
											}}
										>
											<div className="flex items-center gap-3">
												<div className="flex items-center gap-2">
													{run.is_error ? (
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
													{run.is_test && (
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
												<div>
													<p className="text-sm font-medium">
														{run.versions?.agents?.name || "Unknown Agent"}
													</p>
													<p className="text-xs text-default-400">
														{format(run.created_at, "MMM d, h:mm a")}
													</p>
												</div>
											</div>
											<div className="text-right">
												<p className="text-sm">
													{run.cost ? formatCost(run.cost) : "-"}
												</p>
												<p className="text-xs text-default-400">
													{formatTime(
														(run.pre_processing_time || 0) +
															(run.first_token_time || 0) +
															(run.response_time || 0),
													)}
												</p>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="flex flex-col items-center justify-center py-8 text-default-400">
									<PlayCircle className="size-8 mb-2" />
									<p className="text-sm">No runs yet</p>
									<p className="text-xs">
										Run an agent to see activity here
									</p>
								</div>
							)}
						</CardBody>
					</Card>

					{/* Top Agents */}
					<Card shadow="none" className="border border-default-200">
						<CardHeader className="flex justify-between items-center">
							<div className="flex items-center gap-2">
								<Bot className="size-5 text-default-500" />
								<span className="font-medium">Top Agents</span>
							</div>
							<Button
								size="sm"
								variant="light"
								as={Link}
								to={`/workspace/${workspaceId}/agents`}
							>
								View All
							</Button>
						</CardHeader>
						<Divider />
						<CardBody className="p-0">
							{agentsLoading ? (
								<div className="flex items-center justify-center py-8">
									<Spinner size="sm" />
								</div>
							) : topAgents && topAgents.length > 0 ? (
								<div className="divide-y divide-default-100">
									{topAgents.map((agent) => (
										<div
											key={agent.id}
											className="flex items-center justify-between px-4 py-3 hover:bg-default-50 cursor-pointer"
											onClick={() =>
												navigate({
													to: `/workspace/${workspaceId}/agents/${agent.id}`,
												})
											}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													navigate({
														to: `/workspace/${workspaceId}/agents/${agent.id}`,
													});
												}
											}}
										>
											<div>
												<p className="text-sm font-medium">{agent.name}</p>
												<p className="text-xs text-default-400">
													{agent.runs} runs •{" "}
													{agent.runs > 0
														? (
																((agent.runs - agent.errors) / agent.runs) *
																100
															).toFixed(0)
														: 0}
													% success
												</p>
											</div>
											<div className="text-right">
												<p className="text-sm">{formatCost(agent.cost)}</p>
												{agent.errors > 0 && (
													<p className="text-xs text-danger-500">
														{agent.errors} errors
													</p>
												)}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="flex flex-col items-center justify-center py-8 text-default-400">
									<Bot className="size-8 mb-2" />
									<p className="text-sm">No agent activity</p>
									<p className="text-xs">Create and run an agent to start</p>
								</div>
							)}
						</CardBody>
					</Card>
				</div>

				{/* Workspace Setup & Quick Actions */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					{/* Workspace Setup */}
					<Card shadow="none" className="border border-default-200">
						<CardHeader>
							<div className="flex items-center gap-2">
								<Zap className="size-5 text-default-500" />
								<span className="font-medium">Workspace Overview</span>
							</div>
						</CardHeader>
						<Divider />
						<CardBody>
							{setupLoading ? (
								<div className="space-y-3">
									{[1, 2, 3, 4].map((i) => (
										<Skeleton key={i} className="h-10 rounded-lg" />
									))}
								</div>
							) : (
								<div className="grid grid-cols-2 gap-4">
									<div
										className="flex items-center gap-3 p-3 rounded-lg border border-default-200 hover:bg-default-50 cursor-pointer"
										onClick={() =>
											navigate({
												to: `/workspace/${workspaceId}/agents`,
											})
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												navigate({
													to: `/workspace/${workspaceId}/agents`,
												});
											}
										}}
									>
										<div className="p-2 rounded-lg bg-primary-100">
											<Bot className="size-5 text-primary-600" />
										</div>
										<div>
											<p className="text-lg font-semibold">
												{setup?.agentsCount ?? 0}
											</p>
											<p className="text-xs text-default-500">Agents</p>
										</div>
									</div>
									<div
										className="flex items-center gap-3 p-3 rounded-lg border border-default-200 hover:bg-default-50 cursor-pointer"
										onClick={() =>
											navigate({
												to: `/workspace/${workspaceId}/providers`,
											})
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												navigate({
													to: `/workspace/${workspaceId}/providers`,
												});
											}
										}}
									>
										<div className="p-2 rounded-lg bg-success-100">
											<Server className="size-5 text-success-600" />
										</div>
										<div>
											<p className="text-lg font-semibold">
												{setup?.providersCount ?? 0}
											</p>
											<p className="text-xs text-default-500">Providers</p>
										</div>
									</div>
									<div
										className="flex items-center gap-3 p-3 rounded-lg border border-default-200 hover:bg-default-50 cursor-pointer"
										onClick={() =>
											navigate({
												to: `/workspace/${workspaceId}/mcps`,
											})
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												navigate({
													to: `/workspace/${workspaceId}/mcps`,
												});
											}
										}}
									>
										<div className="p-2 rounded-lg bg-warning-100">
											<Plug className="size-5 text-warning-600" />
										</div>
										<div>
											<p className="text-lg font-semibold">
												{setup?.mcpsCount ?? 0}
											</p>
											<p className="text-xs text-default-500">MCP Servers</p>
										</div>
									</div>
									<div
										className="flex items-center gap-3 p-3 rounded-lg border border-default-200 hover:bg-default-50 cursor-pointer"
										onClick={() =>
											navigate({
												to: `/workspace/${workspaceId}/api-keys`,
											})
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												navigate({
													to: `/workspace/${workspaceId}/api-keys`,
												});
											}
										}}
									>
										<div className="p-2 rounded-lg bg-secondary-100">
											<KeySquare className="size-5 text-secondary-600" />
										</div>
										<div>
											<p className="text-lg font-semibold">
												{setup?.apiKeysCount ?? 0}
											</p>
											<p className="text-xs text-default-500">API Keys</p>
										</div>
									</div>
								</div>
							)}
						</CardBody>
					</Card>

					{/* Quick Actions */}
					<Card shadow="none" className="border border-default-200">
						<CardHeader>
							<div className="flex items-center gap-2">
								<Coins className="size-5 text-default-500" />
								<span className="font-medium">Quick Actions</span>
							</div>
						</CardHeader>
						<Divider />
						<CardBody>
							<div className="grid grid-cols-2 gap-3">
								<Button
									variant="flat"
									color="primary"
									className="h-auto py-4 flex-col gap-2"
									as={Link}
									to={`/workspace/${workspaceId}/agents/new`}
								>
									<Plus className="size-5" />
									<span>Create Agent</span>
								</Button>
								<Button
									variant="flat"
									color="success"
									className="h-auto py-4 flex-col gap-2"
									as={Link}
									to={`/workspace/${workspaceId}/providers/new`}
								>
									<Server className="size-5" />
									<span>Add Provider</span>
								</Button>
								<Button
									variant="flat"
									color="warning"
									className="h-auto py-4 flex-col gap-2"
									as={Link}
									to={`/workspace/${workspaceId}/mcps/new`}
								>
									<Plug className="size-5" />
									<span>Add MCP Server</span>
								</Button>
								<Button
									variant="flat"
									color="secondary"
									className="h-auto py-4 flex-col gap-2"
									as={Link}
									to={`/workspace/${workspaceId}/api-keys/new`}
								>
									<KeySquare className="size-5" />
									<span>Create API Key</span>
								</Button>
							</div>
						</CardBody>
					</Card>
				</div>
			</div>
		</div>
	);
}
