import 'dotenv/config';
import path from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Database, Json } from '@repo/database';
import { createClient } from '@supabase/supabase-js';
import {
    generateText,
    type ModelMessage,
    Output,
    type StepResult,
    stepCountIs,
    streamText,
    type ToolSet,
} from 'ai';
import Fastify from 'fastify';
import { nanoid } from 'nanoid';
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
    model: { provider_id: string; name: string };
    messages: ModelMessage[],
    maxOutputTokens?: number,
    outputFormat?: "text" | "json",
    temperature?: number,
    maxStepCount?: number,
};

// Helper to prepare provider and messages - shared logic between generate and stream
const prepareProviderAndMessages = async (data: VersionData, variables: Record<string, string>) => {
    const { model, messages } = data;

    const { data: provider, error: providerError } = await supabase
        .from("providers")
        .select("*")
        .eq("id", model.provider_id).single();

    if (providerError) {
        throw providerError;
    }

    const aiProvider = getAIProvider(provider.type, provider.data);

    if (!aiProvider) {
        throw new Error(`Unsupported provider type: ${provider.type}`);
    }

    const processedMessages = JSON.parse(applyVariablesToMessages(JSON.stringify(messages), variables)) as ModelMessage[]

    return {
        model: aiProvider(model.name),
        provider,
        processedMessages
    };
}

const streamResult = async (data: VersionData, variables: Record<string, string>) => {
    const { maxOutputTokens, outputFormat, temperature, maxStepCount } = data
    const { model, processedMessages } = await prepareProviderAndMessages(data, variables);

    const result = streamText({
        model,
        maxOutputTokens,
        temperature,
        stopWhen: stepCountIs(maxStepCount || 10),
        messages: processedMessages,
        output: outputFormat === "json" ? Output.json() : Output.text(),
    });

    return result;
}

// Helper to create SSE stream from AI result
const createSSEStream = (result: Awaited<ReturnType<typeof streamResult>>) => {
    const encoder = new TextEncoder();

    return new ReadableStream({
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
}


// API Routes
fastify.post('/api/v1/test', async (request, reply) => {
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

    const { data, variables } = request.body as { data: unknown, variables: Record<string, string> }
    const versionData = data as VersionData;

    // Get the provider to check workspace access
    const { data: provider, error: providerError } = await supabase
        .from("providers")
        .select("workspaces(workspace_user(user_id, role))")
        .eq("id", versionData.model.provider_id)
        .eq("workspaces.workspace_user.user_id", claims.claims.sub)
        .single();

    if (providerError || !provider) {
        return reply.code(404).send({ message: 'Provider not found' });
    }

    if (provider.workspaces.workspace_user.length === 0) {
        return reply.code(403).send({ message: 'Access denied' });
    }

    const result = await streamResult(versionData, variables);
    const stream = createSSEStream(result);

    reply.headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    return reply.send(stream);
});


async function insertRun(workspace_id: string, version_id: string, data: unknown, startTime: number) {
    await supabase.from("runs").insert({
        id: nanoid(),
        workspace_id,
        version_id,
        data: data as unknown as Json,
        created_at: new Date(startTime).toISOString(),
    });
}


fastify.post('/api/v1/run', async (request, reply) => {
    const startTime = Date.now();

    const runData: {
        request?: VersionData & { model: { provider_id: string, name: string }, stream: boolean },
        steps?: StepResult<ToolSet>[],
        error?: {
            name: string;
            message: string;
            cause?: unknown;
        },
        metrics: {
            preProcessingTime: number,
            firstTokenTime: number,
            responseTime: number,
        }
    } = {
        metrics: {
            preProcessingTime: 0,
            firstTokenTime: 0,
            responseTime: 0,
        }
    };

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
    const data = version.data as VersionData;
    const { model, processedMessages } = await prepareProviderAndMessages(data, variables);
    const { maxOutputTokens, outputFormat, temperature, maxStepCount } = data

    const payload = {
        model,
        maxOutputTokens,
        temperature,
        stopWhen: stepCountIs(maxStepCount || 10),
        messages: processedMessages,
        output: outputFormat === "json" ? Output.json() : Output.text(),
    }

    runData.request = { ...payload, model: data.model, stream };
    runData.metrics.preProcessingTime = Date.now() - startTime;


    try {
        if (stream) {
            const result = streamText({
                ...payload,
                onChunk: () => {
                    if (runData.metrics.firstTokenTime === 0) {
                        runData.metrics.firstTokenTime = Date.now() - runData.metrics.preProcessingTime - startTime;
                    }
                },
                onFinish: async ({ steps }) => {
                    runData.metrics.responseTime = Date.now() - runData.metrics.preProcessingTime - startTime;
                    runData.steps = steps;
                    await insertRun(agent.workspaces.id, version.id, runData, startTime);
                },
                onError: async ({ error }) => {
                    if (runData.metrics.firstTokenTime === 0) {
                        runData.metrics.firstTokenTime = Date.now() - runData.metrics.preProcessingTime - startTime;
                    }
                    runData.metrics.responseTime = Date.now() - runData.metrics.preProcessingTime - startTime;

                    runData.error = {
                        name: error instanceof Error ? error.name : "UnknownError",
                        message: error instanceof Error ? error.message : "Unknown error occured.",
                        cause: error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined
                    }
                    await insertRun(agent.workspaces.id, version.id, runData, startTime);
                }
            });

            const streamResponse = createSSEStream(result);

            reply.headers({
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });

            return reply.send(streamResponse);
        }

        // Handle non-streaming response
        const result = await generateText({
            ...payload
        });

        const { response, text, steps } = result;
        runData.steps = steps;

        reply.send({
            text, messages: response.messages
        });
    } catch (error) {
        runData.error = {
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : "Unknown error occured.",
            cause: error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined
        }

        reply.code(500).send(error);
    }

    runData.metrics.firstTokenTime = Date.now() - runData.metrics.preProcessingTime - startTime;
    runData.metrics.responseTime = Date.now() - runData.metrics.preProcessingTime - startTime;
    insertRun(agent.workspaces.id, version.id, runData, startTime);
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