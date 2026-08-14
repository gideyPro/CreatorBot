import { Env } from './index';
import { generateArticle, listModels } from './groq';
import {
    sendTelegramMessage, sendTelegramMessageSafe, getChatMemberCount, sendInlineKeyboardMessage,
    sendPhotoSafe, editMessageText, deleteMessage, answerCallbackQuery, editMessageReplyMarkup,
    sanitizeHtml, escapeHtml, truncate, splitText,
} from './telegram';
import { generateImage } from './image';
import { translateText } from './translate';

const MAX_TEXT = 4000;
const MAX_CAPTION = 1000;
const MAX_PREVIEW = 3000;
const CHAT_MODEL_BLOCK = /whisper|speech|audio|stt|candy/i;
const SCHEDULE_INTERVALS: Record<string, number> = { 4: 4, 8: 8, 12: 12, 24: 24 };

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
                case '/cancel':
                    await handleCancel(chat_id, env);
                    break;
                case '/help':
                    await handleHelp(chat_id, env);
                    break;
                default:
                    await sendTelegramMessage(chat_id, 'Unknown command. Try <b>/generate &lt;topic&gt;</b>, <b>/stats</b>, or <b>/help</b>.', env);
                    break;
            }
        } else if (text.length > 0) {
            await handleMessage(chat_id, text, env);
        }
    }
}

async function handleMessage(chat_id: number, text: string, env: Env) {
    const userState = await env.KV_B.get(`user_state_${chat_id}`);

    if (userState === 'awaiting_topic') {
        await env.KV_B.delete(`user_state_${chat_id}`);
        await handleGenerate(chat_id, text, env);
    } else if (userState === 'awaiting_schedule') {
        await env.KV_B.delete(`user_state_${chat_id}`);
        const topics = text.split('\n').map(t => t.trim()).filter(t => t !== '');
        if (topics.length > 0) {
            const existing: string[] = await env.KV_B.get(`scheduled_topics_${chat_id}`, 'json') || [];
            await env.KV_B.put(`scheduled_topics_${chat_id}`, JSON.stringify([...existing, ...topics]));
            await sendTelegramMessage(chat_id, `✅ <b>${topics.length} topics added</b> to the queue.`, env);
        } else {
            await sendTelegramMessage(chat_id, 'No topics were provided.', env);
        }
        await handleScheduleManagement(chat_id, env);
    } else if (userState === 'awaiting_channel') {
        await env.KV_B.delete(`user_state_${chat_id}`);
        await handleAddChannel(chat_id, text, env);
    } else if (text.startsWith('@') || /^-100\d+$/.test(text.trim())) {
        await handleAddChannel(chat_id, text.trim(), env);
    }
}

async function handleCancel(chat_id: number, env: Env) {
    await env.KV_B.delete(`user_state_${chat_id}`);
    await env.KV_B.delete(`pending_post_${chat_id}`);
    await env.KV_B.delete(`preview_img_${chat_id}`);
    await sendTelegramMessage(chat_id, '🚫 <b>Action cancelled.</b> Send <b>/help</b> to see what I can do.', env);
}

async function handleHelp(chat_id: number, env: Env) {
    const help = `
<b>🤖 Creator Bot help</b>

<b>/generate &lt;topic&gt;</b> — Generate a post
<b>/addchannel &lt;@handle&gt;</b> — Add a channel to post to
<b>/stats</b> — Channel stats
<b>/settings</b> — Model, image &amp; translation options
<b>/cancel</b> — Stop the current action

💡 <i>Tip:</i> you can also tap the buttons in the main menu.
`;
    await sendTelegramMessage(chat_id, help, env);
}

async function handleGenerateArticle(chat_id: number, env: Env) {
    await env.KV_B.put(`user_state_${chat_id}`, 'awaiting_topic');
    await sendTelegramMessage(chat_id, '✍️ <b>Send me the topic</b> for your post (or <b>/cancel</b> to stop).', env);
}

