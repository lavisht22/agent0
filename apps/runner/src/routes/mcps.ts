import type { Json } from "@repo/database";
import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import { requireScope, requireUserId } from "../lib/scopes.js";
import { fetchToolsForEnv, type Environment, type ToolsByEnv } from "./refresh-mcp.js";

const McpSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		tools: { type: "object" as const, additionalProperties: true, nullable: true },
		custom_headers: { type: "object" as const, additionalProperties: true, nullable: true },
		has_staging_config: { type: "boolean" as const },
		created_at: { type: "string" as const, format: "date-time" },
		updated_at: { type: "string" as const, format: "date-time" },
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerMcpsRoutes(fastify: FastifyInstance) {
	fastify.get("/mcps", {
		preHandler: requireScope("mcps:read:*"),
		schema: {
			tags: ["MCPs"],
			summary: "List MCP servers",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: McpSchema },
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };

			const { data, error } = await supabase
				.from("mcps")
				.select("id, name, tools, custom_headers, created_at, updated_at, encrypted_data_staging")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch MCPs" });
			}

			const result = data.map(({ encrypted_data_staging, ...rest }) => ({
				...rest,
				has_staging_config: !!encrypted_data_staging,
			}));

			return reply.send({ data: result });
		},
	});

	fastify.post("/mcps/:mcpId/refresh", {
		preHandler: requireUserId,
		schema: {
			tags: ["MCPs"],
			summary: "Refresh tools for an MCP server",
			params: {
				type: "object" as const,
				properties: {
					mcpId: { type: "string" as const },
				},
				required: ["mcpId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						tools: { type: "object" as const, additionalProperties: true },
						errors: {
							type: "array" as const,
							items: {
								type: "object" as const,
								properties: {
									env: { type: "string" as const },
									message: { type: "string" as const },
								},
							},
						},
					},
				},
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, mcpId } = request.params as {
				workspaceId: string;
				mcpId: string;
			};

			const { data: mcp, error: mcpError } = await supabase
				.from("mcps")
				.select("*")
				.eq("id", mcpId)
				.eq("workspace_id", workspaceId)
				.single();

			if (mcpError || !mcp) {
				return reply.code(404).send({ message: "MCP server not found" });
			}

			const envsToRefresh: { env: Environment; encrypted: string }[] = [
				{ env: "production", encrypted: mcp.encrypted_data_production as string },
			];
			if (mcp.encrypted_data_staging) {
				envsToRefresh.push({
					env: "staging",
					encrypted: mcp.encrypted_data_staging as string,
				});
			}

			const results = await Promise.allSettled(
				envsToRefresh.map(({ encrypted }) => fetchToolsForEnv(encrypted)),
			);

			const previous = (mcp.tools as ToolsByEnv | null) ?? {};
			const newTools: ToolsByEnv = { ...previous };

			const errors: { env: Environment; message: string }[] = [];
			let anySuccess = false;

			results.forEach((result, idx) => {
				const env = envsToRefresh[idx].env;
				if (result.status === "fulfilled") {
					newTools[env] = result.value;
					anySuccess = true;
				} else {
					errors.push({
						env,
						message:
							result.reason instanceof Error
								? result.reason.message
								: String(result.reason),
					});
				}
			});

			if (!mcp.encrypted_data_staging) {
				newTools.staging = null;
			}

			if (!anySuccess) {
				return reply.code(500).send({
					message: "Failed to refresh tools",
					errors,
				});
			}

			const { error: updateError } = await supabase
				.from("mcps")
				.update({
					tools: newTools as unknown as Json,
					updated_at: new Date().toISOString(),
				})
				.eq("id", mcpId);

			if (updateError) {
				return reply.code(500).send({
					message: "Failed to persist refreshed tools",
				});
			}

			return reply.code(200).send({
				tools: newTools,
				errors: errors.length > 0 ? errors : undefined,
			});
		},
	});
}
