import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { mcps, workspaceUser } from "@repo/database";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { toWebHeaders } from "../lib/auth/headers.js";
import { auth } from "../lib/auth/index.js";
import { decryptSecret } from "../lib/crypto.js";
import { db } from "../lib/pg.js";
import type { MCPConfig } from "../lib/types.js";

export type Environment = "production" | "staging";
export type ToolEntry = { name: string; description: string | undefined };
export type ToolsByEnv = {
	production?: ToolEntry[];
	staging?: ToolEntry[] | null;
};

export async function fetchToolsForEnv(
	encrypted: string,
): Promise<ToolEntry[]> {
	const decrypted = decryptSecret(encrypted);
	const config: MCPConfig = JSON.parse(decrypted);

	const client = await createMCPClient(config);
	try {
		const tools = await client.tools();
		return Object.entries(tools).map(([name, tool]) => ({
			name,
			description: tool.description,
		}));
	} finally {
		await client.close();
	}
}

export async function registerRefreshMCPRoute(fastify: FastifyInstance) {
	fastify.post("/internal/refresh-mcp", async (request, reply) => {
		// Registered outside `addAuth`, so it validates the session inline.
		const session = await auth.api.getSession({
			headers: toWebHeaders(request.headers),
		});

		if (!session) {
			return reply.code(401).send({ message: "Invalid token" });
		}

		const userId = session.user.id;

		const { mcp_id } = request.body as { mcp_id: string };

		if (!mcp_id) {
			return reply.code(400).send({ message: "mcp_id is required" });
		}

		const [mcp] = await db
			.select({
				workspace_id: mcps.workspace_id,
				encrypted_data_production: mcps.encrypted_data_production,
				encrypted_data_staging: mcps.encrypted_data_staging,
				tools: mcps.tools,
			})
			.from(mcps)
			.where(eq(mcps.id, mcp_id))
			.limit(1);

		if (!mcp) {
			return reply.code(404).send({ message: "MCP server not found" });
		}

		const [membership] = await db
			.select({ user_id: workspaceUser.user_id })
			.from(workspaceUser)
			.where(
				and(
					eq(workspaceUser.workspace_id, mcp.workspace_id),
					eq(workspaceUser.user_id, userId),
				),
			)
			.limit(1);

		if (!membership) {
			return reply.code(403).send({ message: "Access denied" });
		}

		// Production config always exists; staging only with per-env config enabled.
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

		// Start from existing tools so a per-env failure preserves that env's list.
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

		// No staging config — drop its tools entry so the UI shows no stale list.
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
				.where(eq(mcps.id, mcp_id));
		} catch (updateError) {
			return reply.code(500).send({
				message: "Failed to persist refreshed tools",
				error:
					updateError instanceof Error ? updateError.message : "Unknown error",
			});
		}

		return reply.code(200).send({
			tools: newTools,
			errors: errors.length > 0 ? errors : undefined,
		});
	});
}
