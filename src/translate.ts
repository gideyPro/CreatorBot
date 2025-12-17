import { Env } from './index';

export async function translateText(text: string, targetLanguage: string, env: Env): Promise<string | null> {
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
            console.error(`Translation API Error: ${response.status} - ${errorText}`);
            return null;
        }

        const data = await response.json();
        if (data.translatedText) {
            return data.translatedText;
        } else {
            console.error('Translation API returned no translations:', data);
            return null;
        }
    } catch (error) {
        console.error('Translation API Request Failed:', error);
        return null;
    }
}
