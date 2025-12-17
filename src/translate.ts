import { Env } from './index';

interface TranslationResult {
    success: boolean;
    content: string;
}

export async function translateText(text: string, targetLanguage: string, env: Env): Promise<TranslationResult> {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorMessage = `Translation API Error: ${response.status} - ${errorText}`;
            console.error(errorMessage);
            return { success: false, content: errorMessage };
        }

        const data = await response.json();
        // The response is a nested array. The translated text is in the first element.
        // We need to iterate over the segments and join them.
        if (data && data[0]) {
            const translatedText = data[0].map(segment => segment[0]).join('');
            return { success: true, content: translatedText };
        } else {
            const errorMessage = `Translation API returned an unexpected response format: ${JSON.stringify(data)}`;
            console.error(errorMessage);
            return { success: false, content: errorMessage };
        }
    } catch (error) {
        const errorMessage = `Translation API Request Failed: ${error.message}`;
        console.error(errorMessage);
        return { success: false, content: errorMessage };
    }
}
