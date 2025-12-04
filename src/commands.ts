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
                case '/addchannel':
                    await handleAddChannel(chat_id, args, env);
                    break;
                default:
                    await sendTelegramMessage(chat_id, "Unknown command. Try `/generate <your topic>`, `/stats`, or `/start`.", env);
                    break;
            }
        } else {
            await handleMessage(chat_id, text, env);
        }
    }
}

async function handleMessage(chat_id: number, text: string, env: Env) {
    const userState = await env.KV_B.get(`user_state_${chat_id}`);
    if (userState === 'awaiting_topic') {
        await handleGenerate(chat_id, text, env);
        await env.KV_B.delete(`user_state_${chat_id}`);
    }
}

async function handleGenerateArticle(chat_id: number, env: Env) {
    await env.KV_B.put(`user_state_${chat_id}`, 'awaiting_topic');
    await sendTelegramMessage(chat_id, 'Please enter the topic for the article:', env);
}

async function handleGenerate(chat_id: number, prompt: string, env: Env) {
    const selectedModel = await env.KV_B.get(`model_${chat_id}`) || 'llama3-8b-8192';
    const activeChannel: string | null = await env.KV_B.get(`active_channel_${chat_id}`);
    const formattedPrompt = `
Please generate a well-formatted and engaging article for a Telegram channel based on the following topic.
The article should be easy to read and visually appealing, using Telegram's Markdown formatting to its full potential.

- Use *bold* for headings and important keywords.
- Use _italic_ for emphasis and subheadings.
- Use \`code\` for any code snippets or technical terms.
- Use [links](https.example.com) for any URLs.
- Break down the content into paragraphs and use bullet points or numbered lists where appropriate to improve readability.
- Add relevant emojis to make the content more engaging.

Topic: "${prompt}"
    `;

    if (prompt) {
        const result = await generateArticle(env.GROQ_API_KEY, formattedPrompt, selectedModel);
        if (result.success) {
            const targetChat = activeChannel || chat_id;
            if (await sendTelegramMessage(targetChat, result.content, env)) {
                if (activeChannel) {
                    await sendTelegramMessage(chat_id, `Article successfully posted to ${activeChannel}.`, env);
                }
            } else {
                await sendTelegramMessage(chat_id, `Failed to post the article to ${targetChat}. Please check if the bot is an administrator in the channel.`, env);
            }
        } else {
            await sendTelegramMessage(chat_id, result.content, env);
        }
    } else {
        await sendTelegramMessage(chat_id, 'Please provide a prompt after /generate.', env);
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
    await sendDashboard(chat_id, env);
}

async function sendDashboard(chat_id: number, env: Env) {
    const welcomeMessage = `
Welcome to the Creator Bot! 🚀

Here are the commands you can use:
- \`/generate <topic>\`: Generates an article on the specified topic.
- \`/stats\`: Shows the number of members in this channel.
- \`/start\`: Displays this welcome message.
- \`/settings\`: Choose a model for article generation.
- \`/addchannel <@channel_id>\`: Adds a channel to the bot.

Let's create something amazing together! ✨
    `;
    const keyboard = [
        [{ text: '📝 Generate Article', callback_data: 'generate_article' }],
        [{ text: '📺 Channel Management', callback_data: 'channel_management' }],
        [{ text: '⚙️ Settings', callback_data: 'settings' }],
        [{ text: '📊 Statistics', callback_data: 'stats' }]
    ];
    await sendInlineKeyboardMessage(chat_id, welcomeMessage, keyboard, env);
}

async function handleSettings(chat_id: number, env: Env) {
    const keyboard = [
        [{ text: 'Model Settings', callback_data: 'model_settings' }],
        [{ text: 'Channel Management', callback_data: 'channel_management' }],
    ];
    await sendInlineKeyboardMessage(chat_id, 'Settings:', keyboard, env);
}

async function handleCallbackQuery(callbackQuery: any, env: Env) {
    const chat_id = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data.startsWith('set_model:')) {
        const model = data.substring('set_model:'.length);
        await env.KV_B.put(`model_${chat_id}`, model);
        await sendTelegramMessage(chat_id, `Model set to ${model}.`, env);
    } else if (data === 'model_settings') {
        await handleModelSettings(chat_id, env);
    } else if (data === 'channel_management') {
        await handleChannelManagement(chat_id, env);
    } else if (data === 'add_channel') {
        await sendTelegramMessage(chat_id, 'Please use the `/addchannel <@channel_id>` command to add a new channel.', env);
    } else if (data === 'set_active_channel') {
        await handleSetActiveChannel(chat_id, env);
    } else if (data === 'generate_article') {
        await handleGenerateArticle(chat_id, env);
    } else if (data === 'settings') {
        await handleSettings(chat_id, env);
    } else if (data === 'stats') {
        await handleStats(chat_id, env);
    } else if (data === 'channel_management') {
        await handleChannelManagement(chat_id, env);
    } else if (data.startsWith('set_active:')) {
        const channel = data.substring('set_active:'.length);
        await env.KV_B.put(`active_channel_${chat_id}`, channel);
        await sendTelegramMessage(chat_id, `Active channel set to ${channel}.`, env);
    }
}

async function handleModelSettings(chat_id: number, env: Env) {
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

async function handleChannelManagement(chat_id: number, env: Env) {
    const channels: string[] = await env.KV_B.get(`channels_${chat_id}`, 'json') || [];
    const activeChannel: string = await env.KV_B.get(`active_channel_${chat_id}`) || 'Not set';

    let message = `*Channel Management*\n\n`;
    message += `*Active Channel:* \`${activeChannel}\`\n\n`;
    message += `*Registered Channels:*\n`;
    message += channels.length > 0 ? channels.map(c => `- \`${c}\``).join('\n') : 'No channels added yet.';

    const keyboard = [
        [{ text: 'Add a Channel', callback_data: 'add_channel' }],
        [{ text: 'Set Active Channel', callback_data: 'set_active_channel' }],
    ];

    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

async function handleAddChannel(chat_id: number, channel: string, env: Env) {
    if (channel && (channel.startsWith('@') || /^-100\d{10}$/.test(channel))) {
        const channels: string[] = await env.KV_B.get(`channels_${chat_id}`, 'json') || [];
        if (!channels.includes(channel)) {
            channels.push(channel);
            await env.KV_B.put(`channels_${chat_id}`, JSON.stringify(channels));
            await sendTelegramMessage(chat_id, `Channel ${channel} added successfully.`, env);
        } else {
            await sendTelegramMessage(chat_id, `Channel ${channel} is already registered.`, env);
        }
    } else {
        await sendTelegramMessage(chat_id, 'Invalid channel format. Please use `@channel_id` or a valid channel ID like `-100...`.', env);
    }
}

async function handleSetActiveChannel(chat_id: number, env: Env) {
    const channels: string[] = await env.KV_B.get(`channels_${chat_id}`, 'json') || [];
    if (channels.length > 0) {
        const keyboard = channels.map(channel => ([{
            text: channel,
            callback_data: `set_active:${channel}`,
        }]));
        await sendInlineKeyboardMessage(chat_id, 'Please select an active channel:', keyboard, env);
    } else {
        await sendTelegramMessage(chat_id, 'No channels registered. Please add a channel first using `/addchannel`.', env);
    }
}
