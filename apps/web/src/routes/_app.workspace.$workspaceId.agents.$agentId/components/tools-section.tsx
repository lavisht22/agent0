import {
	addToast,
	Button,
	Card,
	CardBody,
	CardHeader,
	Chip,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
	Input,
	Listbox,
	ListboxItem,
	ListboxSection,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	Textarea,
	useDisclosure,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import {
	LucidePlus,
	LucideSearch,
	LucideServer,
	LucideWrench,
} from "lucide-react";
import { useState } from "react";
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
	const {
		isOpen: isCustomToolModalOpen,
		onOpen: onOpenCustomToolModal,
		onClose: onCloseCustomToolModal,
	} = useDisclosure();

	// Modal state for MCP tool selection
	const {
		isOpen: isMCPToolModalOpen,
		onOpen: onOpenMCPToolModal,
		onClose: onCloseMCPToolModal,
	} = useDisclosure();

	// Search filter for MCP tools
	const [mcpToolSearch, setMcpToolSearch] = useState("");

	// Custom tool form state
	const [customToolTitle, setCustomToolTitle] = useState("");
	const [customToolDescription, setCustomToolDescription] = useState("");
	const [customToolInputSchema, setCustomToolInputSchema] = useState("");
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
		onOpenCustomToolModal();
	};

	const handleSaveCustomTool = () => {
		if (!customToolTitle.trim()) {
			addToast({
				title: "Tool title is required.",
				color: "danger",
			});
			return;
		}

		if (!customToolDescription.trim()) {
			addToast({
				title: "Tool description is required.",
				color: "danger",
			});
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
					addToast({
						title: "Input schema must be a valid JSON object.",
						color: "danger",
					});
					return;
				}
			} catch {
				addToast({
					title: "Invalid JSON in input schema.",
					color: "danger",
				});
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
			addToast({
				title: "A custom tool with this title already exists.",
				color: "danger",
			});
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
		onCloseCustomToolModal();
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
				<CardHeader className="flex items-center justify-between pl-3 pr-1 h-10">
					<span className="text-sm text-default-500">Tools</span>
					<Dropdown placement="bottom-end">
						<DropdownTrigger>
							<Button size="sm" variant="light" isIconOnly>
								<LucidePlus className="size-3.5" />
							</Button>
						</DropdownTrigger>
						<DropdownMenu>
							<DropdownItem
								key="mcp"
								startContent={<LucideServer className="size-4" />}
								description="Add a tool from an MCP server"
								isDisabled={!hasMCPs || availableMCPTools.length === 0}
								onPress={onOpenMCPToolModal}
							>
								From MCP Server
							</DropdownItem>
							<DropdownItem
								key="custom"
								startContent={<LucideWrench className="size-4" />}
								description="Define a custom tool"
								onPress={onOpenCustomToolModal}
							>
								Custom Tool
							</DropdownItem>
						</DropdownMenu>
					</Dropdown>
				</CardHeader>
				<CardBody className="p-3 border-t border-default-200">
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
										variant="flat"
										onClose={() => handleRemoveTool(tool)}
									>
										<span>{mcpTool.name}</span>
										<span className="text-default-400 ml-1 text-xs">
											{getMcpName(mcpTool.mcp_id)}
										</span>
									</Chip>
								);
							})}
							{/* Custom Tools */}
							{customTools.map((tool) => (
								<Chip
									key={`custom-${tool.title}`}
									variant="flat"
									onClose={() => handleRemoveTool(tool)}
									className="cursor-pointer"
									onClick={() => handleEditCustomTool(tool)}
								>
									<span>{tool.title}</span>
									<span className="text-default-400 ml-1 text-xs">Custom</span>
								</Chip>
							))}
						</div>
					)}
				</CardBody>
			</Card>

			{/* MCP Tools Modal */}
			<Modal
				isOpen={isMCPToolModalOpen}
				onClose={() => {
					onCloseMCPToolModal();
					setMcpToolSearch("");
				}}
				size="xl"
				scrollBehavior="inside"
			>
				<ModalContent>
					<ModalHeader>Add MCP Tool</ModalHeader>
					<ModalBody className="pb-6 pt-0">
						<div className="sticky top-0 z-30 pb-2 bg-background">
							<Input
								placeholder="Search tools..."
								value={mcpToolSearch}
								onValueChange={setMcpToolSearch}
								startContent={<LucideSearch className="size-4" />}
								isClearable
								onClear={() => setMcpToolSearch("")}
							/>
						</div>

						<Listbox variant="flat">
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
												tool.description?.toLowerCase().includes(searchLower) ||
												mcp.name.toLowerCase().includes(searchLower)
											);
										}

										return true;
									});

									if (!availableMcpTools || availableMcpTools.length === 0) {
										return null;
									}

									return (
										<ListboxSection key={mcp.id} title={mcp.name} showDivider>
											{availableMcpTools?.map((tool) => (
												<ListboxItem
													key={mcp.id + tool.name}
													onPress={() => {
														handleAddMCPTool(mcp.id, tool.name);
													}}
													title={tool.name}
													description={tool.description}
												/>
											))}
										</ListboxSection>
									);
								})}
							</>
						</Listbox>

						{availableMCPTools.length === 0 && (
							<p className="text-sm text-default-400 text-center py-4">
								No available MCP tools. All tools have been added or no MCP
								servers are configured.
							</p>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>

			{/* Custom Tool Modal */}
			<Modal
				isOpen={isCustomToolModalOpen}
				onClose={() => {
					setCustomToolTitle("");
					setCustomToolDescription("");
					setCustomToolInputSchema("");
					setInputSchemaError(null);
					setEditingCustomTool(null);
					onCloseCustomToolModal();
				}}
				size="xl"
			>
				<ModalContent>
					<ModalHeader>
						{editingCustomTool ? "Edit Custom Tool" : "Add Custom Tool"}
					</ModalHeader>
					<ModalBody className="space-y-4">
						<Input
							label="Tool Title"
							placeholder="e.g., get_weather"
							value={customToolTitle}
							onValueChange={setCustomToolTitle}
							description="A unique identifier for the tool (lowercase with underscores recommended)"
							isRequired
						/>
						<Textarea
							label="Description"
							placeholder="Describe what this tool does..."
							value={customToolDescription}
							onValueChange={setCustomToolDescription}
							description="A clear description helps the AI understand when to use this tool"
							isRequired
						/>
						<Textarea
							label="Input Schema (JSON)"
							placeholder='{"type": "object", "properties": {...}}'
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
							description="Define the parameters this tool accepts using JSON Schema format. Leave empty for no parameters."
							isInvalid={!!inputSchemaError}
							errorMessage={inputSchemaError}
							minRows={4}
							classNames={{
								input: "font-mono text-sm",
							}}
						/>
					</ModalBody>
					<ModalFooter>
						<Button
							variant="flat"
							onPress={() => {
								setCustomToolTitle("");
								setCustomToolDescription("");
								setCustomToolInputSchema("");
								setInputSchemaError(null);
								setEditingCustomTool(null);
								onCloseCustomToolModal();
							}}
						>
							Cancel
						</Button>
						<Button color="primary" onPress={handleSaveCustomTool}>
							{editingCustomTool ? "Save Changes" : "Add Tool"}
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	);
}
