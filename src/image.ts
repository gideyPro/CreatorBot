export async function generateImage(prompt: string): Promise<{ success: boolean, imageUrl?: string, error?: string }> {
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
    try {
        const response = await fetch(url);
        if (response.ok) {
            return { success: true, imageUrl: url };
        } else {
            return { success: false, error: `Failed to pre-warm image. Status: ${response.status}` };
        }
    } catch (error) {
        return { success: false, error: `Failed to pre-warm image. Error: ${error.message}` };
    }
}
