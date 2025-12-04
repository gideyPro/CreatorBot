import { Env } from './index';
import { generateArticle } from './groq';
import { sendTelegramMessage, getChatMemberCount } from './telegram';

export async function handleUpdate(update: any, env: Env) {
    const message = update.message || update.channel_post;

    if (message) {
        const chat_id = message.chat.id;
        const text = message.text || '';

        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            const args = text.substring(command.length).trim();

            switch (command) {
                case '/generate':
                    await handleGenerate(chat_id, args, env);
                    break;
                case '/stats':
                    await handleStats(chat_id, env);
                    break;
                case '/start':
                    await handleStart(chat_id, env);
                    break;
                default:
                    await sendTelegramMessage(chat_id, "Unknown command. Try `/generate <your topic>`, `/stats`, or `/start`.", env);
                    break;
            }
        }
    }
}

async function handleGenerate(chat_id: number, prompt: string, env: Env) {
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
}

async function handleStats(chat_id: number, env: Env) {
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
}

async function handleStart(chat_id: number, env: Env) {
    const welcomeMessage = `
Welcome to the Creator Bot! 🚀

Here are the commands you can use:
- \`/generate <topic>\`: Generates an article on the specified topic.
- \`/stats\`: Shows the number of members in this channel.
- \`/start\`: Displays this welcome message.

Let's create something amazing together! ✨
    `;
    if (!await sendTelegramMessage(chat_id, welcomeMessage, env)) {
        console.error('Failed to send welcome message.');
    }
}
