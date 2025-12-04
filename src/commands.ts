import { Env } from './index';
import { generateArticle, listModels } from './groq';
import { sendTelegramMessage, getChatMemberCount, sendInlineKeyboardMessage, sendPhoto, editMessageText, deleteMessage } from './telegram';
import { generateImage } from './image';

export async function handleUpdate(update: any, env: Env, ctx: ExecutionContext) {
    if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, env, ctx);
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
    if (!prompt) {
        await sendTelegramMessage(chat_id, 'Please provide a prompt after /generate.', env);
        return;
    }

    const statusMessageId = await sendTelegramMessage(chat_id, 'Generating article...', env);
    if (!statusMessageId) return;

    const selectedModel = await env.KV_B.get(`model_${chat_id}`) || 'llama3-8b-8192';
    const activeChannel: string | null = await env.KV_B.get(`active_channel_${chat_id}`);
    const formattedPrompt = `
Generate a Telegram post about: "${prompt}".

**Formatting Rules:**
- Use Markdown that is compatible with Telegram.
- Use *bold* for titles and key phrases.
- Use _italic_ for emphasis.
- Use \`code\` for technical terms.
- Use [links](https://...) for URLs.
- **Do not use**: \`---\`, \`**\`, or tables.
- Use emojis to make it engaging.
    `;

    const articleResult = await generateArticle(env.GROQ_API_KEY, formattedPrompt, selectedModel);
    if (!articleResult.success) {
        await editMessageText(chat_id, statusMessageId, articleResult.content, env);
        return;
    }

    await editMessageText(chat_id, statusMessageId, 'Generating image...', env);
    const targetChat = activeChannel || chat_id;
    const imagePromptResult = await generateArticle(env.GROQ_API_KEY, `Generate a short, descriptive image prompt from the following article: ${articleResult.content}`, selectedModel);

    if (imagePromptResult.success) {
        const imageUrl = generateImage(imagePromptResult.content);
        if (await sendPhoto(targetChat, imageUrl, articleResult.content, env)) {
            if (activeChannel) {
                await sendTelegramMessage(chat_id, `Article with image successfully posted to ${activeChannel}.`, env);
            }
        } else {
            await sendTelegramMessage(chat_id, `Failed to post the article with image to ${targetChat}. Please check if the bot is an administrator in the channel.`, env);
            await sendTelegramMessage(chat_id, "Posted Without Image", env);
            await sendTelegramMessage(targetChat, articleResult.content, env);
        }
    } else {
        await sendTelegramMessage(chat_id, `Failed to generate image prompt: ${imagePromptResult.content}.`, env);
        await sendTelegramMessage(chat_id, "Posted Without Image", env);
        await sendTelegramMessage(targetChat, articleResult.content, env);
    }

    await deleteMessage(chat_id, statusMessageId, env);
    const keyboard = [[{ text: '📝 Generate Again', callback_data: 'generate_article' }]];
    await sendInlineKeyboardMessage(chat_id, 'Generation complete.', keyboard, env);
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
    const userState = await env.KV_B.get(`user_state_${chat_id}`);
    if (userState === 'awaiting_topic') {
        await env.KV_B.delete(`user_state_${chat_id}`);
    }
    await sendDashboard(chat_id, env);
}

async function sendDashboard(chat_id: number, env: Env) {
    const welcomeMessage = `
Welcome to the Creator Bot! 🚀

This bot helps you generate articles and manage your Telegram channels. Use the buttons below to navigate.
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
        [{ text: '⬅️ Back to Menu', callback_data: 'back_to_menu' }]
    ];
    await sendInlineKeyboardMessage(chat_id, 'Settings:', keyboard, env);
}

async function handleCallbackQuery(callbackQuery: any, env: Env, ctx: ExecutionContext) {
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
    } else if (data.startsWith('remove_channel:')) {
        const channelToRemove = data.substring('remove_channel:'.length);
        await handleRemoveChannel(chat_id, channelToRemove, env);
    } else if (data === 'back_to_menu') {
        await sendDashboard(chat_id, env);
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
        keyboard.push([{ text: '⬅️ Back to Menu', callback_data: 'back_to_menu' }]);
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

    const keyboard = [];
    if (channels.length > 0) {
        channels.forEach(channel => {
            keyboard.push([{ text: `❌ ${channel}`, callback_data: `remove_channel:${channel}` }]);
        });
    } else {
        message += 'No channels added yet.';
    }

    keyboard.push([
        { text: '➕ Add a Channel', callback_data: 'add_channel' },
        { text: '✅ Set Active Channel', callback_data: 'set_active_channel' }
    ]);
    keyboard.push([{ text: '⬅️ Back to Menu', callback_data: 'back_to_menu' }]);

    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

async function handleAddChannel(chat_id: number, channel: string, env: Env) {
    if (channel && (channel.startsWith('@') || /^-100\d+$/.test(channel))) {
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

async function handleRemoveChannel(chat_id: number, channelToRemove: string, env: Env) {
    let channels: string[] = await env.KV_B.get(`channels_${chat_id}`, 'json') || [];
    channels = channels.filter(channel => channel !== channelToRemove);
    await env.KV_B.put(`channels_${chat_id}`, JSON.stringify(channels));

    const activeChannel: string | null = await env.KV_B.get(`active_channel_${chat_id}`);
    if (activeChannel === channelToRemove) {
        await env.KV_B.delete(`active_channel_${chat_id}`);
    }

    await sendTelegramMessage(chat_id, `Channel ${channelToRemove} has been removed.`, env);
    await handleChannelManagement(chat_id, env);
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
