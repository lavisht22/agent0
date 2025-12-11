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
	useDisclosure,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { StepResult, ToolSet } from "ai";
import { format } from "date-fns";
import { defaultTheme, JsonEditor } from "json-edit-react";
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Code,
	Cpu,
	FlaskConical,
	Layers,
	Zap,
} from "lucide-react";
import { Messages, type MessageT } from "@/components/messages";
import { runQuery } from "@/lib/queries";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/runs/$runId",
)({
	component: RouteComponent,
});

// Type for the run data stored in the database
type RunData = {
	request?: {
		model: { provider_id: string; name: string };
		messages: MessageT[];
		maxOutputTokens?: number;
		outputFormat?: "text" | "json";
		temperature?: number;
		maxStepCount?: number;
		stream: boolean;
	};
	steps?: StepResult<ToolSet>[];
	error?: {
		name: string;
		message: string;
		cause?: unknown;
	};
	metrics: {
		preProcessingTime: number;
		firstTokenTime: number;
		responseTime: number;
	};
};

function MetricCard({
	icon: Icon,
	label,
	value,
	unit,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number | string;
	unit?: string;
}) {
	return (
		<Card className="bg-default-50">
			<CardBody className="flex flex-row items-center gap-3 p-3">
				<div className="p-2 rounded-lg bg-primary/10">
					<Icon className="size-4 text-primary" />
				</div>
				<div className="flex flex-col">
					<span className="text-xs text-default-500">{label}</span>
					<span className="text-sm font-semibold">
						{value}
						{unit && (
							<span className="text-xs text-default-400 ml-0.5">{unit}</span>
						)}
					</span>
				</div>
			</CardBody>
		</Card>
	);
}

function RouteComponent() {
	const { workspaceId, runId } = Route.useParams();
	const { isOpen, onOpen, onClose } = useDisclosure();

	const { data: run, isLoading } = useQuery(runQuery(runId));

	if (isLoading) {
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

	const data = run.data as unknown as RunData;
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
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<MetricCard
							icon={Clock}
							label="Pre-processing"
							value={
								data.metrics?.preProcessingTime
									? data.metrics.preProcessingTime / 1000
									: 0
							}
							unit="s"
						/>
						<MetricCard
							icon={Zap}
							label="First Token"
							value={
								data.metrics?.firstTokenTime
									? data.metrics.firstTokenTime / 1000
									: 0
							}
							unit="s"
						/>
						<MetricCard
							icon={Layers}
							label="Total Response"
							value={
								data.metrics?.responseTime
									? data.metrics.responseTime / 1000
									: 0
							}
							unit="s"
						/>
						<MetricCard
							icon={Cpu}
							label="Model"
							value={data.request?.model?.name || "Unknown"}
						/>
					</div>

					{/* Error Display */}
					{data.error && (
						<Alert
							title={data.error.name}
							description={data.error.message}
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
										{data.request?.messages?.length || 0} messages
									</Chip>
									{data.request?.stream && (
										<Chip size="sm" variant="flat" color="secondary">
											Streaming
										</Chip>
									)}
								</div>
							}
						>
							<div className="p-4 pt-0">
								{data.request?.messages && data.request.messages.length > 0 ? (
									<Messages
										value={data.request.messages}
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
										{data.steps?.length || 0} steps
									</Chip>
								</div>
							}
						>
							<div className="p-4 pt-0">
								{data.steps && data.steps.length > 0 ? (
									<Messages
										value={
											data.steps[data.steps.length - 1].response
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
						<JsonEditor
							theme={[
								defaultTheme,
								{
									container: {
										backgroundColor: "transparent ",
										fontSize: "14px",
									},
								},
							]}
							data={run.data}
							viewOnly
						/>
					</ModalBody>
				</ModalContent>
			</Modal>
		</div>
	);
}
