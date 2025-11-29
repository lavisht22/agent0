import 'dotenv/config';
import path from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Database } from '@repo/database';
import { createClient } from '@supabase/supabase-js';
import { type ModelMessage, stepCountIs, streamText, tool } from 'ai';
import Fastify from 'fastify';
import { z } from 'zod';
import { getAIProvider } from './lib/providers';


// biome-ignore lint/style/noNonNullAssertion: <>
const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_API_KEY!);

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

// ... your API routes ...
fastify.post('/api/test', async (request, reply) => {
    const { provider_id, data } = request.body as { provider_id: string; data: { model: string, messages: ModelMessage[] } };

    if (!provider_id) {
        return reply.code(400).send({ error: 'provider_id is required' });
    }

    const { data: provider, error } = await supabase
        .from('providers')
        .select('*')
        .eq('id', provider_id)
        .single();

    if (error || !provider) {
        return reply.code(404).send({ error: 'Provider not found' });
    }

    const aiProvider = getAIProvider(provider.type, provider.data);
    const { model, messages } = data;

    const result = streamText({
        model: aiProvider(model),
        messages,
        tools: {
            weather: tool({
                description: 'Get the weather in a location',
                inputSchema: z.object({
                    location: z.string().describe('The location to get the weather for'),
                }),
                execute: async ({ location }) => ({
                    location,
                    temperature: 72 + Math.floor(Math.random() * 21) - 10,
                }),
            }),
        },
        stopWhen: stepCountIs(5),
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            try {

                for await (const part of result.fullStream) {
                    console.log("part", part);
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(part)}\r\n\r\n`),
                    );
                }
            } catch (err) {
                console.error("Streaming error", err);
            } finally {
                controller.close();
            }
        },
    });


    reply.headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    return reply.send(stream);
});

const start = async () => {
    try {
        await fastify.listen({ port: Number(process.env.PORT || 2223), host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();