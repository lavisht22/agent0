import type { FastifyInstance } from 'fastify';
import { registerInviteRoute } from './invite.js';
import { registerRunRoute } from './run.js';
import { registerTestRoute } from './test.js';

export async function registerRoutes(fastify: FastifyInstance) {
    await registerTestRoute(fastify);
    await registerRunRoute(fastify);
    await registerInviteRoute(fastify);
}
