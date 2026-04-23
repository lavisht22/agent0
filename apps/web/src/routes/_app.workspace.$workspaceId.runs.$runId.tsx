import {
	Accordion,
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
import { Messages, type MessageT } from "@/components/messages";
import { MonacoJsonEditor } from "@/components/monaco-json-editor";
import { PageHeader } from "@/components/page-header";
import { runDataQuery, runQuery } from "@/lib/queries";
import type { AgentFormValues } from "./_app.workspace.$workspaceId.agents.$agentId/types";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/runs/$runId",
)({
	component: RouteComponent,
});

function MetricCard({
	label,
	value,
	unit,
	tooltipContent,
}: {
	label: string;
	value: number | string;
	unit?: string;
	tooltipContent: string;
}) {
	return (
		<Card className="flex-1 text-default-foreground">
			<Card.Content>
				<div className="flex items-center gap-1 text-xs">
					<span>{label}</span>
					<Tooltip delay={0}>
						<Tooltip.Trigger>
							<LucideInfo className="size-3.5" />
						</Tooltip.Trigger>
						<Tooltip.Content>{tooltipContent}</Tooltip.Content>
					</Tooltip>
				</div>
				<span className="text-sm font-semibold">
					{value}
					{unit && <span className="text-xs ml-0.5">{unit}</span>}
				</span>
			</Card.Content>
		</Card>
	);
}

