import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import type { Json } from '@repo/database';
import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/db.js';
import { decryptMessage } from '../lib/openpgp.js';
import type { MCPConfig } from '../lib/types.js';

export async function registerRefreshMCPRoute(fastify: FastifyInstance) {
    fastify.post('/api/v1/refresh-mcp', async (request, reply) => {
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

        let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

        try {
            // Decrypt the MCP configuration
            // The encrypted_data is stored as a string (armored PGP message)
            const decrypted = await decryptMessage(mcp.encrypted_data as string);
            const config: MCPConfig = JSON.parse(decrypted);

            // Create MCP client using the decrypted configuration
            mcpClient = await createMCPClient(config);

            // Get tools from the MCP server
            const tools = await mcpClient.tools();

            // Convert tools to a serializable format for storage
            // Using plain objects that are compatible with the Json type
            const toolsList = Object.entries(tools).map(([name, tool]) => ({
                name,
                description: tool.description,
            }));

            // Update the MCP server with the fetched tools
            const { error: updateError } = await supabase
                .from("mcps")
                .update({
                    tools: toolsList as unknown as Json,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", mcp_id);

            if (updateError) {
                throw updateError;
            }

            return reply.code(200).send({
                tools: toolsList,
            });
        } catch (error) {
            console.error('Error refreshing MCP tools:', error);

            return reply.code(500).send({
                message: 'Failed to refresh tools',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            // Close the MCP client connection
            if (mcpClient) {
                await mcpClient.close();
            }
        }
    });
}
