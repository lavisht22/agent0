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
import { getAIProvider } from './lib/providers.js';
import { applyVariablesToMessages } from './lib/variables.js';


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

// API Routes
// Test API endpoint (for development/testing purposes)
fastify.post('/api/v1/test', async (request, reply) => {
    const { provider_id, data } = request.body as { provider_id: string; data: { model: string, messages: ModelMessage[], maxOutputTokens?: number, temperature?: number, maxStepCount?: number, variables?: Record<string, string> } };

    if (!provider_id) {
        return reply.code(400).send({ message: 'provider_id is required' });
    }

    const { data: provider, error } = await supabase
        .from('providers')
        .select('*')
        .eq('id', provider_id)
        .single();

    if (error || !provider) {
        return reply.code(404).send({ message: 'Provider not found' });
    }

    const aiProvider = getAIProvider(provider.type, provider.data);

    if (!aiProvider) {
        return reply.code(400).send({ message: `Unsupported provider type: ${provider.type}` });
    }

    const { model, messages, maxOutputTokens, temperature, maxStepCount, variables = {} } = data;

    const processedMessages = JSON.parse(applyVariablesToMessages(JSON.stringify(messages), variables)) as ModelMessage[]

    const result = streamText({
        model: aiProvider(model),
        maxOutputTokens,
        temperature,
        stopWhen: stepCountIs(maxStepCount || 10),
        messages: processedMessages,
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

// Run API endpoint (for production use with API key authentication)
fastify.post('/api/v1/run', async (request, reply) => {
    const { agent_id, variables = {}, stream = false } = request.body as {
        agent_id: string;
        variables?: Record<string, string>;
        stream?: boolean;
    };

    // Validate request body
    if (!agent_id) {
        return reply.code(400).send({ message: 'agent_id is required' });
    }

    // Extract and validate API key from headers
    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) {
        return reply.code(401).send({ message: 'API key is required' });
    }

    // Verify API key exists and get workspace
    const { data: apiKeyData, error: apiKeyError } = await supabase
        .from('api_keys')
        .select('workspace_id')
        .eq('id', apiKey)
        .single();

    if (apiKeyError || !apiKeyData) {
        return reply.code(401).send({ message: 'Invalid API key' });
    }

    // Get agent and verify it belongs to the same workspace
    const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('workspace_id')
        .eq('id', agent_id)
        .single();

    if (agentError || !agent) {
        return reply.code(404).send({ message: 'Agent not found' });
    }

    // Verify workspace access
    if (agent.workspace_id !== apiKeyData.workspace_id) {
        return reply.code(403).send({ message: 'Access denied to this agent' });
    }

    // Get the deployed version of the agent
    const { data: version, error: versionError } = await supabase
        .from('versions')
        .select('*, providers(*)')
        .eq('agent_id', agent_id)
        .eq('is_deployed', true)
        .single();

    if (versionError || !version) {
        return reply.code(404).send({ message: 'No deployed version found for this agent' });
    }

    // Extract version data
    const { messages, model, maxOutputTokens, temperature, maxStepCount } = version.data as { model?: string; maxOutputTokens?: number; messages?: ModelMessage[]; temperature?: number; maxStepCount?: number };


    if (!model || !messages || messages.length === 0) {
        return reply.code(400).send({ message: 'Agent configuration is invalid' });
    }

    // Get provider from the version
    const provider = version.providers;
    if (!provider) {
        return reply.code(404).send({ message: 'Provider not found' });
    }

    const aiProvider = getAIProvider(provider.type, provider.data);
    if (!aiProvider) {
        return reply.code(400).send({ message: `Unsupported provider type: ${provider.type}` });
    }

    // Apply variables to messages
    const processedMessages = JSON.parse(
        applyVariablesToMessages(JSON.stringify(messages), variables)
    ) as ModelMessage[];


    const tools = {
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
    }

    // Create AI stream
    const result = streamText({
        model: aiProvider(model),
        maxOutputTokens,
        temperature,
        stopWhen: stepCountIs(maxStepCount || 10),
        messages: processedMessages,
        tools,
    });

    // Handle streaming response
    if (stream) {
        const encoder = new TextEncoder();

        const streamResponse = new ReadableStream({
            async start(controller) {
                try {
                    for await (const part of result.fullStream) {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify(part)}\r\n\r\n`),
                        );
                    }
                } catch (err) {
                    console.error("Streaming error", err);
                    controller.error(err);
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

        return reply.send(streamResponse);
    }

    // Handle non-streaming response
    try {
        const steps = await result.steps;

        return reply.send({ messages: steps.map(step => ({ role: 'assistant', content: step.content })) });
    } catch (err) {
        console.error("Error processing agent run", err);
        return reply.code(500).send({ message: 'Error processing agent run' });
    }
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