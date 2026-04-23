import {
	Button,
	Card,
	Chip,
	CloseButton,
	Description,
	Dropdown,
	Header,
	Input,
	InputGroup,
	Label,
	ListBox,
	Modal,
	Separator,
	TextArea,
	TextField,
	toast,
	useOverlayState,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import {
	LucidePlus,
	LucideSearch,
	LucideServer,
	LucideWrench,
} from "lucide-react";
import { useState } from "react";
import { MonacoJsonField } from "@/components/monaco-json-field";
import { mcpsQuery } from "@/lib/queries";
import type { CustomTool, MCPTool } from "@/lib/types";

/**
 * Union type for all tools
 */
type ToolDefinition = MCPTool | CustomTool;

// For backward compatibility, support old format without type field
type LegacyTool = { mcp_id: string; name: string };
type ToolValue = ToolDefinition | LegacyTool;

interface ToolsSectionProps {
	workspaceId: string;
	value: ToolValue[];
	onValueChange: (value: ToolValue[]) => void;
	isInvalid?: boolean;
}

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

export default function ToolsSection({
	workspaceId,
	value,
	onValueChange,
	isInvalid,
}: ToolsSectionProps) {
	// Modal state for adding custom tool
	const customToolModalState = useOverlayState();

	// Modal state for MCP tool selection
	const mcpToolModalState = useOverlayState();

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

	// Get MCP name by id for display purposes
	const getMcpName = (mcp_id: string) => {
		const mcp = mcps?.find((m) => m.id === mcp_id);
		return mcp?.name || mcp_id;
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
			const tools = mcp?.tools as
				| { name: string; description: string }[]
				| undefined;

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

	// Separate MCP tools and custom tools from value
	const mcpTools = value.filter(isMCPTool);
	const customTools = value.filter(isCustomTool);

	return (
		<>
			<Card className={isInvalid ? "border-danger border" : ""}>
				<Card.Header className="flex items-center justify-between pl-3 pr-1 h-10">
					<span className="text-sm text-default-500">Tools</span>
					<Dropdown>
						<Button size="sm" variant="tertiary">
							<LucidePlus className="size-3.5" />
						</Button>
						<Dropdown.Popover>
							<Dropdown.Menu
								disabledKeys={
									!hasMCPs || availableMCPTools.length === 0 ? ["mcp"] : []
								}
								onAction={(key) => {
									if (key === "mcp") {
										mcpToolModalState.open();
									} else if (key === "custom") {
										customToolModalState.open();
									}
								}}
							>
								<Dropdown.Item id="mcp" textValue="From MCP Server">
									<LucideServer className="size-4" />
									<Label>From MCP Server</Label>
									<Description>Add a tool from an MCP server</Description>
								</Dropdown.Item>
								<Dropdown.Item id="custom" textValue="Custom Tool">
									<LucideWrench className="size-4" />
									<Label>Custom Tool</Label>
									<Description>Define a custom tool</Description>
								</Dropdown.Item>
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				</Card.Header>
				<Card.Content className="p-3 border-t border-default-200">
					{value.length === 0 ? (
						<p className="text-sm text-default-400">
							No tools added. Click "+" to add tools to your agent. (Optional)
						</p>
					) : (
						<div className="flex flex-wrap gap-2">
							{/* MCP Tools */}
							{mcpTools.map((tool) => {
								const mcpTool = tool as { mcp_id: string; name: string };
								return (
									<Chip
										key={`mcp-${mcpTool.mcp_id}-${mcpTool.name}`}
										variant="tertiary"
									>
										<span>{mcpTool.name}</span>
										<span className="text-default-400 ml-1 text-xs">
											{getMcpName(mcpTool.mcp_id)}
										</span>
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
									variant="tertiary"
									className="cursor-pointer"
									onClick={() => handleEditCustomTool(tool)}
								>
									<span>{tool.title}</span>
									<span className="text-default-400 ml-1 text-xs">Custom</span>
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
			<Modal state={mcpToolModalState}>
				<Modal.Backdrop>
					<Modal.Container size="lg" scroll="inside">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading>Add MCP Tool</Modal.Heading>
							</Modal.Header>
							<Modal.Body className="pb-6 pt-0">
								<div className="sticky top-0 z-30 pb-2 bg-background">
									<InputGroup>
										<InputGroup.Prefix>
											<LucideSearch className="size-4" />
										</InputGroup.Prefix>
										<Input
											placeholder="Search tools..."
											value={mcpToolSearch}
											onChange={(e) => setMcpToolSearch(e.target.value)}
										/>
										{mcpToolSearch && (
											<CloseButton
												aria-label="Clear search"
												onPress={() => setMcpToolSearch("")}
											/>
										)}
									</InputGroup>
								</div>

								<ListBox aria-label="Available MCP Tools">
									{/** biome-ignore lint/complexity/noUselessFragments: <heroui problem> */}
									<>
										{mcps?.map((mcp) => {
											const tools = mcp?.tools as
												| { name: string; description: string }[]
												| undefined;

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
														>
															<Label>{tool.name}</Label>
															<Description>{tool.description}</Description>
														</ListBox.Item>
													))}
													<Separator />
												</ListBox.Section>
											);
										})}
									</>
								</ListBox>

								{availableMCPTools.length === 0 && (
									<p className="text-sm text-default-400 text-center py-4">
										No available MCP tools. All tools have been added or no MCP
										servers are configured.
									</p>
								)}
							</Modal.Body>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>

			{/* Custom Tool Modal */}
			<Modal state={customToolModalState}>
				<Modal.Backdrop>
					<Modal.Container size="lg">
						<Modal.Dialog>
							<Modal.CloseTrigger />
							<Modal.Header>
								<Modal.Heading>
									{editingCustomTool ? "Edit Custom Tool" : "Add Custom Tool"}
								</Modal.Heading>
							</Modal.Header>
							<Modal.Body className="space-y-4">
								<TextField isRequired>
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
								<TextField isRequired>
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
								<MonacoJsonField
									label="Input Schema"
									isRequired
									description="Define the parameters this tool accepts using JSON Schema format."
									value={customToolInputSchema}
									onValueChange={(val) => {
										setCustomToolInputSchema(val);
										// Validate JSON on change
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
									isInvalid={!!inputSchemaError}
									errorMessage={inputSchemaError}
									editorMinHeight={250}
								/>
							</Modal.Body>
							<Modal.Footer>
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
							</Modal.Footer>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>
		</>
	);
}
