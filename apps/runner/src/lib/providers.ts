import { createXai, type XaiProviderSettings } from '@ai-sdk/xai';

export const getAIProvider = (type: string, data: unknown) => {
    if (type === 'xai') {
        return createXai(data as XaiProviderSettings);
    }

    return null
}