export async function handleGenerate(chat_id: number, prompt: string, env: Env, direct: boolean = false) {
    if (!prompt) {
        await sendTelegramMessage(chat_id, '⚠️ Please provide a prompt after <b>/generate</b>.', env);
        return;
    }

    const statusMessageId = await sendTelegramMessage(chat_id, '⏳ <i>Generating article…</i>', env);
    if (!statusMessageId) return;

    const selectedModel = await env.KV_B.get(`model_${chat_id}`) || 'llama3-8b-8192';
    const activeChannel: string | null = await env.KV_B.get(`active_channel_${chat_id}`);
    const imageEnabled = (await env.KV_B.get(`image_generation_${chat_id}`) || 'enabled') === 'enabled';
    const translate = await env.KV_B.get(`translate_${chat_id}`) || 'disabled';

    const formattedPrompt = `
Generate a Telegram post about: "${prompt}".

**Formatting Rules:**
- Use Telegram-compatible HTML formatting ONLY.
- Use <b>bold</b> for titles and key phrases.
- Use <i>italic</i> for emphasis.
- Use <code>code</code> for technical terms.
- Do NOT include any external links.
- Do NOT use markdown such as **, *, #, ---, or tables.
- Use emojis to make it engaging.
`;

    const articleResult = await generateArticle(env.GROQ_API_KEY, formattedPrompt, selectedModel);
    if (!articleResult.success) {
        await editMessageText(chat_id, statusMessageId, `❌ <b>Generation failed</b>\n\n<code>${escapeHtml(truncate(articleResult.content, 800))}</code>`, env);
        return;
    }

    let finalContent = articleResult.content;
    if (translate === 'enabled') {
        const translationResult = await translateText(finalContent, 'am', env);
        if (translationResult.success) {
            finalContent = translationResult.content;
        } else {
            await sendTelegramMessage(chat_id, `⚠️ Translation failed: <code>${escapeHtml(translationResult.content)}</code>`, env);
        }
    }

    finalContent = sanitizeHtml(finalContent);

    let imageUrl: string | undefined;
    if (imageEnabled) {
        await editMessageText(chat_id, statusMessageId, '🎨 <i>Generating image…</i>', env);
        const imagePromptResult = await generateArticle(env.GROQ_API_KEY, `Generate a short, descriptive image prompt from the following article:\n\n${finalContent}`, selectedModel);
        if (imagePromptResult.success) {
            const imageResult = await generateImage(imagePromptResult.content);
            if (imageResult.success && imageResult.imageUrl) {
                imageUrl = imageResult.imageUrl;
            } else {
                await sendTelegramMessage(chat_id, `⚠️ Image generation failed: <code>${escapeHtml(imageResult.error || 'unknown error')}</code>. Posting text-only.`, env);
            }
        } else {
            await sendTelegramMessage(chat_id, `⚠️ Image prompt failed: <code>${escapeHtml(imagePromptResult.content)}</code>. Posting text-only.`, env);
        }
    }

    await deleteMessage(chat_id, statusMessageId, env);

    if (direct) {
        const ok = await postContent(chat_id, activeChannel, finalContent, imageUrl, env);
        if (ok) {
            await recordStat(activeChannel || chat_id, env);
            if (activeChannel) {
                await sendTelegramMessage(chat_id, `✅ <b>Posted to ${escapeHtml(activeChannel)}.</b>`, env);
            }
        }
        return;
    }

    await env.KV_B.put(`pending_post_${chat_id}`, JSON.stringify({ content: finalContent, imageUrl: imageUrl || '', topic: prompt }));

    if (imageUrl) {
        const previewImgId = await sendPhotoSafe(chat_id, imageUrl, '🖼 <b>Preview image</b>', env);
        if (previewImgId) await env.KV_B.put(`preview_img_${chat_id}`, String(previewImgId));
    }

    const isLong = finalContent.length > MAX_PREVIEW;
    const previewText = `<b>📝 Preview</b>\n\n${sanitizeHtml(truncate(finalContent, MAX_PREVIEW))}${isLong ? '\n\n<i>…(full content is staged for posting)</i>' : ''}`;
    const keyboard = [
        [{ text: '✅ Post', callback_data: 'preview:post' }],
        [{ text: '🔄 Regenerate', callback_data: 'preview:regen' }],
        [{ text: '📝 New topic', callback_data: 'preview:new' }],
        [{ text: '🚫 Cancel', callback_data: 'preview:discard' }],
    ];
    await sendInlineKeyboardMessage(chat_id, previewText, keyboard, env);
}

