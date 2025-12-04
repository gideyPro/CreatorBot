import { Env } from './index';
import { generateArticle } from './groq';
import { sendTelegramMessage, getChatMemberCount } from './telegram';

export async function handleUpdate(update: any, env: Env) {
    const message = update.message || update.channel_post;

    if (message) {
        const chat_id = message.chat.id;
        const text = message.text || '';

        if (text.startsWith('/')) {
            if (text.startsWith('/generate')) {
                const prompt = text.substring('/generate'.length).trim();
                if (prompt) {
                    const article = await generateArticle(env.GROQ_API_KEY, prompt);
                    if (!await sendTelegramMessage(chat_id, article, env)) {
                        console.error('Failed to send generated article.');
                    }
                } else {
                    if (!await sendTelegramMessage(chat_id, 'Please provide a prompt after /generate.', env)) {
                        console.error('Failed to send prompt reminder.');
                    }
                }
            } else if (text.startsWith('/stats')) {
                const memberCount = await getChatMemberCount(chat_id, env);
                if (memberCount !== -1) {
                    if (!await sendTelegramMessage(chat_id, `Channel members: ${memberCount}`, env)) {
                        console.error('Failed to send member count.');
                    }
                } else {
                    if (!await sendTelegramMessage(chat_id, 'Failed to get channel stats.', env)) {
                        console.error('Failed to send stats failure message.');
                    }
                }
            } else {
                if (!await sendTelegramMessage(chat_id, "Unknown command. Try `/generate <your topic>` or `/stats`.", env)) {
                    console.error('Failed to send unknown command message.');
                }
            }
        }
    }
}
