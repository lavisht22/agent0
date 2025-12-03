import 'dotenv/config';
import path from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Database } from '@repo/database';
import { createClient } from '@supabase/supabase-js';
import { type ModelMessage, Output, stepCountIs, streamText, tool } from 'ai';
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

type VersionData = {
    providers: { id: string; model: string }[];
    messages: ModelMessage[],
    maxOutputTokens?: number,
    outputFormat?: "text" | "json",
    temperature?: number,
    maxStepCount?: number,
};

const generateResult = async (data: VersionData, variables: Record<string, string>) => {
    const { providers, messages, maxOutputTokens, outputFormat, temperature, maxStepCount } = data

    const { data: availableProviders, error: availableProvidersError } = await supabase
        .from("providers")
        .select("*")
        .in("id", providers.map(p => p.id))

    if (availableProvidersError) {
        throw availableProvidersError;
    }

    if (availableProviders.length === 0) {
        throw new Error("No valid providers found")
    }

    const providersHydrated = providers.map(p => {
        const availableProvider = availableProviders.find(ap => ap.id === p.id);

        if (!availableProvider) {
            throw new Error(`Provider ${p.id} not found`);
        }

        return {
            ...p,
            ...availableProvider,
        }
    });

    const randomProvider = providersHydrated[Math.floor(Math.random() * providersHydrated.length)];

    const aiProvider = getAIProvider(randomProvider.type, randomProvider.data);

    if (!aiProvider) {
        throw new Error(`Unsupported provider type: ${randomProvider.type}`);
    }

    const processedMessages = JSON.parse(applyVariablesToMessages(JSON.stringify(messages), variables)) as ModelMessage[]

    const result = streamText({
        model: aiProvider(randomProvider.model),
        maxOutputTokens,
        temperature,
        stopWhen: stepCountIs(maxStepCount || 10),
        messages: processedMessages,
        output: outputFormat === "json" ? Output.json() : Output.text(),
        // tools: {
        //     weather: tool({
        //         description: 'Get the weather in a location',
        //         inputSchema: z.object({
        //             location: z.string().describe('The location to get the weather for'),
        //         }),
        //         execute: async ({ location }) => {
        //             return {
        //                 location,
        //                 temperature: 72 + Math.floor(Math.random() * 21) - 10,
        //             }
        //         },
        //     }),
        // },
    });

    return result;
}


// API Routes
fastify.post('/api/v1/test', async (request, reply) => {
    const { data, variables } = request.body as { data: unknown, variables: Record<string, string> }

    const result = await generateResult(data as VersionData, variables);

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

    // Get agent and verify it belongs to the same workspace
    const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('workspaces(id, api_keys(id)), versions(*)')
        .eq('id', agent_id)
        .eq("versions.is_deployed", true)
        .single();

    if (agentError || !agent) {
        return reply.code(404).send({ message: 'Agent not found' });
    }

    // Verify workspace access
    if (!agent.workspaces.api_keys.map(ak => ak.id).includes(apiKey)) {
        return reply.code(403).send({ message: 'Access denied' });
    }

    if (agent.versions.length === 0) {
        return reply.code(404).send({ message: 'No deployed version found for this agent' });
    }

    const version = agent.versions[0];

    // Create AI stream
    const result = await generateResult(version.data as VersionData, variables);

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
        const { messages } = await result.response;

        return reply.send({ messages });
    } catch (err) {
        console.error("Error processing agent run", err);
        return reply.code(500).send({ message: 'Error processing agent run' });
    }
});


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

const start = async () => {
    try {
        await fastify.listen({ port: Number(process.env.PORT || 2223), host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();