export async function generateImage(prompt: string): Promise<{ success: boolean, imageUrl?: string, error?: string }> {
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20 second timeout

    try {
        const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
        if (response.ok) {
            return { success: true, imageUrl: response.url };
        } else {
            return { success: false, error: `Failed to generate image. Status: ${response.status}` };
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return { success: false, error: 'Image generation timed out.' };
        }
        return { success: false, error: `Failed to generate image. Error: ${error.message}` };
    } finally {
        clearTimeout(timeout);
    }
}
