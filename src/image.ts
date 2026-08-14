function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generateImage(prompt: string): Promise<{ success: boolean, imageUrl?: string, error?: string }> {
    const encodedPrompt = encodeURIComponent(prompt);
    const baseUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true`;
    const retryDelays = [0, 1500, 4000];

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (attempt > 0) await sleep(retryDelays[attempt]);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        try {
            const response = await fetch(baseUrl, { signal: controller.signal, redirect: 'follow' });
            if (response.ok) {
                return { success: true, imageUrl: response.url };
            }
            if (response.status === 429) {
                console.warn(`Pollinations rate limited on attempt ${attempt + 1}.`);
                continue;
            }
            return { success: false, error: `Failed to generate image. Status: ${response.status}` };
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                return { success: false, error: `Failed to generate image. Error: ${error.message}` };
            }
            console.warn(`Image generation timed out on attempt ${attempt + 1}.`);
        } finally {
            clearTimeout(timeout);
        }
    }

    return { success: false, error: 'Image service is rate limited (429). Please try again shortly.' };
}