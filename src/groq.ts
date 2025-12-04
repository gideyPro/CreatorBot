import Groq from 'groq-sdk';

export async function generateArticle(apiKey: string, prompt: string, model: string = 'llama3-8b-8192'): Promise<string> {
    const groq = new Groq({ apiKey });

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: model,
        });

        return chatCompletion.choices[0]?.message?.content || 'No content generated.';
    } catch (error) {
        console.error('Error generating article with Groq:', error);
        return 'Failed to generate article.';
    }
}

export async function listModels(apiKey: string): Promise<any[]> {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!response.ok) {
            console.error('Failed to fetch models from Groq API:', response.statusText);
            return [];
        }

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('Error listing Groq models:', error);
        return [];
    }
}
