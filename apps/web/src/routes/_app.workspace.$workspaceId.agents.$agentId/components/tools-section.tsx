import {
	Button,
	Card,
	Chip,
	CloseButton,
	cn,
	Description,
	Drawer,
	Dropdown,
	Header,
	Input,
	InputGroup,
	Label,
	ListBox,
	Select,
	Separator,
	TextArea,
	TextField,
	toast,
	useOverlayState,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import {
	LucideBot,
	LucidePlus,
	LucideSearch,
	LucideServer,
	LucideWrench,
} from "lucide-react";
import { useState } from "react";
import { MonacoJsonEditor } from "@/components/monaco-json-editor";
import { agentsLiteQuery, mcpsQuery } from "@/lib/queries";
import type { AgentTool, CustomTool, MCPTool } from "@/lib/types";

/**
 * Union type for all tools
 */
type ToolDefinition = MCPTool | CustomTool | AgentTool;

// For backward compatibility, support old format without type field
type LegacyTool = { mcp_id: string; name: string };
type ToolValue = ToolDefinition | LegacyTool;

interface ToolsSectionProps {
	workspaceId: string;
	/** The agent being edited — excluded from the agent-tool picker. */
	agentId: string;
	value: ToolValue[];
	onValueChange: (value: ToolValue[]) => void;
	isInvalid?: boolean;
	environment: "staging" | "production";
}

// Derive a default tool name from an agent name: lowercase, underscores.
const slugifyToolName = (name: string): string =>
	name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

type ToolEntry = { name: string; description: string };

// Read the tools list for the requested environment, accommodating both the
// new per-env shape `{ production, staging }` and any legacy flat-array rows
// that pre-date the migration backfill.
const getToolsForEnv = (
	rawTools: unknown,
	environment: "staging" | "production",
): ToolEntry[] | undefined => {
	if (!rawTools) return undefined;

	if (Array.isArray(rawTools)) {
		// Legacy shape — treat as production-only.
		return environment === "production" ? (rawTools as ToolEntry[]) : undefined;
	}

	const byEnv = rawTools as {
		production?: ToolEntry[];
		staging?: ToolEntry[] | null;
	};
	return byEnv[environment] ?? byEnv.production;
};

// Helper to normalize tool to new format
const normalizeTool = (tool: ToolValue): ToolDefinition => {
	if ("type" in tool) {
		return tool;
	}
	// Convert legacy format to new MCPTool format
	return {
		type: "mcp",
		mcp_id: tool.mcp_id,
		name: tool.name,
	};
};

// Helper to check if tool is MCP type
const isMCPTool = (tool: ToolValue): tool is MCPTool | LegacyTool => {
	return !("type" in tool) || tool.type === "mcp";
};

// Helper to check if tool is custom type
const isCustomTool = (tool: ToolValue): tool is CustomTool => {
	return "type" in tool && tool.type === "custom";
};

// Helper to check if tool is an agent-as-tool
const isAgentTool = (tool: ToolValue): tool is AgentTool => {
	return "type" in tool && tool.type === "agent";
};

export default function ToolsSection({
	workspaceId,
	agentId,
	value,
	onValueChange,
	isInvalid,
	environment,
}: ToolsSectionProps) {
	// Modal state for adding custom tool
	const customToolModalState = useOverlayState();

	// Modal state for MCP tool selection
	const mcpToolModalState = useOverlayState();

	// Modal state for adding/editing an agent-as-tool
	const agentToolModalState = useOverlayState();

	// Agent tool form state
	const [agentToolAgentId, setAgentToolAgentId] = useState<string | null>(null);
	const [agentToolName, setAgentToolName] = useState("");
	const [agentToolDescription, setAgentToolDescription] = useState("");
	// The agent tool being edited (null means adding a new one). Keyed by name,
	// which is the unique identifier of an agent tool within a version.
	const [editingAgentTool, setEditingAgentTool] = useState<AgentTool | null>(
		null,
	);

	// Search filter for MCP tools
	const [mcpToolSearch, setMcpToolSearch] = useState("");

	// Custom tool form state
	const [customToolTitle, setCustomToolTitle] = useState("");
	const [customToolDescription, setCustomToolDescription] = useState("");
	const [customToolInputSchema, setCustomToolInputSchema] = useState(
		JSON.stringify(
			{
				type: "object",
				properties: {
					param1: { type: "string", description: "Description of param1" },
				},
				required: ["param1"],
			},
			null,
			2,
		),
	);
	const [inputSchemaError, setInputSchemaError] = useState<string | null>(null);

	// Track the custom tool being edited (null means adding new tool)
	const [editingCustomTool, setEditingCustomTool] = useState<CustomTool | null>(
		null,
	);

	const { data: mcps } = useQuery(mcpsQuery(workspaceId));
	const { data: agents } = useQuery(agentsLiteQuery(workspaceId));

	// Agents that can be added as a tool: everything in the workspace except the
	// agent currently being edited (no direct self-reference).
	const selectableAgents = agents?.filter((a) => a.id !== agentId) ?? [];

	const handleRemoveTool = (toolToRemove: ToolValue) => {
		const normalized = normalizeTool(toolToRemove);

		onValueChange(
			value.filter((item) => {
				const normalizedItem = normalizeTool(item);

				// Compare based on type
				if (normalizedItem.type === "mcp" && normalized.type === "mcp") {
					return !(
						normalizedItem.mcp_id === normalized.mcp_id &&
						normalizedItem.name === normalized.name
					);
				}
				if (normalizedItem.type === "custom" && normalized.type === "custom") {
					return normalizedItem.title !== normalized.title;
				}
				if (normalizedItem.type === "agent" && normalized.type === "agent") {
					return normalizedItem.name !== normalized.name;
				}
				return true;
			}),
		);
	};

	const handleAddMCPTool = (mcp_id: string, toolName: string) => {
		// Check if already added
		const isAlreadyAdded = value.some((item) => {
			if (isMCPTool(item)) {
				const mcpTool = item as { mcp_id: string; name: string };
				return mcpTool.mcp_id === mcp_id && mcpTool.name === toolName;
			}
			return false;
		});

		if (isAlreadyAdded) {
			return;
		}

		const newTool: MCPTool = {
			type: "mcp",
			mcp_id,
			name: toolName,
		};

		onValueChange([...value, newTool]);
	};

	const handleEditCustomTool = (tool: CustomTool) => {
		setEditingCustomTool(tool);
		setCustomToolTitle(tool.title);
		setCustomToolDescription(tool.description);
		setCustomToolInputSchema(
			tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : "",
		);
		setInputSchemaError(null);
		customToolModalState.open();
	};

	const handleSaveCustomTool = () => {
		if (!customToolTitle.trim()) {
			toast.danger("Tool title is required.");
			return;
		}

		if (!customToolDescription.trim()) {
			toast.danger("Tool description is required.");
			return;
		}

		// Parse and validate input schema if provided
		let parsedInputSchema: Record<string, unknown> | undefined;
		if (customToolInputSchema.trim()) {
			try {
				parsedInputSchema = JSON.parse(customToolInputSchema.trim());
				if (
					typeof parsedInputSchema !== "object" ||
					parsedInputSchema === null
				) {
					toast.danger("Input schema must be a valid JSON object.");
					return;
				}
			} catch {
				toast.danger("Invalid JSON in input schema.");
				return;
			}
		}

		// Check if a custom tool with this title already exists (excluding the one being edited)
		const isAlreadyAdded = value.some((item) => {
			if (isCustomTool(item)) {
				// When editing, allow the same title if it matches the original
				if (editingCustomTool && item.title === editingCustomTool.title) {
					return false;
				}
				return item.title === customToolTitle.trim();
			}
			return false;
		});

		if (isAlreadyAdded) {
			toast.danger("A custom tool with this title already exists.");
			return;
		}

		const newTool: CustomTool = {
			type: "custom",
			title: customToolTitle.trim(),
			description: customToolDescription.trim(),
			inputSchema: parsedInputSchema,
		};

		if (editingCustomTool) {
			// Update existing tool
			onValueChange(
				value.map((item) => {
					if (isCustomTool(item) && item.title === editingCustomTool.title) {
						return newTool;
					}
					return item;
				}),
			);
		} else {
			// Add new tool
			onValueChange([...value, newTool]);
		}

		// Reset form and close modal
		setCustomToolTitle("");
		setCustomToolDescription("");
		setCustomToolInputSchema("");
		setInputSchemaError(null);
		setEditingCustomTool(null);
		customToolModalState.close();
	};

	const resetAgentToolForm = () => {
		setAgentToolAgentId(null);
		setAgentToolName("");
		setAgentToolDescription("");
		setEditingAgentTool(null);
	};

	const handleEditAgentTool = (tool: AgentTool) => {
		setEditingAgentTool(tool);
		setAgentToolAgentId(tool.agent_id);
		setAgentToolName(tool.name);
		setAgentToolDescription(tool.description);
		agentToolModalState.open();
	};

	const handleSaveAgentTool = () => {
		if (!agentToolAgentId) {
			toast.danger("Select an agent.");
			return;
		}
		const name = agentToolName.trim();
		if (!name) {
			toast.danger("Tool name is required.");
			return;
		}
		if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
			toast.danger(
				"Tool name may only contain letters, numbers, underscores, and hyphens.",
			);
			return;
		}
		if (!agentToolDescription.trim()) {
			toast.danger("Description is required.");
			return;
		}

		// Names are the runtime identifier for a tool — keep them unique across
		// agent tools and custom tools (which the model also sees by name).
		const nameTaken = value.some((item) => {
			if (editingAgentTool && isAgentTool(item)) {
				// Allow keeping the same name when editing the same tool.
				if (item.name === editingAgentTool.name) return false;
			}
			if (isAgentTool(item)) return item.name === name;
			if (isCustomTool(item)) return item.title === name;
			return false;
		});
		if (nameTaken) {
			toast.danger("A tool with this name already exists.");
			return;
		}

		const newTool: AgentTool = {
			type: "agent",
			agent_id: agentToolAgentId,
			name,
			description: agentToolDescription.trim(),
		};

		if (editingAgentTool) {
			onValueChange(
				value.map((item) =>
					isAgentTool(item) && item.name === editingAgentTool.name
						? newTool
						: item,
				),
			);
		} else {
			onValueChange([...value, newTool]);
		}

		resetAgentToolForm();
		agentToolModalState.close();
	};

	// Get MCP name by id for display purposes
	const getMcpName = (mcp_id: string) => {
		const mcp = mcps?.find((m) => m.id === mcp_id);
		return mcp?.name || mcp_id;
	};

	// Get agent name by id for display purposes
	const getAgentName = (agent_id: string) => {
		const agent = agents?.find((a) => a.id === agent_id);
		return agent?.name || agent_id;
	};

	// Get all available MCP tools that are not yet selected
	const getAvailableMCPTools = () => {
		const availableTools: {
			mcp_id: string;
			mcp_name: string;
			name: string;
			description: string;
		}[] = [];

		mcps?.forEach((mcp) => {
			const tools = getToolsForEnv(mcp?.tools, environment);

			tools?.forEach((tool) => {
				const isSelected = value.some((item) => {
					if (isMCPTool(item)) {
						const mcpTool = item as { mcp_id: string; name: string };
						return mcpTool.mcp_id === mcp.id && mcpTool.name === tool.name;
					}
					return false;
				});

				if (!isSelected) {
					availableTools.push({
						mcp_id: mcp.id,
						mcp_name: mcp.name,
						name: tool.name,
						description: tool.description,
					});
				}
			});
		});

		return availableTools;
	};

	const availableMCPTools = getAvailableMCPTools();
	const hasMCPs = mcps && mcps.length > 0;

	// Separate MCP tools, custom tools, and agent tools from value
	const mcpTools = value.filter(isMCPTool);
	const customTools = value.filter(isCustomTool);
	const agentTools = value.filter(isAgentTool);

	return (
		<>
			<Card className={isInvalid ? "border-danger border" : ""}>
				<Card.Header className="flex flex-row items-center justify-between">
					<span className="text-sm text-muted">Tools</span>
					<Dropdown>
						<Button size="sm" variant="tertiary" isIconOnly>
							<LucidePlus className="size-3.5" />
						</Button>
						<Dropdown.Popover>
							<Dropdown.Menu
								disabledKeys={[
									...(!hasMCPs || availableMCPTools.length === 0
										? ["mcp"]
										: []),
									...(selectableAgents.length === 0 ? ["agent"] : []),
								]}
								onAction={(key) => {
									if (key === "mcp") {
										mcpToolModalState.open();
									} else if (key === "custom") {
										customToolModalState.open();
									} else if (key === "agent") {
										resetAgentToolForm();
										agentToolModalState.open();
									}
								}}
							>
								<Dropdown.Item id="mcp" textValue="From MCP Server">
									<LucideServer className="size-4" />
									<div className="flex flex-col">
										<Label>From MCP Server</Label>
										<Description>Add a tool from an MCP server</Description>
									</div>
								</Dropdown.Item>
								<Dropdown.Item id="custom" textValue="Custom Tool">
									<LucideWrench className="size-4" />
									<div className="flex flex-col">
										<Label>Custom Tool</Label>
										<Description>Define a custom tool</Description>
									</div>
								</Dropdown.Item>
								<Dropdown.Item id="agent" textValue="From Agent">
									<LucideBot className="size-4" />
									<div className="flex flex-col">
										<Label>From Agent</Label>
										<Description>Expose another agent as a tool</Description>
									</div>
								</Dropdown.Item>
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				</Card.Header>
				<Card.Content>
					{value.length === 0 ? (
						<p className="text-sm text-muted">
							No tools added. Click "+" to add tools to your agent. (Optional)
						</p>
					) : (
						<div className="flex flex-wrap gap-2">
							{/* MCP Tools */}
							{mcpTools.map((tool) => {
								const mcpTool = tool as { mcp_id: string; name: string };
								return (
									<Chip key={`mcp-${mcpTool.mcp_id}-${mcpTool.name}`}>
										<Chip.Label>
											{mcpTool.name}{" "}
											<span className="text-muted ml-1 text-xs">
												{getMcpName(mcpTool.mcp_id)}
											</span>
										</Chip.Label>

										<CloseButton
											aria-label="Remove tool"
											onPress={() => handleRemoveTool(tool)}
										/>
									</Chip>
								);
							})}
							{/* Custom Tools */}
							{customTools.map((tool) => (
								<Chip
									key={`custom-${tool.title}`}
									className="cursor-pointer"
									onClick={() => handleEditCustomTool(tool)}
								>
									<Chip.Label>
										{tool.title}{" "}
										<span className="text-muted ml-1 text-xs">Custom</span>
									</Chip.Label>

									<CloseButton
										aria-label="Remove tool"
										onPress={() => handleRemoveTool(tool)}
									/>
								</Chip>
							))}
							{/* Agent Tools */}
							{agentTools.map((tool) => (
								<Chip
									key={`agent-${tool.name}`}
									className="cursor-pointer"
									onClick={() => handleEditAgentTool(tool)}
								>
									<Chip.Label>
										{tool.name}{" "}
										<span className="text-muted ml-1 text-xs">
											{getAgentName(tool.agent_id)}
										</span>
									</Chip.Label>

									<CloseButton
										aria-label="Remove tool"
										onPress={() => handleRemoveTool(tool)}
									/>
								</Chip>
							))}
						</div>
					)}
				</Card.Content>
			</Card>

			{/* MCP Tools Modal */}
			<Drawer state={mcpToolModalState}>
				<Drawer.Backdrop>
					<Drawer.Content placement="right">
						<Drawer.Dialog>
							<Drawer.CloseTrigger />
							<Drawer.Header>
								<Drawer.Heading>Add MCP Tool</Drawer.Heading>
								<InputGroup fullWidth variant="secondary">
									<InputGroup.Prefix>
										<LucideSearch className="size-4" />
									</InputGroup.Prefix>
									<InputGroup.Input
										placeholder="Search tools..."
										value={mcpToolSearch}
										onChange={(e) => setMcpToolSearch(e.target.value)}
									/>
									<InputGroup.Suffix>
										{mcpToolSearch && (
											<CloseButton
												aria-label="Clear search"
												onPress={() => setMcpToolSearch("")}
											/>
										)}
									</InputGroup.Suffix>
								</InputGroup>
							</Drawer.Header>
							<Drawer.Body>
								<ListBox aria-label="Available MCP Tools">
									{/** biome-ignore lint/complexity/noUselessFragments: <heroui problem> */}
									<>
										{mcps?.map((mcp, _index) => {
											const tools = getToolsForEnv(mcp?.tools, environment);

											const availableMcpTools = tools?.filter((tool) => {
												// Check if already selected
												const isSelected = value.some((item) => {
													if (isMCPTool(item)) {
														const mcpTool = item as {
															mcp_id: string;
															name: string;
														};
														return (
															mcpTool.mcp_id === mcp.id &&
															mcpTool.name === tool.name
														);
													}
													return false;
												});

												if (isSelected) return false;

												// Apply search filter
												if (mcpToolSearch.trim()) {
													const searchLower = mcpToolSearch.toLowerCase();
													return (
														tool.name.toLowerCase().includes(searchLower) ||
														tool.description
															?.toLowerCase()
															.includes(searchLower) ||
														mcp.name.toLowerCase().includes(searchLower)
													);
												}

												return true;
											});

											if (
												!availableMcpTools ||
												availableMcpTools.length === 0
											) {
												return null;
											}

											return (
												<>
													<ListBox.Section key={mcp.id}>
														<Header>{mcp.name}</Header>
														{availableMcpTools?.map((tool) => (
															<ListBox.Item
																key={mcp.id + tool.name}
																id={mcp.id + tool.name}
																textValue={tool.name}
																onAction={() => {
																	handleAddMCPTool(mcp.id, tool.name);
																}}
																className="flex-col items-start"
															>
																<Label>{tool.name}</Label>
																<Description>{tool.description}</Description>
															</ListBox.Item>
														))}
													</ListBox.Section>
													<Separator className="my-4" />
												</>
											);
										})}
									</>
								</ListBox>

								{availableMCPTools.length === 0 && (
									<p className="text-sm text-muted text-center py-4">
										No available MCP tools. All tools have been added or no MCP
										servers are configured.
									</p>
								)}
							</Drawer.Body>
						</Drawer.Dialog>
					</Drawer.Content>
				</Drawer.Backdrop>
			</Drawer>

			{/* Custom Tool Modal */}
			<Drawer state={customToolModalState}>
				<Drawer.Backdrop>
					<Drawer.Content placement="right">
						<Drawer.Dialog style={{ width: 640, maxWidth: "85vw" }}>
							<Drawer.CloseTrigger />
							<Drawer.Header>
								<Drawer.Heading>
									{editingCustomTool ? "Edit Custom Tool" : "Add Custom Tool"}
								</Drawer.Heading>
							</Drawer.Header>
							<Drawer.Body className="space-y-4">
								<TextField isRequired variant="secondary">
									<Label>Tool Title</Label>
									<Input
										placeholder="e.g., get_weather"
										value={customToolTitle}
										onChange={(e) => setCustomToolTitle(e.target.value)}
									/>
									<Description>
										A unique identifier for the tool (lowercase with underscores
										recommended)
									</Description>
								</TextField>
								<TextField isRequired variant="secondary">
									<Label>Description</Label>
									<TextArea
										placeholder="Describe what this tool does..."
										value={customToolDescription}
										onChange={(e) => setCustomToolDescription(e.target.value)}
									/>
									<Description>
										A clear description helps the AI understand when to use this
										tool
									</Description>
								</TextField>
								<div className="flex flex-col gap-1.5">
									<Label>
										Input Schema
										<span className="text-danger ml-0.5">*</span>
									</Label>
									<div
										className={cn(
											"h-96 overflow-hidden border border-[var(--color-field-border)] bg-[var(--color-default)] transition-[background-color,border-color,box-shadow] duration-150",
											"rounded-[var(--field-radius,calc(var(--radius)*1.5))]",
											"focus-within:ring-2 focus-within:ring-[var(--focus)]",
											inputSchemaError &&
												"border-danger focus-within:ring-danger",
											// Match Monaco's editor bg to HeroUI's secondary-input bg.
											"[&_.monaco-editor]:!bg-[var(--color-default)]",
											"[&_.monaco-editor_.overflow-guard]:!bg-[var(--color-default)]",
											"[&_.monaco-editor_.monaco-editor-background]:!bg-[var(--color-default)]",
											"[&_.monaco-editor_.margin]:!bg-[var(--color-default)]",
										)}
									>
										<MonacoJsonEditor
											value={customToolInputSchema}
											onValueChange={(val) => {
												setCustomToolInputSchema(val);
												if (val.trim()) {
													try {
														JSON.parse(val);
														setInputSchemaError(null);
													} catch {
														setInputSchemaError("Invalid JSON format");
													}
												} else {
													setInputSchemaError(null);
												}
											}}
											fillHeight
										/>
									</div>
									<p
										className={cn(
											"ml-1 text-xs text-muted",
											inputSchemaError && "text-danger",
										)}
									>
										{inputSchemaError ??
											"Define the parameters this tool accepts using JSON Schema format."}
									</p>
								</div>
							</Drawer.Body>
							<Drawer.Footer>
								<Button
									variant="tertiary"
									onPress={() => {
										setCustomToolTitle("");
										setCustomToolDescription("");
										setCustomToolInputSchema("");
										setInputSchemaError(null);
										setEditingCustomTool(null);
										customToolModalState.close();
									}}
								>
									Cancel
								</Button>
								<Button variant="primary" onPress={handleSaveCustomTool}>
									{editingCustomTool ? "Save Changes" : "Add Tool"}
								</Button>
							</Drawer.Footer>
						</Drawer.Dialog>
					</Drawer.Content>
				</Drawer.Backdrop>
			</Drawer>

			{/* Agent Tool Modal */}
			<Drawer state={agentToolModalState}>
				<Drawer.Backdrop>
					<Drawer.Content placement="right">
						<Drawer.Dialog style={{ width: 540, maxWidth: "85vw" }}>
							<Drawer.CloseTrigger />
							<Drawer.Header>
								<Drawer.Heading>
									{editingAgentTool ? "Edit Agent Tool" : "Add Agent Tool"}
								</Drawer.Heading>
							</Drawer.Header>
							<Drawer.Body className="space-y-4">
								<div className="flex flex-col gap-1.5">
									<Label>
										Agent
										<span className="text-danger ml-0.5">*</span>
									</Label>
									<Select
										aria-label="Agent"
										variant="secondary"
										placeholder="Select an agent"
										value={agentToolAgentId}
										// Editing keeps the original agent fixed — change it by
										// removing and re-adding, so the tool name stays meaningful.
										isDisabled={editingAgentTool !== null}
										onChange={(key) => {
											const id = (key as string | null) ?? null;
											setAgentToolAgentId(id);
											// Re-derive the tool name from the selected agent each time
											// the agent changes.
											if (id) {
												const agent = selectableAgents.find((a) => a.id === id);
												if (agent)
													setAgentToolName(slugifyToolName(agent.name));
											}
										}}
									>
										<Select.Trigger className="flex items-center gap-2">
											<Select.Value />
											<Select.Indicator />
										</Select.Trigger>
										<Select.Popover>
											<ListBox>
												{selectableAgents.map((a) => (
													<ListBox.Item key={a.id} id={a.id} textValue={a.name}>
														{a.name}
														<ListBox.ItemIndicator />
													</ListBox.Item>
												))}
											</ListBox>
										</Select.Popover>
									</Select>
								</div>
								<TextField isRequired variant="secondary">
									<Label>Tool Name</Label>
									<Input
										placeholder="e.g., research_assistant"
										value={agentToolName}
										onChange={(e) => setAgentToolName(e.target.value)}
									/>
									<Description>
										The name the calling agent sees (letters, numbers,
										underscores, hyphens).
									</Description>
								</TextField>
								<TextField isRequired variant="secondary">
									<Label>Description</Label>
									<TextArea
										placeholder="Describe when the calling agent should use this agent..."
										value={agentToolDescription}
										onChange={(e) => setAgentToolDescription(e.target.value)}
									/>
									<Description>
										A clear description helps the calling agent decide when to
										invoke this agent.
									</Description>
								</TextField>
							</Drawer.Body>
							<Drawer.Footer>
								<Button
									variant="tertiary"
									onPress={() => {
										resetAgentToolForm();
										agentToolModalState.close();
									}}
								>
									Cancel
								</Button>
								<Button variant="primary" onPress={handleSaveAgentTool}>
									{editingAgentTool ? "Save Changes" : "Add Tool"}
								</Button>
							</Drawer.Footer>
						</Drawer.Dialog>
					</Drawer.Content>
				</Drawer.Backdrop>
			</Drawer>
		</>
	);
}
