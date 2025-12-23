import {
	Accordion,
	AccordionItem,
	Alert,
	Button,
	Card,
	CardBody,
	Chip,
	Modal,
	ModalBody,
	ModalContent,
	ModalHeader,
	Spinner,
	Tooltip,
	useDisclosure,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
	AlertCircle,
	CheckCircle2,
	Code,
	FlaskConical,
	LucideInfo,
} from "lucide-react";
import { Messages, type MessageT } from "@/components/messages";
import { ThemedJsonEditor } from "@/components/themed-json-editor";
import { runDataQuery, runQuery } from "@/lib/queries";

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
		<Card className="flex-1">
			<CardBody>
				<div className="flex items-center gap-1 text-xs text-default-500">
					<span>{label}</span>
					<Tooltip content={tooltipContent}>
						<LucideInfo className="size-3.5" />
					</Tooltip>
				</div>
				<span className="text-sm font-semibold">
					{value}
					{unit && (
						<span className="text-xs text-default-400 ml-0.5">{unit}</span>
					)}
				</span>
			</CardBody>
		</Card>
	);
}

function RouteComponent() {
	const { workspaceId, runId } = Route.useParams();
	const { isOpen, onOpen, onClose } = useDisclosure();

	const { data: run, isLoading: isRunLoading } = useQuery(runQuery(runId));
	const { data: runData, isLoading: isRunDataLoading } = useQuery({
		...runDataQuery(runId),
		retry: 0,
	});

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
				<p className="text-default-500">Run not found</p>
			</div>
		);
	}

	const agentName = run.versions?.agents?.name || "Unknown Agent";

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<div className="flex items-center justify-between h-16 border-b border-default-200 px-4 box-content">
				<div className="flex flex-col">
					<div className="flex items-center gap-2">
						<h1 className="text-lg font-medium tracking-tight">{run.id}</h1>
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
					<div className="flex items-center gap-1 text-xs text-default-500">
						<span>{format(run.created_at, "PPpp")}</span>
						<span>•</span>
						<Link
							to="/workspace/$workspaceId/agents/$agentId"
							params={{
								workspaceId: workspaceId,
								agentId: run.versions?.agents?.id || "",
							}}
						>
							<span>{agentName}</span>
						</Link>
					</div>
				</div>

				<Button
					variant="flat"
					size="sm"
					startContent={<Code className="size-4" />}
					onPress={onOpen}
				>
					View Raw
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-5xl mx-auto space-y-6">
					{/* Metrics Row */}
					<div className="flex flex-row items-center gap-4">
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
						<Alert
							title="Run Data Deleted"
							description="The data for this run has been deleted and is no longer available."
							color="warning"
						/>
					) : (
						<>
							{/* Error Display */}
							{runData.error && (
								<Alert
									title={runData.error.name}
									description={runData.error.message}
									color="danger"
								/>
							)}

							{/* Request & Response Sections */}
							<Accordion
								selectionMode="multiple"
								defaultExpandedKeys={["response"]}
							>
								<AccordionItem
									key="request"
									aria-label="Request"
									title={
										<div className="flex items-center gap-2">
											<span className="font-medium">Request</span>
											<Chip size="sm" variant="flat">
												{runData.request?.messages?.length || 0} messages
											</Chip>
											{run.is_stream && (
												<Chip size="sm" variant="flat" color="secondary">
													Streaming
												</Chip>
											)}
										</div>
									}
								>
									<div className="p-4 pt-0 space-y-4">
										{/* Configuration Details */}
										<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
											{/* Model */}
											<Card>
												<CardBody className="p-3">
													<span className="text-xs text-default-500 block mb-1">
														Model
													</span>
													<span className="text-sm font-medium">
														{runData.request?.model?.name || "Unknown"}
													</span>
													<span className="text-xs text-default-400 block">
														{runData.request?.model?.provider_id ||
															"Unknown Provider"}
													</span>
												</CardBody>
											</Card>

											{/* Parameters */}
											<Card>
												<CardBody className="p-3">
													<span className="text-xs text-default-500 block mb-1">
														Parameters
													</span>
													<div className="flex flex-wrap gap-1.5">
														{runData.request?.temperature !== undefined && (
															<Chip size="sm" variant="flat">
																Temp: {runData.request.temperature}
															</Chip>
														)}
														{runData.request?.maxOutputTokens !== undefined && (
															<Chip size="sm" variant="flat">
																Max Tokens: {runData.request.maxOutputTokens}
															</Chip>
														)}
														{runData.request?.maxStepCount !== undefined && (
															<Chip size="sm" variant="flat">
																Max Steps: {runData.request.maxStepCount}
															</Chip>
														)}
														{runData.request?.outputFormat && (
															<Chip size="sm" variant="flat">
																Output: {runData.request.outputFormat}
															</Chip>
														)}
														{!runData.request?.temperature &&
															!runData.request?.maxOutputTokens &&
															!runData.request?.maxStepCount &&
															!runData.request?.outputFormat && (
																<span className="text-xs text-default-400 italic">
																	Default
																</span>
															)}
													</div>
												</CardBody>
											</Card>

											{/* Tools */}
											<Card>
												<CardBody className="p-3">
													<span className="text-xs text-default-500 block mb-1">
														Selected Tools
													</span>
													<div className="flex flex-wrap gap-1.5">
														{runData.request?.tools &&
														runData.request.tools.length > 0 ? (
															runData.request.tools.map((tool) => (
																<Chip
																	key={`${tool.mcp_id}-${tool.name}`}
																	size="sm"
																	variant="flat"
																	color="secondary"
																>
																	{tool.name}
																</Chip>
															))
														) : (
															<span className="text-xs text-default-400 italic">
																No tools selected
															</span>
														)}
													</div>
												</CardBody>
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
											<p className="text-default-400 text-sm italic">
												No request messages available
											</p>
										)}
									</div>
								</AccordionItem>

								<AccordionItem
									key="response"
									aria-label="Response"
									title={
										<div className="flex items-center gap-2">
											<span className="font-medium">Response</span>
											<Chip size="sm" variant="flat">
												{runData.steps?.length || 0} steps
											</Chip>
										</div>
									}
								>
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
											<p className="text-default-400 text-sm italic px-4">
												No response steps available
											</p>
										)}
									</div>
								</AccordionItem>
							</Accordion>
						</>
					)}
				</div>
			</div>

			<Modal
				isOpen={isOpen}
				onClose={onClose}
				size="4xl"
				scrollBehavior="inside"
			>
				<ModalContent>
					<ModalHeader>Raw JSON Data</ModalHeader>
					<ModalBody className="p-6">
						<ThemedJsonEditor
							theme={{
								container: {
									fontSize: "14px",
								},
							}}
							data={runData || { error: "Run data not available" }}
							viewOnly
						/>
					</ModalBody>
				</ModalContent>
			</Modal>
		</div>
	);
}