async function postContent(chat_id: number, activeChannel: string | null, content: string, imageUrl: string | undefined, env: Env): Promise<boolean> {
    const target = activeChannel || chat_id;
    let sentAny = false;

    if (imageUrl) {
        const caption = sanitizeHtml(truncate(content, MAX_CAPTION)) + (content.length > MAX_CAPTION ? '\n\n<i>…continued below</i>' : '');
        const photoId = await sendPhotoSafe(target, imageUrl, caption, env);
        if (photoId !== null) sentAny = true;

        if (content.length > MAX_CAPTION) {
            const rest = content.slice(MAX_CAPTION);
            for (const chunk of splitText(rest, MAX_TEXT)) {
                const id = await sendTelegramMessageSafe(target, sanitizeHtml(chunk), env);
                if (id !== null) sentAny = true;
            }
        }
    } else {
        for (const chunk of splitText(content, MAX_TEXT)) {
            const id = await sendTelegramMessageSafe(target, sanitizeHtml(chunk), env);
            if (id !== null) sentAny = true;
        }
    }

    return sentAny;
}

async function onPreviewPost(chat_id: number, env: Env, cbId: string) {
    const pending = await env.KV_B.get(`pending_post_${chat_id}`, 'json');
    if (!pending) {
        await answerCallbackQuery(cbId, env, 'No staged post found.');
        return;
    }

    const activeChannel: string | null = await env.KV_B.get(`active_channel_${chat_id}`);
    const ok = await postContent(chat_id, activeChannel, pending.content, pending.imageUrl || undefined, env);

    await env.KV_B.delete(`pending_post_${chat_id}`);
    const previewImgId = await env.KV_B.get(`preview_img_${chat_id}`);
    if (previewImgId) {
        await deleteMessage(chat_id, parseInt(previewImgId), env);
        await env.KV_B.delete(`preview_img_${chat_id}`);
    }

    if (ok) {
        await recordStat(activeChannel || chat_id, env);
        const status = activeChannel
            ? `✅ <b>Posted to ${escapeHtml(activeChannel)}.</b>`
            : '✅ <b>Posted.</b> <i>Tip:</i> set an active channel in Channel Management to publish to your audience.';
        await answerCallbackQuery(cbId, env, 'Posted ✅');
        await sendTelegramMessage(chat_id, status, env);
    } else {
        await answerCallbackQuery(cbId, env, 'Posting failed.');
        await sendTelegramMessage(chat_id, '❌ <b>Posting failed.</b> The bot may not be an admin of the channel, or the content was rejected.', env);
    }
}

async function onPreviewRegen(chat_id: number, env: Env, cbId: string) {
    const pending = await env.KV_B.get(`pending_post_${chat_id}`, 'json');
    if (!pending) {
        await answerCallbackQuery(cbId, env, 'No staged post found.');
        return;
    }
    const previewImgId = await env.KV_B.get(`preview_img_${chat_id}`);
    if (previewImgId) {
        await deleteMessage(chat_id, parseInt(previewImgId), env);
        await env.KV_B.delete(`preview_img_${chat_id}`);
    }
    await env.KV_B.delete(`pending_post_${chat_id}`);
    await answerCallbackQuery(cbId, env, 'Regenerating…');
    await handleGenerate(chat_id, pending.topic, env);
}

