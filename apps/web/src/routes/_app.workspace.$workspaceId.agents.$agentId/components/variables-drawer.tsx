import {
	Button,
	Drawer,
	Input,
	Label,
	Separator,
	TextArea,
	TextField,
} from "@heroui/react";
import { LucidePlay, LucidePlus, LucideTrash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useState } from "react";
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
	mcps?: MCP[];
	tools?: ToolValue[];
	mcpHeaderValues: Record<string, Record<string, string>>;
	onMcpHeaderValuesChange: (
		values: Record<string, Record<string, string>>,
	) => void;
	metadataValues: Record<string, string>;
	onMetadataValuesChange: (values: Record<string, string>) => void;
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
	metadataValues,
	onMetadataValuesChange,
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

	const mcpHeaders = useMemo(() => {
		if (!mcps || !tools) return [];

		const usedMcpIds = new Set<string>();
		for (const tool of tools) {
			if (tool.mcp_id) {
				usedMcpIds.add(tool.mcp_id);
			}
		}

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

	// Metadata is edited as an ordered list of rows so blank/duplicate keys don't
	// collide mid-typing (an object would drop them). We seed from the persisted
	// object each time the drawer opens and push a normalized object back up —
	// only rows with a non-empty key are stored.
	const [metaRows, setMetaRows] = useState<
		{ id: string; key: string; value: string }[]
	>([]);

	// Re-seed only on open; ignore live prop changes so typing isn't clobbered.
	// biome-ignore lint/correctness/useExhaustiveDependencies: seed on open only
	useEffect(() => {
		if (isOpen) {
			setMetaRows(
				Object.entries(metadataValues).map(([key, value]) => ({
					id: nanoid(),
					key,
					value,
				})),
			);
		}
	}, [isOpen]);

	const commitMetaRows = (
		rows: { id: string; key: string; value: string }[],
	) => {
		setMetaRows(rows);
		const obj: Record<string, string> = {};
		for (const row of rows) {
			const key = row.key.trim();
			if (key) obj[key] = row.value;
		}
		onMetadataValuesChange(obj);
	};

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
								{variables.length === 0 && mcpHeaders.length === 0 && (
									<p className="text-muted text-sm">
										No variables or MCP headers found.
									</p>
								)}

								{variables.map((variable) => (
									<TextField key={variable} name={variable} variant="secondary">
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

								{/* MCP Headers Section */}
								{mcpHeaders.length > 0 && (
									<>
										{variables.length > 0 && <Separator />}
										<p className="text-sm font-medium text-foreground">
											MCP Headers
										</p>
										{mcpHeaders.map((mcp) => (
											<div key={mcp.id} className="flex flex-col gap-3">
												<p className="text-xs text-muted">{mcp.name}</p>
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
															variant="secondary"
														/>
													</TextField>
												))}
											</div>
										))}
									</>
								)}

								{/* Metadata Section */}
								{(variables.length > 0 || mcpHeaders.length > 0) && (
									<Separator />
								)}
								<div className="flex items-center justify-between">
									<p className="text-sm font-medium text-foreground">
										Metadata
									</p>
									<Button
										size="sm"
										variant="tertiary"
										onPress={() =>
											commitMetaRows([
												...metaRows,
												{ id: nanoid(), key: "", value: "" },
											])
										}
									>
										<LucidePlus className="size-3.5" />
										Add
									</Button>
								</div>
								<p className="-mt-2 text-xs text-muted">
									Arbitrary key-value labels stored on the run for filtering.
									Max 10 keys; each under 128 characters.
								</p>
								{metaRows.map((row, index) => (
									<div key={row.id} className="flex items-center gap-2">
										<Input
											variant="secondary"
											aria-label="Metadata key"
											placeholder="key"
											className="min-w-0 flex-1"
											value={row.key}
											onChange={(e) => {
												const next = [...metaRows];
												next[index] = { ...row, key: e.target.value };
												commitMetaRows(next);
											}}
										/>
										<Input
											variant="secondary"
											aria-label="Metadata value"
											placeholder="value"
											className="min-w-0 flex-1"
											value={row.value}
											onChange={(e) => {
												const next = [...metaRows];
												next[index] = { ...row, value: e.target.value };
												commitMetaRows(next);
											}}
										/>
										<Button
											isIconOnly
											variant="tertiary"
											aria-label="Remove metadata row"
											className="shrink-0"
											onPress={() =>
												commitMetaRows(metaRows.filter((r) => r.id !== row.id))
											}
										>
											<LucideTrash2 className="size-4" />
										</Button>
									</div>
								))}
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
