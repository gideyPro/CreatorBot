import { Env } from './index';
import { generateArticle, listModels } from './groq';
import { sendTelegramMessage, getChatMemberCount, sendInlineKeyboardMessage } from './telegram';

export async function handleUpdate(update: any, env: Env) {
    if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, env);
        return;
    }

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
                case '/settings':
                    await handleSettings(chat_id, env);
                    break;
                default:
                    await sendTelegramMessage(chat_id, "Unknown command. Try `/generate <your topic>`, `/stats`, or `/start`.", env);
                    break;
            }
        }
    }
}

async function handleGenerate(chat_id: number, prompt: string, env: Env) {
    const selectedModel = await env.KV_B.get(`model_${chat_id}`) || 'llama3-8b-8192';

    if (prompt) {
        const article = await generateArticle(env.GROQ_API_KEY, prompt, selectedModel);
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
- \`/settings\`: Choose a model for article generation.

Let's create something amazing together! ✨
    `;
    if (!await sendTelegramMessage(chat_id, welcomeMessage, env)) {
        console.error('Failed to send welcome message.');
    }
}

async function handleSettings(chat_id: number, env: Env) {
    const models = await listModels(env.GROQ_API_KEY);
    if (models.length > 0) {
        const keyboard = models.map(model => ([{
            text: model.id,
            callback_data: `set_model:${model.id}`,
        }]));
        await sendInlineKeyboardMessage(chat_id, 'Please select a model:', keyboard, env);
    } else {
        await sendTelegramMessage(chat_id, 'Could not retrieve models.', env);
    }
}

async function handleCallbackQuery(callbackQuery: any, env: Env) {
    const chat_id = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data.startsWith('set_model:')) {
        const model = data.substring('set_model:'.length);
        await env.KV_B.put(`model_${chat_id}`, model);
        await sendTelegramMessage(chat_id, `Model set to ${model}.`, env);
    }
}