function RouteComponent() {
	const { workspaceId, runId } = Route.useParams();
	const modalState = useOverlayState();
	const navigate = useNavigate();

	const { data: run, isLoading: isRunLoading } = useQuery(runQuery(runId));
	const { data: runData, isLoading: isRunDataLoading } = useQuery({
		...runDataQuery(runId),
		retry: 0,
	});

	const handleReplay = () => {
		if (!runData?.request) return;

		// Navigate to the new agent page with replay data in router state
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

	const agentName = run.agent_versions?.agents?.name || "Unknown Agent";

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
					{/* Metadata Strip */}
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
								agentId: run.agent_versions?.agents?.id || "",
							}}
							className="text-muted hover:text-foreground transition-colors"
						>
							{agentName}
						</Link>
					</div>

					{/* Metrics Row */}
					<div className="flex flex-row items-center gap-4">
						<MetricCard
							label="Cost"
							value={`$${(run.cost || 0).toFixed(6)}`}
							tooltipContent="Total cost of the run."
						/>
						<MetricCard
							label="Total Tokens"
							value={run.tokens || 0}
							tooltipContent="Total tokens used in the run."
						/>
						<div className="w-px h-12 bg-surface-tertiary" />
						<MetricCard
							label="Pre-processing"
							value={run.pre_processing_time / 1000}
							unit="s"
							tooltipContent="Time taken to fetch data from database and tools from MCP server."
						/>
						<p>+</p>
						<MetricCard
							label="First Token"
							value={run.first_token_time / 1000}
							unit="s"
							tooltipContent="Time taken to generate the first token."
						/>
						<p>+</p>
						<MetricCard
							label="Response Time"
							value={run.response_time / 1000}
							unit="s"
							tooltipContent="Time taken to generate the entire response."
						/>
						<p>=</p>
						<MetricCard
							label="Total Time"
							value={
								(run.pre_processing_time +
									run.first_token_time +
									run.response_time) /
								1000
							}
							unit="s"
							tooltipContent="Total time taken to generate the response."
						/>
					</div>

					{isRunDataLoading ? (
						<div className="flex items-center justify-center p-12">
							<Spinner />
						</div>
					) : !runData ? (
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
							{/* Error Display */}
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

							{/* Request & Response Sections */}
							<Accordion
								allowsMultipleExpanded
								defaultExpandedKeys={["response", "usage"]}
							>
								<Accordion.Item id="request">
									<Accordion.Heading>
										<Accordion.Trigger>
											<div className="flex items-center gap-2">
												<span className="font-medium">Request</span>
												<Chip size="sm" variant="tertiary">
													{runData.request?.messages?.length || 0} messages
												</Chip>
												{run.is_stream && (
													<Chip size="sm" variant="tertiary">
														Streaming
													</Chip>
												)}
											</div>
											<Accordion.Indicator />
										</Accordion.Trigger>
									</Accordion.Heading>
									<Accordion.Panel>
										<Accordion.Body>
											<div className="p-4 pt-0 space-y-4">
												{/* Configuration Details */}
												<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
													{/* Model */}
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

													{/* Parameters */}
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
																{runData.request?.maxOutputTokens !==
																	undefined && (
																	<Chip size="sm">
																		Max Tokens:{" "}
																		{runData.request.maxOutputTokens}
																	</Chip>
																)}
																{runData.request?.maxStepCount !==
																	undefined && (
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

													{/* Tools */}
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
																				<Chip
																					key={`custom-${tool.title}`}
																					size="sm"
																				>
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

												{/* Messages */}
												{runData.request?.messages &&
												runData.request.messages.length > 0 ? (
													<Messages
														value={runData.request.messages}
														onValueChange={() => {}}
														isReadOnly
														onVariablePress={() => {}}
													/>
												) : (
													<p className="text-muted text-sm italic">
														No request messages available
													</p>
												)}
											</div>
										</Accordion.Body>
									</Accordion.Panel>
								</Accordion.Item>

								<Accordion.Item id="response">
									<Accordion.Heading>
										<Accordion.Trigger>
											<div className="flex items-center gap-2">
												<span className="font-medium">Response</span>
												<Chip size="sm" variant="tertiary">
													{runData.steps?.length || 0} steps
												</Chip>
											</div>
											<Accordion.Indicator />
										</Accordion.Trigger>
									</Accordion.Heading>
									<Accordion.Panel>
										<Accordion.Body>
											<div className="p-4 pt-0">
												{runData.steps && runData.steps.length > 0 ? (
													<Messages
														value={
															runData.steps[runData.steps.length - 1].response
																.messages as MessageT[]
														}
														onValueChange={() => {}}
														isReadOnly
														onVariablePress={() => {}}
													/>
												) : (
													<p className="text-muted text-sm italic px-4">
														No response steps available
													</p>
												)}
											</div>
										</Accordion.Body>
									</Accordion.Panel>
								</Accordion.Item>

								<Accordion.Item id="usage">
									<Accordion.Heading>
										<Accordion.Trigger>
											<div className="flex items-center gap-2">
												<span className="font-medium">Token Usage</span>
												{runData.totalUsage && (
													<Chip size="sm" variant="tertiary">
														{runData.totalUsage.totalTokens} tokens
													</Chip>
												)}
											</div>
											<Accordion.Indicator />
										</Accordion.Trigger>
									</Accordion.Heading>
									<Accordion.Panel>
										<Accordion.Body>
											<div className="p-4 pt-0">
												{runData.totalUsage ? (
													<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
														{/* Input Tokens */}
														<Card className="text-default-foreground">
															<Card.Content className="space-y-2">
																<div className="flex justify-between items-center">
																	<span className="text-sm font-medium">
																		Input Tokens
																	</span>
																	<span className="text-sm font-bold">
																		{runData.totalUsage.inputTokens}
																	</span>
																</div>
																{runData.totalUsage.inputTokenDetails && (
																	<div className="space-y-1 pl-2 border-l-2 border-border">
																		<div className="flex justify-between text-xs text-muted">
																			<span>Non-cached</span>
																			<span>
																				{runData.totalUsage.inputTokenDetails
																					.noCacheTokens ?? "-"}
																			</span>
																		</div>
																		<div className="flex justify-between text-xs text-muted">
																			<span>Cached Read</span>
																			<span>
																				{runData.totalUsage.inputTokenDetails
																					.cacheReadTokens ?? "-"}
																			</span>
																		</div>
																		<div className="flex justify-between text-xs text-muted">
																			<span>Cached Write</span>
																			<span>
																				{runData.totalUsage.inputTokenDetails
																					.cacheWriteTokens ?? "-"}
																			</span>
																		</div>
																	</div>
																)}
															</Card.Content>
														</Card>

														{/* Output Tokens */}
														<Card className="text-default-foreground">
															<Card.Content className="space-y-3">
																<div className="flex justify-between items-center">
																	<span className="text-sm font-medium">
																		Output Tokens
																	</span>
																	<span className="text-sm font-bold">
																		{runData.totalUsage.outputTokens}
																	</span>
																</div>
																{runData.totalUsage.outputTokenDetails && (
																	<div className="space-y-1 pl-2 border-l-2 border-border">
																		<div className="flex justify-between text-xs text-muted">
																			<span>Text</span>
																			<span>
																				{runData.totalUsage.outputTokenDetails
																					.textTokens ?? "-"}
																			</span>
																		</div>
																		<div className="flex justify-between text-xs text-muted">
																			<span>Reasoning</span>
																			<span>
																				{runData.totalUsage.outputTokenDetails
																					.reasoningTokens ?? "-"}
																			</span>
																		</div>
																	</div>
																)}
															</Card.Content>
														</Card>
													</div>
												) : (
													<p className="text-muted text-sm italic">
														No token usage data available
													</p>
												)}
											</div>
										</Accordion.Body>
									</Accordion.Panel>
								</Accordion.Item>
							</Accordion>
						</>
					)}
				</div>
			</div>

			<Modal state={modalState}>
				<Modal.Backdrop>
					<Modal.Container size="cover">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading>Raw JSON Data</Modal.Heading>
							</Modal.Header>
							<Modal.Body className="p-6">
								<MonacoJsonEditor
									value={
										runData
											? JSON.stringify(runData, null, 2)
											: JSON.stringify({ error: "Run Data not available" })
									}
									readOnly
									minHeight={400}
								/>
							</Modal.Body>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>
		</div>
	);
}
