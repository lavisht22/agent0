import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { registerRoutes } from './routes/index.js';

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });

// 1. Register Static File Serving
fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../public'), // Points to the copied web/dist folder
    prefix: '/', // Serve at root
});


await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// 2. Catch-all for SPA (Single Page App) Routing
// If a user goes to /prompts/edit/123, Fastify shouldn't 404, it should serve index.html
fastify.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api')) {
        // If it's an actual API 404, return JSON
        reply.code(404).send({ error: 'API endpoint not found' });
    } else {
        // Otherwise, return the App (Client-side routing handles the rest)
        reply.sendFile('index.html');
    }
});

// 3. Register API Routes
await registerRoutes(fastify);

const start = async () => {
    try {
        await fastify.listen({ port: Number(process.env.PORT || 2223), host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();