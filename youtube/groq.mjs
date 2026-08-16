import { CFG, assertCfg } from './config.mjs';

const LONG_SYSTEM = `You write YouTube video scripts. Rules:
- Natural spoken English.
- 650-800 words (about 5-6 minutes of narration).
- Strong hook in the first sentence.
- Concrete examples, short sentences, no fluff.
- No markdown, no headers, no asterisks, no bullet symbols.
- Return only the script text.`;

const SHORT_SYSTEM = `You write YouTube Shorts scripts. Rules:
- Natural spoken English.
- 120-135 words (about 50 seconds of narration, MUST stay under 60 seconds of speech).
- Strong hook in the first sentence.
- No markdown, no headers, no asterisks.
- Return only the script text.`;

async function chat(system, user) {
    assertCfg(['GROQ_API_KEY']);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CFG.GROQ_API_KEY}` },
        body: JSON.stringify({
            model: CFG.MODEL,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq returned empty content');
    return content.trim();
}

export async function generateScript(topic, kind) {
    const system = kind === 'short' ? SHORT_SYSTEM : LONG_SYSTEM;
    return chat(system, `Write a YouTube ${kind === 'short' ? 'Shorts' : 'video'} script about: ${topic}`);
}

export async function generateImagePrompts(script, kind) {
    const n = kind === 'short' ? 2 : 5;
    const prompts = await chat(
        `You generate image prompts for an AI slideshow video. Rules:
- Return exactly ${n} image prompts, one per line, no numbering, no quotes.
- Each prompt: 20-40 words, a vivid visual scene for an AI image generator.
- Follow the script's narrative arc.
- No close-ups of faces.`,
        `Script:\n\n${script}`
    );
    return prompts.split('\n').map(s => s.trim()).filter(Boolean).slice(0, n);
}

export async function generateTitle(topic, script) {
    const title = await chat(
        `Generate ONE YouTube title for this video (max 90 characters, no quotes, no hashtags). Return only the title.`,
        `Topic: ${topic}\n\nScript:\n${script.slice(0, 900)}`
    );
    return title.replace(/^["']|["']$/g, '');
}