async function onPreviewNew(chat_id: number, env: Env, cbId: string) {
    await env.KV_B.delete(`pending_post_${chat_id}`);
    const previewImgId = await env.KV_B.get(`preview_img_${chat_id}`);
    if (previewImgId) {
        await deleteMessage(chat_id, parseInt(previewImgId), env);
        await env.KV_B.delete(`preview_img_${chat_id}`);
    }
    await env.KV_B.put(`user_state_${chat_id}`, 'awaiting_topic');
    await answerCallbackQuery(cbId, env, 'Send a new topic ✍️');
    await sendTelegramMessage(chat_id, '✍️ <b>Send me the topic</b> for your post (or <b>/cancel</b> to stop).', env);
}

async function onPreviewDiscard(chat_id: number, env: Env, cbId: string) {
    await env.KV_B.delete(`pending_post_${chat_id}`);
    const previewImgId = await env.KV_B.get(`preview_img_${chat_id}`);
    if (previewImgId) {
        await deleteMessage(chat_id, parseInt(previewImgId), env);
        await env.KV_B.delete(`preview_img_${chat_id}`);
    }
    await answerCallbackQuery(cbId, env, 'Cancelled');
}

async function handleStats(chat_id: number, env: Env) {
    const activeChannel: string | null = await env.KV_B.get(`active_channel_${chat_id}`);
    const target = activeChannel || String(chat_id);
    const memberCount = await getChatMemberCount(target, env);
    const queued = (await env.KV_B.get(`scheduled_topics_${chat_id}`, 'json') || []).length;

    let total = 0;
    let today = 0;
    const date = new Date().toISOString().slice(0, 10);

    if (env.DB) {
        try {
            const totalRow: any = await env.DB.prepare('SELECT SUM(cnt) AS total FROM posts WHERE channel_id = ?1').bind(target).first();
            total = totalRow?.total || 0;
            const todayRow: any = await env.DB.prepare('SELECT cnt FROM posts WHERE channel_id = ?1 AND post_date = ?2').bind(target, date).first();
            today = todayRow?.cnt || 0;
        } catch (e) {
            console.error('D1 stats query failed:', e);
        }
    } else {
        total = Number(await env.KV_B.get(`stat_total_${target}`)) || 0;
        today = Number(await env.KV_B.get(`stat_today_${target}_${date}`)) || 0;
    }

    let membersLine: string;
    if (memberCount !== -1) {
        membersLine = `👥 <b>Members:</b> ${memberCount}`;
    } else {
        membersLine = '👥 <i>Members unavailable (add a channel first)</i>';
    }

    const stats = `
<b>📊 Statistics</b>
<i>Target: ${escapeHtml(target)}</i>

${membersLine}
📅 <b>Posts today:</b> ${today}
🗂 <b>Posts total:</b> ${total}
🗓 <b>Queued topics:</b> ${queued}
`;
    const keyboard = [
        [{ text: '📝 Generate Article', callback_data: 'generate_article' }],
        [{ text: '⬅️ Back to Menu', callback_data: 'menu:dashboard' }]
    ];
    await sendInlineKeyboardMessage(chat_id, stats, keyboard, env);
}

async function handleStart(chat_id: number, env: Env) {
    await env.KV_B.delete(`user_state_${chat_id}`);
    await env.KV_B.delete(`pending_post_${chat_id}`);
    await sendDashboard(chat_id, env);
}

async function sendDashboard(chat_id: number, env: Env) {
    const welcomeMessage = `
<b>Welcome to the Creator Bot! 🚀</b>

I generate posts, images and help you manage your Telegram channels automatically.
`;
    const keyboard = [
        [{ text: '📝 Generate Article', callback_data: 'generate_article' }],
        [{ text: '📊 Statistics', callback_data: 'stats' }],
        [{ text: '🗓 Schedule Management', callback_data: 'schedule_management' }],
        [{ text: '📺 Channel Management', callback_data: 'channel_management' }],
        [{ text: '⚙️ Settings', callback_data: 'settings' }],
    ];
    await sendInlineKeyboardMessage(chat_id, welcomeMessage, keyboard, env);
}

