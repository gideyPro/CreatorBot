import Groq from 'groq-sdk';

export async function generateArticle(apiKey: string, prompt: string): Promise<string> {
    const groq = new Groq({ apiKey });

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama3-8b-8192',
        });

        return chatCompletion.choices[0]?.message?.content || 'No content generated.';
    } catch (error) {
        console.error('Error generating article with Groq:', error);
        return 'Failed to generate article.';
    }
}
