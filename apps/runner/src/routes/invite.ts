import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/db.js';

export async function registerInviteRoute(fastify: FastifyInstance) {
    fastify.post('/api/v1/invite', async (request, reply) => {
        // Extract token from Authorization header
        const token = request.headers.authorization?.split('Bearer ')[1];

        if (!token) {
            return reply.code(401).send({ message: 'No token provided' });
        }

        const { data: claims, error: userError } = await supabase.auth.getClaims(token);

        if (userError) {
            throw userError;
        }

        if (!claims) {
            throw new Error("Failed to get claims")
        }

        const { email, workspace_id } = request.body as {
            email: string;
            workspace_id: string;
        }

        const { data } = await supabase
            .from("workspace_user")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("user_id", claims.claims.sub)
            .eq("role", "admin")
            .single()
            .throwOnError()

        if (!data) {
            return reply.code(403).send({ message: 'Access denied to this workspace' });
        }

        const { data: { user: invitedUser }, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);

        if (inviteError) {
            throw inviteError;
        }

        if (!invitedUser) {
            throw new Error("Failed to invite user")
        }


        await supabase.from("workspace_user").insert({
            workspace_id,
            user_id: invitedUser.id,
            role: "reader"
        })

        return reply.send({ message: 'User invited successfully' });
    })
}