async function handleSettings(chat_id: number, env: Env) {
    const keyboard = [
        [{ text: '🧠 Model Settings', callback_data: 'model_settings' }],
        [{ text: '🖼 Image Generation', callback_data: 'image_generation_settings' }],
        [{ text: '🌐 Translate to Amharic', callback_data: 'translate_settings' }],
        [{ text: '📺 Channel Management', callback_data: 'channel_management' }],
        [{ text: '⬅️ Back to Menu', callback_data: 'menu:dashboard' }]
    ];
    await sendInlineKeyboardMessage(chat_id, '⚙️ <b>Settings</b>\n\nChoose what to adjust:', keyboard, env);
}

async function handleCallbackQuery(callbackQuery: any, env: Env, ctx: ExecutionContext) {
    const chat_id = callbackQuery.message.chat.id;
    const data: string = callbackQuery.data;
    const cbId: string = callbackQuery.id;

    await answerCallbackQuery(cbId, env);

    if (data.startsWith('menu:')) {
        await openMenu(chat_id, data.substring('menu:'.length), env);
    } else if (data.startsWith('set_model:')) {
        const model = data.substring('set_model:'.length);
        await env.KV_B.put(`model_${chat_id}`, model);
        await sendTelegramMessage(chat_id, `🧠 <b>Model set to</b> <code>${escapeHtml(model)}</code>.`, env);
    } else if (data === 'model_settings') {
        await handleModelSettings(chat_id, env);
    } else if (data === 'channel_management') {
        await handleChannelManagement(chat_id, env);
    } else if (data === 'add_channel_start') {
        await env.KV_B.put(`user_state_${chat_id}`, 'awaiting_channel');
        await sendTelegramMessage(chat_id, '📺 <b>Send me the channel</b> as <code>@handle</code> or numeric id (or <b>/cancel</b> to stop).', env);
    } else if (data === 'set_active_channel') {
        await handleSetActiveChannel(chat_id, env);
    } else if (data.startsWith('remove_channel:')) {
        const channelToRemove = data.substring('remove_channel:'.length);
        await confirmRemoveChannel(chat_id, channelToRemove, env);
    } else if (data.startsWith('confirm_remove:')) {
        const channelToRemove = data.substring('confirm_remove:'.length);
        await handleRemoveChannel(chat_id, channelToRemove, env);
    } else if (data === 'generate_article') {
        await handleGenerateArticle(chat_id, env);
    } else if (data === 'settings') {
        await handleSettings(chat_id, env);
    } else if (data === 'stats') {
        await handleStats(chat_id, env);
    } else if (data.startsWith('set_active:')) {
        const channel = data.substring('set_active:'.length);
        await env.KV_B.put(`active_channel_${chat_id}`, channel);
        await sendTelegramMessage(chat_id, `✅ <b>Active channel set to</b> ${escapeHtml(channel)}.`, env);
        await handleChannelManagement(chat_id, env);
    } else if (data === 'image_generation_settings') {
        await handleImageGenerationSettings(chat_id, env);
    } else if (data.startsWith('set_image_generation:')) {
        const imageGeneration = data.substring('set_image_generation:'.length);
        await env.KV_B.put(`image_generation_${chat_id}`, imageGeneration);
        await handleImageGenerationSettings(chat_id, env);
    } else if (data === 'translate_settings') {
        await handleTranslateSettings(chat_id, env);
    } else if (data.startsWith('set_translate:')) {
        const translate = data.substring('set_translate:'.length);
        await env.KV_B.put(`translate_${chat_id}`, translate);
        await handleTranslateSettings(chat_id, env);
    } else if (data === 'schedule_management') {
        await handleScheduleManagement(chat_id, env);
    } else if (data === 'add_scheduled_topics') {
        await env.KV_B.put(`user_state_${chat_id}`, 'awaiting_schedule');
        await sendTelegramMessage(chat_id, '🗓 <b>Send a list of topics</b>, one per line (or <b>/cancel</b> to stop):', env);
    } else if (data === 'view_scheduled_topics') {
        await handleViewScheduledTopics(chat_id, env);
    } else if (data.startsWith('toggle_schedule:')) {
        const newStatus = data.substring('toggle_schedule:'.length);
        await env.KV_B.put(`schedule_status_${chat_id}`, newStatus);
        await handleScheduleManagement(chat_id, env);
    } else if (data === 'clear_schedule') {
        await confirmClearSchedule(chat_id, env);
    } else if (data === 'confirm_clear_schedule') {
        await env.KV_B.delete(`scheduled_topics_${chat_id}`);
        await sendTelegramMessage(chat_id, '🗑 <b>Schedule cleared.</b>', env);
        await handleScheduleManagement(chat_id, env);
    } else if (data.startsWith('interval:')) {
        const hours = SCHEDULE_INTERVALS[data.substring('interval:'.length)];
        if (hours) {
            await env.KV_B.put(`post_interval_hours_${chat_id}`, String(hours));
            await handleScheduleManagement(chat_id, env);
        }
    } else if (data === 'preview:post') {
        await onPreviewPost(chat_id, env, cbId);
    } else if (data === 'preview:regen') {
        await onPreviewRegen(chat_id, env, cbId);
    } else if (data === 'preview:new') {
        await onPreviewNew(chat_id, env, cbId);
    } else if (data === 'preview:discard') {
        await onPreviewDiscard(chat_id, env, cbId);
    }
}

