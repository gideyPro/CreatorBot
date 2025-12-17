import { Env } from './index';

interface TranslationResult {
    success: boolean;
    content: string;
}

export async function translateText(text: string, targetLanguage: string, env: Env): Promise<TranslationResult> {
    const url = `https://libretranslate.com/translate`;
    const payload = {
        q: text,
        source: 'auto',
        target: targetLanguage,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorMessage = `Translation API Error: ${response.status} - ${errorText}`;
            console.error(errorMessage);
            return { success: false, content: errorMessage };
        }

        const data = await response.json();
        if (data.translatedText) {
            return { success: true, content: data.translatedText };
        } else {
            const errorMessage = `Translation API returned no translations: ${JSON.stringify(data)}`;
            console.error(errorMessage);
            return { success: false, content: errorMessage };
        }
    } catch (error) {
        const errorMessage = `Translation API Request Failed: ${error.message}`;
        console.error(errorMessage);
        return { success: false, content: errorMessage };
    }
}
