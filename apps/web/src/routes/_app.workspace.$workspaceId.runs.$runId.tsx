import {
	Alert,
	Button,
	Card,
	Chip,
	Modal,
	Spinner,
	Tooltip,
	useOverlayState,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
	AlertCircle,
	CheckCircle2,
	Code,
	FlaskConical,
	LucideInfo,
	RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";
import {
	Messages,
	type MessageT,
	normalizeMessages,
} from "@/components/messages";
import { MonacoJsonEditor } from "@/components/monaco-json-editor";
import { PageHeader } from "@/components/page-header";
import { RunMetadataCard } from "@/components/run-metadata-card";
import { childRunsQuery, runQuery } from "@/lib/queries";
import type { AgentFormValues } from "./_app.workspace.$workspaceId.agents.$agentId/types";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/runs/$runId",
)({
	component: RouteComponent,
});

// One wrapper for every section on this page so the heading row and the
// heading→content gap are identical everywhere. `suffix` holds inline chips
// (e.g. message/step counts) that sit next to the title.
function Section({
	title,
	suffix,
	children,
}: {
	title: string;
	suffix?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section>
			<div className="mb-2 flex h-7 items-center gap-2">
				<h2 className="font-medium">{title}</h2>
				{suffix}
			</div>
			{children}
		</section>
	);
}

// Compact label/value stat used inside the Timing and Usage & Cost cards.
function Stat({
	label,
	value,
	unit,
	tooltip,
}: {
	label: string;
	value: number | string;
	unit?: string;
	tooltip?: string;
}) {
	return (
		<div>
			<div className="flex items-center gap-1 text-xs text-muted">
				<span>{label}</span>
				{tooltip && (
					<Tooltip delay={0}>
						<Tooltip.Trigger>
							<LucideInfo className="size-3.5" />
						</Tooltip.Trigger>
						<Tooltip.Content>{tooltip}</Tooltip.Content>
					</Tooltip>
				)}
			</div>
			<div className="text-sm font-semibold">
				{value}
				{unit && <span className="text-xs ml-0.5">{unit}</span>}
			</div>
		</div>
	);
}

// Read-only messages. Long text parts cap their own height and scroll inside
// the card (see the message components); tool calls stay fully visible.
function ReadOnlyMessages({ messages }: { messages: MessageT[] }) {
	return (
		<Messages
			value={messages}
			onValueChange={() => {}}
			isReadOnly
			onVariablePress={() => {}}
		/>
	);
}

// Shared row for a related run (parent or child) in the lineage section, so
// both render identically. Opens the run in a new tab.
type LineageRun = {
	id: string;
	is_error: boolean;
	created_at: string;
	agent: { name: string | null } | null;
};

function RunLink({
	workspaceId,
	run,
}: {
	workspaceId: string;
	run: LineageRun;
}) {
	return (
		<li className="flex items-center gap-2">
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
			<Link
				to="/workspace/$workspaceId/runs/$runId"
				params={{ workspaceId, runId: run.id }}
				target="_blank"
				rel="noreferrer"
				className="text-foreground hover:underline"
			>
				{run.agent?.name || "Unknown Agent"}
			</Link>
			<span className="text-muted text-xs">
				{format(run.created_at, "PPp")}
			</span>
		</li>
	);
}

