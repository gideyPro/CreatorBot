import { generateArticle } from './groq';

interface TranslationResult {
    success: boolean;
    content: string;
}

interface TranslateEnv {
    GROQ_API_KEY: string;
}

export async function translateText(text: string, targetLanguage: string, env: TranslateEnv): Promise<TranslationResult> {
    const google = await googleTranslate(text, targetLanguage);
    if (google.success) return google;
    console.error('Google translate failed, falling back to Groq:', google.content);
    return translateWithGroq(env.GROQ_API_KEY, text, targetLanguage);
}

async function googleTranslate(text: string, targetLanguage: string): Promise<TranslationResult> {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
        });

        if (!response.ok) {
            const errorMessage = `Translation API Error: ${response.status} - ${await response.text()}`;
            console.error(errorMessage);
            return { success: false, content: errorMessage };
        }

        const data = await response.json();
        if (data && data[0]) {
            const translatedText = data[0].map((segment: any) => segment[0]).join('');
            if (translatedText.trim().length > 0) {
                return { success: true, content: translatedText };
            }
        }
        return { success: false, content: 'Google translate returned an empty response.' };
    } catch (error: any) {
        const errorMessage = `Translation API Request Failed: ${error.message}`;
        console.error(errorMessage);
        return { success: false, content: errorMessage };
    }
}

async function translateWithGroq(apiKey: string, text: string, targetLanguage: string): Promise<TranslationResult> {
    const langName: Record<string, string> = { am: 'Amharic', es: 'Spanish', fr: 'French', de: 'German', ar: 'Arabic' };
    const lang = langName[targetLanguage] || targetLanguage;
    return generateArticle(
        apiKey,
        `Translate the following text into ${lang}. Return ONLY the translation — no notes, no quotes, no extra text.\n\n${text}`
    );
}