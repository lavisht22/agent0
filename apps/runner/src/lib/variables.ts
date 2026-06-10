export const applyVariablesToMessages = (input: string, variables: Record<string, string>) => {

    for (const [key, value] of Object.entries(variables)) {
        // Escape via JSON.stringify so the value can't break the surrounding JSON.
        const escapedValue = JSON.stringify(value).slice(1, -1);
        input = input.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), escapedValue);
    }

    return input;
}