async function openMenu(chat_id: number, menu: string, env: Env) {
    switch (menu) {
        case 'settings': return handleSettings(chat_id, env);
        case 'model': return handleModelSettings(chat_id, env);
        case 'image': return handleImageGenerationSettings(chat_id, env);
        case 'translate': return handleTranslateSettings(chat_id, env);
        case 'schedule': return handleScheduleManagement(chat_id, env);
        case 'channel': return handleChannelManagement(chat_id, env);
        case 'stats': return handleStats(chat_id, env);
        default: return sendDashboard(chat_id, env);
    }
}

async function confirmClearSchedule(chat_id: number, env: Env) {
    const keyboard = [
        [{ text: '🗑 Yes, clear it', callback_data: 'confirm_clear_schedule' }],
        [{ text: '⬅️ Back', callback_data: 'schedule_management' }]
    ];
    await sendInlineKeyboardMessage(chat_id, '⚠️ <b>Clear the entire schedule?</b>', keyboard, env);
}

async function confirmRemoveChannel(chat_id: number, channel: string, env: Env) {
    const keyboard = [
        [{ text: '🗑 Yes, remove it', callback_data: `confirm_remove:${channel}` }],
        [{ text: '⬅️ Back', callback_data: 'channel_management' }]
    ];
    await sendInlineKeyboardMessage(chat_id, `⚠️ <b>Remove channel ${escapeHtml(channel)}?</b>`, keyboard, env);
}

