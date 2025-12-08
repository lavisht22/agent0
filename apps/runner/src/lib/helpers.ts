import { ReadableStream } from 'node:stream/web';
import type { Json } from '@repo/database';
import type { ModelMessage, streamText } from 'ai';
import { nanoid } from 'nanoid';
import { supabase } from './db.js';
import { decryptMessage } from './openpgp.js';
import { getAIProvider } from './providers.js';
import type { RunData, VersionData } from './types.js';
import { applyVariablesToMessages } from './variables.js';

// Helper to prepare provider and messages - shared logic between generate and stream
export const prepareProviderAndMessages = async (data: VersionData, variables: Record<string, string>) => {
    const { model, messages } = data;

    const { data: provider, error: providerError } = await supabase
        .from("providers")
        .select("*")
        .eq("id", model.provider_id).single();

    if (providerError) {
        throw providerError;
    }

    const decrypted = await decryptMessage(provider.encrypted_data);

    const config = JSON.parse(decrypted);

    const aiProvider = getAIProvider(provider.type, config);

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

// Helper to create SSE stream from AI result
export const createSSEStream = (result: Awaited<ReturnType<typeof streamText>>) => {
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

export async function insertRun(workspace_id: string, version_id: string, data: RunData, start_time: number, is_error: boolean, is_test: boolean) {
    await supabase.from("runs").insert({
        id: nanoid(),
        workspace_id,
        version_id,
        data: data as unknown as Json,
        created_at: new Date(start_time).toISOString(),
        is_error,
        is_test,
    });
}