function RouteComponent() {
	const { workspaceId, runId } = Route.useParams();
	const modalState = useOverlayState();
	const navigate = useNavigate();

	const { data: run, isLoading: isRunLoading } = useQuery(
		runQuery(workspaceId, runId),
	);
	const runData = run?.run_data ?? null;

	// Parent/child run lineage (agent-as-tool). Both enable only once their id
	// is known, so they're safe to call unconditionally before the early returns.
	const { data: parentRun } = useQuery(
		runQuery(workspaceId, run?.parent_run_id ?? ""),
	);
	const { data: childRuns } = useQuery(childRunsQuery(workspaceId, runId));

	const handleReplay = () => {
		if (!runData?.request) return;

		navigate({
			to: "/workspace/$workspaceId/agents/$agentId",
			params: { workspaceId, agentId: "new" },
			state: {
				replayData: runData.request as AgentFormValues,
			} as Record<string, unknown>,
		});
	};

	if (isRunLoading) {
		return (
			<div className="h-screen flex items-center justify-center">
				<Spinner size="lg" />
			</div>
		);
	}

	if (!run) {
		return (
			<div className="h-screen flex items-center justify-center">
				<p>Run not found</p>
			</div>
		);
	}

	const agentName = run.agent?.name || "Unknown Agent";

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<PageHeader
				breadcrumbs={[
					{
						label: "Runs",
						to: "/workspace/$workspaceId/runs",
						params: { workspaceId },
						search: { page: 1 },
					},
					{ label: run.id },
				]}
			>
				<Button
					variant="tertiary"
					size="sm"
					onPress={handleReplay}
					isDisabled={!runData?.request}
				>
					<RotateCcw className="size-4" />
					Replay
				</Button>
				<Button variant="tertiary" size="sm" onPress={modalState.open}>
					<Code className="size-4" />
					View Raw
				</Button>
			</PageHeader>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-5xl mx-auto space-y-6">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
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
						<span className="text-muted">{format(run.created_at, "PPpp")}</span>
						<span className="text-muted">•</span>
						<Link
							to="/workspace/$workspaceId/agents/$agentId"
							params={{
								workspaceId,
								agentId: run.agent?.id || "",
							}}
							className="text-muted hover:text-foreground transition-colors"
						>
							{agentName}
						</Link>
					</div>

					{/* Details */}
					<Section title="Details">
						<RunMetadataCard
							workspaceId={workspaceId}
							runId={run.id}
							metadata={run.metadata}
						>
							{(parentRun || (childRuns && childRuns.length > 0)) && (
								<div className="space-y-3 border-t border-border pt-4">
									{parentRun && (
										<div className="flex flex-col gap-1.5">
											<span className="text-muted">Called by</span>
											<ul className="flex flex-col gap-1.5">
												<RunLink workspaceId={workspaceId} run={parentRun} />
											</ul>
										</div>
									)}
									{childRuns && childRuns.length > 0 && (
										<div className="flex flex-col gap-1.5">
											<span className="text-muted">
												Sub-runs ({childRuns.length})
											</span>
											<ul className="flex flex-col gap-1.5">
												{childRuns.map((child) => (
													<RunLink
														key={child.id}
														workspaceId={workspaceId}
														run={child}
													/>
												))}
											</ul>
										</div>
									)}
								</div>
							)}
						</RunMetadataCard>
					</Section>

					{/* Timing */}
					<Section title="Timing">
						<Card className="text-default-foreground">
							<Card.Content>
								<div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-x-4">
									<Stat
										label="Pre-processing"
										value={run.pre_processing_time / 1000}
										unit="s"
										tooltip="Time taken to fetch data from database and tools from MCP server."
									/>
									<span className="text-muted">+</span>
									<Stat
										label="First Token"
										value={run.first_token_time / 1000}
										unit="s"
										tooltip="Time taken to generate the first token."
									/>
									<span className="text-muted">+</span>
									<Stat
										label="Response Time"
										value={run.response_time / 1000}
										unit="s"
										tooltip="Time taken to generate the entire response."
									/>
									<span className="text-muted">=</span>
									<Stat
										label="Total Time"
										value={
											(run.pre_processing_time +
												run.first_token_time +
												run.response_time) /
											1000
										}
										unit="s"
										tooltip="Total time taken to generate the response."
									/>
								</div>
							</Card.Content>
						</Card>
					</Section>

					{/* Usage & Cost */}
					<Section title="Usage & Cost">
						<Card className="text-default-foreground">
							<Card.Content>
								<div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
									<Stat label="Cost" value={`$${(run.cost || 0).toFixed(6)}`} />
									<Stat label="Total Tokens" value={run.tokens || 0} />
									{runData?.totalUsage && (
										<>
											<div className="space-y-1">
												<div className="flex items-center justify-between">
													<span className="text-xs text-muted">Input</span>
													<span className="font-semibold">
														{runData.totalUsage.inputTokens}
													</span>
												</div>
												{runData.totalUsage.inputTokenDetails && (
													<div className="space-y-0.5 text-xs text-muted">
														<div className="flex justify-between">
															<span>Non-cached</span>
															<span>
																{runData.totalUsage.inputTokenDetails
																	.noCacheTokens ?? "-"}
															</span>
														</div>
														<div className="flex justify-between">
															<span>Cached read</span>
															<span>
																{runData.totalUsage.inputTokenDetails
																	.cacheReadTokens ?? "-"}
															</span>
														</div>
														<div className="flex justify-between">
															<span>Cached write</span>
															<span>
																{runData.totalUsage.inputTokenDetails
																	.cacheWriteTokens ?? "-"}
															</span>
														</div>
													</div>
												)}
											</div>
											<div className="space-y-1">
												<div className="flex items-center justify-between">
													<span className="text-xs text-muted">Output</span>
													<span className="font-semibold">
														{runData.totalUsage.outputTokens}
													</span>
												</div>
												{runData.totalUsage.outputTokenDetails && (
													<div className="space-y-0.5 text-xs text-muted">
														<div className="flex justify-between">
															<span>Text</span>
															<span>
																{runData.totalUsage.outputTokenDetails
																	.textTokens ?? "-"}
															</span>
														</div>
														<div className="flex justify-between">
															<span>Reasoning</span>
															<span>
																{runData.totalUsage.outputTokenDetails
																	.reasoningTokens ?? "-"}
															</span>
														</div>
													</div>
												)}
											</div>
										</>
									)}
								</div>
							</Card.Content>
						</Card>
					</Section>

					{!runData ? (
						<Alert status="warning">
							<Alert.Indicator />
							<Alert.Content>
								<Alert.Title>Run Data Deleted</Alert.Title>
								<Alert.Description>
									The data for this run has been deleted and is no longer
									available.
								</Alert.Description>
							</Alert.Content>
						</Alert>
					) : (
						<>
							{runData.error && (
								<Alert status="danger">
									<Alert.Indicator />
									<Alert.Content>
										<Alert.Title>{runData.error.name}</Alert.Title>
										<Alert.Description>
											{runData.error.message}
										</Alert.Description>
									</Alert.Content>
								</Alert>
							)}

							{/* Request */}
							<Section
								title="Request"
								suffix={
									<>
										<Chip size="sm" variant="tertiary">
											{runData.request?.messages?.length || 0} messages
										</Chip>
										{run.is_stream && (
											<Chip size="sm" variant="tertiary">
												Streaming
											</Chip>
										)}
									</>
								}
							>
								<div className="space-y-2">
									<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
										<Card className="text-default-foreground">
											<Card.Content>
												<span className="text-xs text-muted block mb-1">
													Model
												</span>
												<span className="text-sm font-medium">
													{runData.request?.model?.name || "Unknown"}
												</span>
												<span className="text-xs text-muted block">
													{runData.request?.model?.provider_id ||
														"Unknown Provider"}
												</span>
											</Card.Content>
										</Card>

										<Card className="text-default-foreground">
											<Card.Content>
												<span className="text-xs text-muted block mb-1">
													Parameters
												</span>
												<div className="flex flex-wrap gap-1.5">
													{runData.request?.temperature !== undefined && (
														<Chip size="sm">
															Temp: {runData.request.temperature}
														</Chip>
													)}
													{runData.request?.maxOutputTokens !== undefined && (
														<Chip size="sm">
															Max Tokens: {runData.request.maxOutputTokens}
														</Chip>
													)}
													{runData.request?.maxStepCount !== undefined && (
														<Chip size="sm">
															Max Steps: {runData.request.maxStepCount}
														</Chip>
													)}
													{runData.request?.outputFormat && (
														<Chip size="sm">
															Output: {runData.request.outputFormat}
														</Chip>
													)}
													{!runData.request?.temperature &&
														!runData.request?.maxOutputTokens &&
														!runData.request?.maxStepCount &&
														!runData.request?.outputFormat && (
															<span className="text-xs text-muted italic">
																Default
															</span>
														)}
												</div>
											</Card.Content>
										</Card>

										<Card className="text-default-foreground">
											<Card.Content>
												<span className="text-xs text-muted block mb-1">
													Selected Tools
												</span>
												<div className="flex flex-wrap gap-1.5">
													{runData.request?.tools &&
													runData.request.tools.length > 0 ? (
														runData.request.tools.map((tool) => {
															if (tool.type === "mcp") {
																return (
																	<Chip
																		key={`${tool.mcp_id}-${tool.name}`}
																		size="sm"
																	>
																		{tool.name}
																	</Chip>
																);
															}

															if (tool.type === "custom") {
																return (
																	<Chip key={`custom-${tool.title}`} size="sm">
																		{tool.title}
																	</Chip>
																);
															}

															return null;
														})
													) : (
														<span className="text-xs text-muted italic">
															No tools selected
														</span>
													)}
												</div>
											</Card.Content>
										</Card>
									</div>

									{runData.request?.messages &&
									runData.request.messages.length > 0 ? (
										<ReadOnlyMessages
											messages={normalizeMessages(runData.request.messages)}
										/>
									) : (
										<p className="text-muted text-sm italic">
											No request messages available
										</p>
									)}
								</div>
							</Section>

							{/* Response */}
							<Section
								title="Response"
								suffix={
									<Chip size="sm" variant="tertiary">
										{runData.steps?.length || 0} steps
									</Chip>
								}
							>
								{runData.steps && runData.steps.length > 0 ? (
									<ReadOnlyMessages
										messages={normalizeMessages(
											runData.steps[runData.steps.length - 1].response
												.messages as MessageT[],
										)}
									/>
								) : (
									<p className="text-muted text-sm italic">
										No response steps available
									</p>
								)}
							</Section>
						</>
					)}
				</div>
			</div>

			<Modal state={modalState}>
				<Modal.Backdrop>
					<Modal.Container size="cover">
						<Modal.Dialog className="flex flex-col">
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading>Raw JSON Data</Modal.Heading>
							</Modal.Header>
							<Modal.Body className="flex-1 min-h-0 p-6">
								<div className="h-[calc(100vh-10rem)]">
									<MonacoJsonEditor
										value={
											runData
												? JSON.stringify(runData, null, 2)
												: JSON.stringify({ error: "Run Data not available" })
										}
										readOnly
										fillHeight
									/>
								</div>
							</Modal.Body>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>
		</div>
	);
}
