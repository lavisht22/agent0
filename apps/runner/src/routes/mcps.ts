import { mcps } from "@repo/database";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { encryptSecret } from "../lib/crypto.js";
import { db } from "../lib/pg.js";
import { requireScope, requireUserId } from "../lib/scopes.js";
import {
	type Environment,
	fetchToolsForEnv,
	type ToolsByEnv,
} from "./refresh-mcp.js";

// MCP config arrives as plaintext over TLS; the runner encrypts it (AES-256-GCM,
// lib/crypto.ts) before persisting and only decrypts on the run path. `tools` is
// populated separately by the refresh endpoint below, never on create/update.
// `encrypted_data_production` is never selected (write-only).
const mcpColumns = {
	id: mcps.id,
	name: mcps.name,
	tools: mcps.tools,
	custom_headers: mcps.custom_headers,
	created_at: mcps.created_at,
	updated_at: mcps.updated_at,
	encrypted_data_staging: mcps.encrypted_data_staging,
};

function toMcp(row: {
	id: string;
	name: string;
	tools: unknown;
	custom_headers: string;
	created_at: string;
	updated_at: string;
	encrypted_data_staging: unknown;
}) {
	const { encrypted_data_staging, created_at, updated_at, ...rest } = row;
	return {
		...rest,
		created_at: new Date(created_at).toISOString(),
		updated_at: new Date(updated_at).toISOString(),
		has_staging_config: !!encrypted_data_staging,
	};
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

			try {
				const data = await db
					.select(mcpColumns)
					.from(mcps)
					.where(eq(mcps.workspace_id, workspaceId))
					.orderBy(desc(mcps.created_at));

				return reply.send({ data: data.map(toMcp) });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch MCPs" });
			}
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
					data_production: { type: "string" as const, minLength: 1 },
					data_staging: {
						type: "string" as const,
						minLength: 1,
						nullable: true,
					},
					custom_headers: { type: "string" as const },
				},
				required: ["name", "data_production"],
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
			const { name, data_production, data_staging, custom_headers } =
				request.body as {
					name: string;
					data_production: string;
					data_staging?: string | null;
					custom_headers?: string;
				};

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			try {
				const [data] = await db
					.insert(mcps)
					.values({
						id: nanoid(),
						workspace_id: workspaceId,
						name: trimmedName,
						encrypted_data_production: encryptSecret(data_production),
						encrypted_data_staging:
							data_staging != null ? encryptSecret(data_staging) : null,
						custom_headers: custom_headers?.trim() ?? "",
					})
					.returning(mcpColumns);

				if (!data) {
					return reply
						.code(500)
						.send({ message: "Failed to create MCP server" });
				}

				return reply.code(201).send({ data: toMcp(data) });
			} catch {
				return reply.code(500).send({ message: "Failed to create MCP server" });
			}
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
					data_production: { type: "string" as const, minLength: 1 },
					// null clears the staging override; omitting leaves it untouched.
					data_staging: {
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
				data_production?: string;
				data_staging?: string | null;
				custom_headers?: string;
			};

			const updates: Partial<typeof mcps.$inferInsert> = {};
			if (body.name !== undefined) {
				const trimmedName = body.name.trim();
				if (trimmedName.length === 0) {
					return reply.code(400).send({ message: "name must not be empty" });
				}
				updates.name = trimmedName;
			}
			if (body.data_production !== undefined) {
				updates.encrypted_data_production = encryptSecret(body.data_production);
			}
			if (body.data_staging !== undefined) {
				updates.encrypted_data_staging =
					body.data_staging === null ? null : encryptSecret(body.data_staging);
			}
			if (body.custom_headers !== undefined) {
				updates.custom_headers = body.custom_headers.trim();
			}

			if (Object.keys(updates).length === 0) {
				return reply.code(400).send({ message: "No updates provided" });
			}
			updates.updated_at = new Date().toISOString();

			try {
				const [data] = await db
					.update(mcps)
					.set(updates)
					.where(and(eq(mcps.id, mcpId), eq(mcps.workspace_id, workspaceId)))
					.returning(mcpColumns);

				if (!data) {
					return reply.code(404).send({ message: "MCP server not found" });
				}

				return reply.send({ data: toMcp(data) });
			} catch {
				return reply.code(500).send({ message: "Failed to update MCP server" });
			}
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

			try {
				const deleted = await db
					.delete(mcps)
					.where(and(eq(mcps.id, mcpId), eq(mcps.workspace_id, workspaceId)))
					.returning({ id: mcps.id });

				if (deleted.length === 0) {
					return reply.code(404).send({ message: "MCP server not found" });
				}

				return reply.send({ success: true });
			} catch {
				return reply.code(500).send({ message: "Failed to delete MCP server" });
			}
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

			const [mcp] = await db
				.select({
					encrypted_data_production: mcps.encrypted_data_production,
					encrypted_data_staging: mcps.encrypted_data_staging,
					tools: mcps.tools,
				})
				.from(mcps)
				.where(and(eq(mcps.id, mcpId), eq(mcps.workspace_id, workspaceId)))
				.limit(1);

			if (!mcp) {
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

			try {
				await db
					.update(mcps)
					.set({
						tools: newTools,
						updated_at: new Date().toISOString(),
					})
					.where(eq(mcps.id, mcpId));
			} catch {
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
