import type { Json } from "@repo/database";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { supabase } from "../lib/db.js";
import { requireScope, requireUserId } from "../lib/scopes.js";
import {
	type Environment,
	fetchToolsForEnv,
	type ToolsByEnv,
} from "./refresh-mcp.js";

// MCP config is encrypted client-side with the PGP public key before it reaches
// the runner; these endpoints persist the opaque armored blobs as the browser
// used to write them directly (mirroring the providers CRUD). The private key
// lives only on the runner's run path, so create/update never see plaintext.
const SELECT_COLUMNS =
	"id, name, tools, custom_headers, created_at, updated_at, encrypted_data_staging";

function toMcp(row: {
	encrypted_data_staging: unknown;
	[key: string]: unknown;
}) {
	const { encrypted_data_staging, ...rest } = row;
	return { ...rest, has_staging_config: !!encrypted_data_staging };
}

const McpSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		tools: {
			type: "object" as const,
			additionalProperties: true,
			nullable: true,
		},
		// Comma-separated header names (text column), not an object.
		custom_headers: { type: "string" as const },
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
				.select(SELECT_COLUMNS)
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch MCPs" });
			}

			return reply.send({ data: data.map(toMcp) });
		},
	});

	fastify.post("/mcps", {
		preHandler: [requireScope("mcps:write:*"), requireUserId],
		schema: {
			tags: ["MCPs"],
			summary: "Create an MCP server",
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
					encrypted_data_production: { type: "string" as const, minLength: 1 },
					encrypted_data_staging: {
						type: "string" as const,
						minLength: 1,
						nullable: true,
					},
					custom_headers: { type: "string" as const },
				},
				required: ["name", "encrypted_data_production"],
				additionalProperties: false,
			},
			response: {
				201: {
					type: "object" as const,
					properties: { data: McpSchema },
				},
				400: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const {
				name,
				encrypted_data_production,
				encrypted_data_staging,
				custom_headers,
			} = request.body as {
				name: string;
				encrypted_data_production: string;
				encrypted_data_staging?: string | null;
				custom_headers?: string;
			};

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			const { data, error } = await supabase
				.from("mcps")
				.insert({
					id: nanoid(),
					workspace_id: workspaceId,
					name: trimmedName,
					encrypted_data_production,
					encrypted_data_staging: encrypted_data_staging ?? null,
					custom_headers: custom_headers?.trim() ?? "",
				})
				.select(SELECT_COLUMNS)
				.single();

			if (error || !data) {
				return reply.code(500).send({ message: "Failed to create MCP server" });
			}

			return reply.code(201).send({ data: toMcp(data) });
		},
	});

	fastify.patch("/mcps/:mcpId", {
		preHandler: [requireScope("mcps:write:*"), requireUserId],
		schema: {
			tags: ["MCPs"],
			summary: "Update an MCP server",
			params: {
				type: "object" as const,
				properties: { mcpId: { type: "string" as const } },
				required: ["mcpId"],
			},
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
					encrypted_data_production: { type: "string" as const, minLength: 1 },
					// null clears the staging override; omitting leaves it untouched.
					encrypted_data_staging: {
						type: "string" as const,
						minLength: 1,
						nullable: true,
					},
					custom_headers: { type: "string" as const },
				},
				additionalProperties: false,
			},
			response: {
				200: {
					type: "object" as const,
					properties: { data: McpSchema },
				},
				400: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, mcpId } = request.params as {
				workspaceId: string;
				mcpId: string;
			};
			const body = request.body as {
				name?: string;
				encrypted_data_production?: string;
				encrypted_data_staging?: string | null;
				custom_headers?: string;
			};

			const updates: Record<string, unknown> = {};
			if (body.name !== undefined) {
				const trimmedName = body.name.trim();
				if (trimmedName.length === 0) {
					return reply.code(400).send({ message: "name must not be empty" });
				}
				updates.name = trimmedName;
			}
			if (body.encrypted_data_production !== undefined) {
				updates.encrypted_data_production = body.encrypted_data_production;
			}
			if (body.encrypted_data_staging !== undefined) {
				updates.encrypted_data_staging = body.encrypted_data_staging;
			}
			if (body.custom_headers !== undefined) {
				updates.custom_headers = body.custom_headers.trim();
			}

			if (Object.keys(updates).length === 0) {
				return reply.code(400).send({ message: "No updates provided" });
			}
			updates.updated_at = new Date().toISOString();

			const { data, error } = await supabase
				.from("mcps")
				.update(updates)
				.eq("id", mcpId)
				.eq("workspace_id", workspaceId)
				.select(SELECT_COLUMNS)
				.maybeSingle();

			if (error) {
				return reply.code(500).send({ message: "Failed to update MCP server" });
			}
			if (!data) {
				return reply.code(404).send({ message: "MCP server not found" });
			}

			return reply.send({ data: toMcp(data) });
		},
	});

	fastify.delete("/mcps/:mcpId", {
		preHandler: [requireScope("mcps:write:*"), requireUserId],
		schema: {
			tags: ["MCPs"],
			summary: "Delete an MCP server",
			params: {
				type: "object" as const,
				properties: { mcpId: { type: "string" as const } },
				required: ["mcpId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: { success: { type: "boolean" as const } },
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

			const { error, count } = await supabase
				.from("mcps")
				.delete({ count: "exact" })
				.eq("id", mcpId)
				.eq("workspace_id", workspaceId);

			if (error) {
				return reply.code(500).send({ message: "Failed to delete MCP server" });
			}
			if (count === 0) {
				return reply.code(404).send({ message: "MCP server not found" });
			}

			return reply.send({ success: true });
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
				{
					env: "production",
					encrypted: mcp.encrypted_data_production as string,
				},
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
