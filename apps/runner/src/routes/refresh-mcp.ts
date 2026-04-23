import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import type { Json } from '@repo/database';
import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/db.js';
import { decryptMessage } from '../lib/openpgp.js';
import type { MCPConfig } from '../lib/types.js';

type Environment = "production" | "staging";
type ToolEntry = { name: string; description: string | undefined };
type ToolsByEnv = { production?: ToolEntry[]; staging?: ToolEntry[] | null };

async function fetchToolsForEnv(encrypted: string): Promise<ToolEntry[]> {
    const decrypted = await decryptMessage(encrypted);
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
    fastify.post('/internal/refresh-mcp', async (request, reply) => {
        // Extract and validate JWT token from Authorization header
        const token = request.headers.authorization?.split('Bearer ')[1];

        if (!token) {
            return reply.code(401).send({ message: 'No token provided' });
        }

        // Validate the token with Supabase
        const { data: claims, error: userError } = await supabase.auth.getClaims(token);

        if (userError) {
            return reply.code(401).send({ message: 'Invalid token' });
        }

        if (!claims) {
            return reply.code(401).send({ message: 'Failed to get claims' });
        }

        const { mcp_id } = request.body as { mcp_id: string };

        if (!mcp_id) {
            return reply.code(400).send({ message: 'mcp_id is required' });
        }

        // Get the MCP server and check workspace access
        const { data: mcp, error: mcpError } = await supabase
            .from("mcps")
            .select("*, workspaces(workspace_user(user_id, role))")
            .eq("id", mcp_id)
            .eq("workspaces.workspace_user.user_id", claims.claims.sub)
            .single();

        if (mcpError || !mcp) {
            return reply.code(404).send({ message: 'MCP server not found' });
        }

        if (mcp.workspaces.workspace_user.length === 0) {
            return reply.code(403).send({ message: 'Access denied' });
        }

        // Refresh every environment that has a config. Production always exists;
        // staging only when the user has enabled per-env config.
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

        // Start from existing tools so a per-env failure preserves the prior
        // tools list for that env instead of wiping it.
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

        // Staging config was removed — drop the staging tools entry so it
        // doesn't show up in the UI as a stale list.
        if (!mcp.encrypted_data_staging) {
            newTools.staging = null;
        }

        if (!anySuccess) {
            return reply.code(500).send({
                message: 'Failed to refresh tools',
                errors,
            });
        }

        const { error: updateError } = await supabase
            .from("mcps")
            .update({
                tools: newTools as unknown as Json,
                updated_at: new Date().toISOString(),
            })
            .eq("id", mcp_id);

        if (updateError) {
            return reply.code(500).send({
                message: 'Failed to persist refreshed tools',
                error: updateError.message,
            });
        }

        return reply.code(200).send({
            tools: newTools,
            errors: errors.length > 0 ? errors : undefined,
        });
    });
}