async function handleViewScheduledTopics(chat_id: number, env: Env) {
    const scheduledTopics: string[] = await env.KV_B.get(`scheduled_topics_${chat_id}`, 'json') || [];
    let message = '<b>🗓 Scheduled Topics</b>\n\n';
    if (scheduledTopics.length > 0) {
        message += scheduledTopics.map((topic, index) => `<code>${index + 1}.</code> ${escapeHtml(topic)}`).join('\n');
    } else {
        message += 'No topics are scheduled. Use <b>Add Topics</b> to fill the queue.';
    }
    const keyboard = [[{ text: '⬅️ Back to Schedule', callback_data: 'schedule_management' }]];
    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

async function handleScheduleManagement(chat_id: number, env: Env) {
    const scheduledTopics: string[] = await env.KV_B.get(`scheduled_topics_${chat_id}`, 'json') || [];
    const scheduleStatus = await env.KV_B.get(`schedule_status_${chat_id}`) || 'active';
    const interval = await env.KV_B.get(`post_interval_hours_${chat_id}`) || '8';

    const message = `
<b>🗓 Schedule Management</b>

<b>Status:</b> <code>${scheduleStatus}</code>
<b>Interval:</b> every ${interval}h
<b>Topics in Queue:</b> <code>${scheduledTopics.length}</code>

The bot posts one topic automatically whenever the interval elapses.
`;
    const keyboard = [
        [{ text: '➕ Add Topics', callback_data: 'add_scheduled_topics' }],
        [{ text: '📄 View Topics', callback_data: 'view_scheduled_topics' }],
        [
            { text: '⏱ 4h', callback_data: 'interval:4' },
            { text: '8h', callback_data: 'interval:8' },
            { text: '12h', callback_data: 'interval:12' },
            { text: '24h', callback_data: 'interval:24' },
        ],
        [{ text: `⏯️ ${scheduleStatus === 'active' ? 'Pause' : 'Resume'} Schedule`, callback_data: `toggle_schedule:${scheduleStatus === 'active' ? 'paused' : 'active'}` }],
        [{ text: '🗑️ Clear Schedule', callback_data: 'clear_schedule' }],
        [{ text: '⬅️ Back to Menu', callback_data: 'menu:dashboard' }]
    ];
    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

async function handleImageGenerationSettings(chat_id: number, env: Env) {
    const imageGeneration = await env.KV_B.get(`image_generation_${chat_id}`) || 'enabled';
    const message = `
<b>🖼 Image Generation</b>

<b>Status:</b> <code>${imageGeneration}</code>
When enabled, every post includes an AI-generated image.
`;
    const keyboard = [
        [{ text: '✅ Enable', callback_data: 'set_image_generation:enabled' }, { text: '🚫 Disable', callback_data: 'set_image_generation:disabled' }],
        [{ text: '⬅️ Back to Settings', callback_data: 'menu:settings' }]
    ];
    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

async function handleTranslateSettings(chat_id: number, env: Env) {
    const translate = await env.KV_B.get(`translate_${chat_id}`) || 'disabled';
    const message = `
<b>🌐 Translate to Amharic</b>

<b>Status:</b> <code>${translate}</code>
When enabled, generated posts are translated before publishing.
`;
    const keyboard = [
        [{ text: '✅ Enable', callback_data: 'set_translate:enabled' }, { text: '🚫 Disable', callback_data: 'set_translate:disabled' }],
        [{ text: '⬅️ Back to Settings', callback_data: 'menu:settings' }]
    ];
    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

async function handleModelSettings(chat_id: number, env: Env) {
    const models = (await listModels(env.GROQ_API_KEY)).filter((m: any) => !CHAT_MODEL_BLOCK.test(m.id)).slice(0, 12);
    const current = await env.KV_B.get(`model_${chat_id}`) || 'llama3-8b-8192';

    if (models.length > 0) {
        const keyboard = models.map((model: any) => ([{
            text: `🧠 ${model.id}${model.id === current ? ' ✓' : ''}`,
            callback_data: `set_model:${model.id}`,
        }]));
        keyboard.push([{ text: '⬅️ Back to Settings', callback_data: 'menu:settings' }]);
        await sendInlineKeyboardMessage(chat_id, `Please select a model.\n\n<b>Current:</b> <code>${escapeHtml(current)}</code>`, keyboard, env);
    } else {
        await sendTelegramMessage(chat_id, '⚠️ Could not retrieve models from Groq. Check your API key.', env);
    }
}

async function handleChannelManagement(chat_id: number, env: Env) {
    const channels: string[] = await env.KV_B.get(`channels_${chat_id}`, 'json') || [];
    const activeChannel: string = await env.KV_B.get(`active_channel_${chat_id}`) || 'Not set';

    let message = `
<b>📺 Channel Management</b>

<b>Active Channel:</b> <code>${escapeHtml(activeChannel)}</code>

<b>Registered Channels:</b>
`;
    if (channels.length === 0) {
        message += '\n<i>No channels yet. Tap <b>Add a Channel</b> and send me <code>@handle</code> or a numeric id.</i>';
    } else {
        message += channels.map(channel => ` • ${escapeHtml(channel)}`).join('\n');
    }

    const keyboard: any = [];
    channels.forEach(channel => {
        keyboard.push([{ text: `❌ Remove ${channel}`, callback_data: `remove_channel:${channel}` }]);
    });
    keyboard.push([
        { text: '➕ Add a Channel', callback_data: 'add_channel_start' },
        { text: '✅ Set Active Channel', callback_data: 'set_active_channel' }
    ]);
    keyboard.push([{ text: '⬅️ Back to Menu', callback_data: 'menu:dashboard' }]);

    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

async function handleAddChannel(chat_id: number, channel: string, env: Env) {
    if (channel && (channel.startsWith('@') || /^-100\d+$/.test(channel))) {
        const channels: string[] = await env.KV_B.get(`channels_${chat_id}`, 'json') || [];
        if (!channels.includes(channel)) {
            channels.push(channel);
            await env.KV_B.put(`channels_${chat_id}`, JSON.stringify(channels));
            await sendTelegramMessage(chat_id, `✅ <b>Channel ${escapeHtml(channel)} added.</b>`, env);
        } else {
            await sendTelegramMessage(chat_id, `ℹ️ <b>${escapeHtml(channel)}</b> is already registered.`, env);
        }
    } else {
        await sendTelegramMessage(chat_id, '⚠️ Invalid channel format. Use <code>@channel_id</code> or a numeric id like <code>-100…</code>.', env);
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

    await sendTelegramMessage(chat_id, `🗑 <b>${escapeHtml(channelToRemove)}</b> removed.`, env);
    await handleChannelManagement(chat_id, env);
}

async function handleSetActiveChannel(chat_id: number, env: Env) {
    const channels: string[] = await env.KV_B.get(`channels_${chat_id}`, 'json') || [];
    if (channels.length > 0) {
        const keyboard = channels.map(channel => ([{
            text: `✅ ${channel}`,
            callback_data: `set_active:${channel}`,
        }]));
        keyboard.push([{ text: '⬅️ Back to Channels', callback_data: 'channel_management' }]);
        await sendInlineKeyboardMessage(chat_id, 'Please select an active channel:', keyboard, env);
    } else {
        await sendTelegramMessage(chat_id, '⚠️ No channels registered. Add one first via <b>/addchannel</b>.', env);
    }
}

async function recordStat(chat_id: number | string, env: Env) {
    const date = new Date().toISOString().slice(0, 10);
    const target = String(chat_id);

    if (env.DB) {
        try {
            await env.DB.prepare(
                'INSERT INTO posts (channel_id, post_date, cnt) VALUES (?1, ?2, 1) ON CONFLICT (channel_id, post_date) DO UPDATE SET cnt = cnt + 1'
            ).bind(target, date).run();
            return;
        } catch (e) {
            console.error('D1 stat write failed, falling back to KV:', e);
        }
    }

    const todayKey = `stat_today_${target}_${date}`;
    const totalKey = `stat_total_${target}`;
    await env.KV_B.put(todayKey, String((Number(await env.KV_B.get(todayKey)) || 0) + 1));
    await env.KV_B.put(totalKey, String((Number(await env.KV_B.get(totalKey)) || 0) + 1));
}