import {
	Button,
	Drawer,
	Input,
	Label,
	Separator,
	TextArea,
	TextField,
} from "@heroui/react";
import { LucidePlay } from "lucide-react";
import { useMemo } from "react";
import type { MessageT } from "@/components/messages";

type MCP = {
	id: string;
	name: string;
	custom_headers: string | null;
};

type ToolValue = { mcp_id?: string; [key: string]: unknown };

interface VariablesDrawerProps {
	isOpen: boolean;
	onOpenChange: () => void;
	messages: MessageT[];
	values: Record<string, string>;
	onValuesChange: (values: Record<string, string>) => void;
	onRun?: () => void;
	// MCP custom headers
	mcps?: MCP[];
	tools?: ToolValue[];
	mcpHeaderValues: Record<string, Record<string, string>>;
	onMcpHeaderValuesChange: (
		values: Record<string, Record<string, string>>,
	) => void;
}

export function VariablesDrawer({
	isOpen,
	onOpenChange,
	messages,
	values,
	onValuesChange,
	onRun,
	mcps,
	tools,
	mcpHeaderValues,
	onMcpHeaderValuesChange,
}: VariablesDrawerProps) {
	const variables = useMemo(() => {
		const vars = new Set<string>();

		const extract = (text: string) => {
			const matches = text.matchAll(/\{\{(.*?)\}\}/g);
			for (const m of matches) {
				vars.add(m[1].trim());
			}
		};

		for (const msg of messages) {
			if (msg.role === "system") {
				extract(msg.content);
			} else if (msg.role === "user" || msg.role === "assistant") {
				for (const part of msg.content) {
					if (part.type === "text") {
						extract(part.text);
					}
				}
			}
		}

		return Array.from(vars);
	}, [messages]);

	// Derive which MCPs are in use and have custom_headers defined
	const mcpHeaders = useMemo(() => {
		if (!mcps || !tools) return [];

		// Get unique MCP IDs from the agent's tools
		const usedMcpIds = new Set<string>();
		for (const tool of tools) {
			if (tool.mcp_id) {
				usedMcpIds.add(tool.mcp_id);
			}
		}

		// For each used MCP with custom_headers, parse the comma-separated list
		return mcps
			.filter((mcp) => usedMcpIds.has(mcp.id) && mcp.custom_headers)
			.map((mcp) => ({
				id: mcp.id,
				name: mcp.name,
				headers: (mcp.custom_headers as string)
					.split(",")
					.map((h) => h.trim())
					.filter(Boolean),
			}))
			.filter((mcp) => mcp.headers.length > 0);
	}, [mcps, tools]);

	return (
		<Drawer>
			<Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
				<Drawer.Content placement="right">
					<Drawer.Dialog>
						<Drawer.CloseTrigger />
						<Drawer.Header>
							<Drawer.Heading>Variables & Headers</Drawer.Heading>
						</Drawer.Header>
						<Drawer.Body>
							<div className="flex flex-col gap-4">
								{/* Prompt Variables Section */}
								{variables.length === 0 && mcpHeaders.length === 0 && (
									<p className="text-default-500 text-sm">
										No variables or MCP headers found.
									</p>
								)}

								{variables.length > 0 && (
									<>
										{mcpHeaders.length > 0 && (
											<p className="text-sm font-medium text-default-700">
												Variables
											</p>
										)}
										{variables.map((variable) => (
											<TextField key={variable} name={variable}>
												<Label>{variable}</Label>
												<TextArea
													placeholder={`Value for ${variable}`}
													value={values[variable] || ""}
													onChange={(e) =>
														onValuesChange({
															...values,
															[variable]: e.target.value,
														})
													}
												/>
											</TextField>
										))}
									</>
								)}

								{/* MCP Headers Section */}
								{mcpHeaders.length > 0 && (
									<>
										{variables.length > 0 && <Separator />}
										<p className="text-sm font-medium text-default-700">
											MCP Headers
										</p>
										{mcpHeaders.map((mcp) => (
											<div key={mcp.id} className="flex flex-col gap-3">
												<p className="text-xs text-default-500">{mcp.name}</p>
												{mcp.headers.map((header) => (
													<TextField key={`${mcp.id}-${header}`} name={header}>
														<Label>{header}</Label>
														<Input
															placeholder={`Value for ${header}`}
															value={mcpHeaderValues[mcp.id]?.[header] || ""}
															onChange={(e) =>
																onMcpHeaderValuesChange({
																	...mcpHeaderValues,
																	[mcp.id]: {
																		...mcpHeaderValues[mcp.id],
																		[header]: e.target.value,
																	},
																})
															}
														/>
													</TextField>
												))}
											</div>
										))}
									</>
								)}
							</div>
						</Drawer.Body>
						{onRun && (
							<Drawer.Footer>
								<Button
									variant="primary"
									className="w-full"
									onPress={() => {
										onOpenChange();
										onRun();
									}}
								>
									<LucidePlay className="size-4" />
									Run
								</Button>
							</Drawer.Footer>
						)}
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	);
}
