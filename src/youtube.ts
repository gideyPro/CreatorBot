import { Env } from './index';
import { sendTelegramMessage, sendInlineKeyboardMessage, escapeHtml } from './telegram';

export interface YtSettings {
    format: 'long' | 'short' | 'both';
    privacy: string;
    titlePrefix: string;
    tags: string;
}

export interface YtJob {
    id: string;
    chat_id: number;
    topic: string;
    format: 'long' | 'short' | 'both';
    status: 'pending' | 'processing' | 'done' | 'failed';
    url?: string;
    videoId?: string;
    error?: string;
    createdAt: number;
    updatedAt: number;
}

const DEFAULT_SETTINGS: YtSettings = { format: 'both', privacy: 'private', titlePrefix: '', tags: '' };
const MAX_JOBS = 50;

export async function getYtSettings(chat_id: number, env: Env): Promise<YtSettings> {
    const raw: any = await env.KV_B.get(`yt_settings_${chat_id}`, 'json');
    return { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

export async function saveYtSettings(chat_id: number, settings: YtSettings, env: Env): Promise<void> {
    await env.KV_B.put(`yt_settings_${chat_id}`, JSON.stringify(settings));
}

export async function getYtJobs(env: Env): Promise<YtJob[]> {
    const raw: any = await env.KV_B.get('yt_jobs', 'json');
    return Array.isArray(raw) ? raw : [];
}

async function saveYtJobs(env: Env, jobs: YtJob[]): Promise<void> {
    await env.KV_B.put('yt_jobs', JSON.stringify(jobs.slice(-MAX_JOBS)));
}

export async function queueYoutubeJob(chat_id: number, topic: string, env: Env): Promise<void> {
    const jobs = await getYtJobs(env);
    const job: YtJob = {
        id: String(Date.now()),
        chat_id,
        topic,
        format: (await getYtSettings(chat_id, env)).format,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    jobs.push(job);
    await saveYtJobs(env, jobs);
    await sendTelegramMessage(chat_id, `🎬 <b>Video queued</b> for <code>${escapeHtml(topic)}</code>.\n\nThe local pipeline will render and upload it shortly.`, env);
}

export async function handleYoutube(chat_id: number, env: Env): Promise<void> {
    const s = await getYtSettings(chat_id, env);
    const keyboard = [
        [{ text: '🎬 Generate Video', callback_data: 'youtube:generate' }],
        [{ text: '📊 Job Status', callback_data: 'youtube:status' }],
        [{ text: '⚙️ Video Settings', callback_data: 'youtube:settings' }],
        [{ text: '🔑 Connect Channel', callback_data: 'youtube:connect' }],
        [{ text: '⬅️ Back to Menu', callback_data: 'menu:dashboard' }],
    ];
    const message = `
<b>📺 YouTube Studio</b>

<b>Format:</b> <code>${s.format}</code>
<b>Privacy:</b> <code>${s.privacy}</code>
<b>Title prefix:</b> <code>${s.titlePrefix ? escapeHtml(s.titlePrefix) : '—'}</code>
<b>Tags:</b> <code>${s.tags ? escapeHtml(s.tags) : '—'}</code>

<i>The Worker queues videos. Rendering and uploading run in a local pipeline on your machine — see Connect Channel.</i>
`;
    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

export async function handleYoutubeGenerate(chat_id: number, env: Env): Promise<void> {
    await env.KV_B.put(`user_state_${chat_id}`, 'awaiting_yt_topic');
    await sendTelegramMessage(chat_id, '🎬 <b>Send me the video topic</b> (or <b>/cancel</b> to stop).', env);
}

export async function handleYoutubeStatus(chat_id: number, env: Env): Promise<void> {
    const jobs = (await getYtJobs(env)).filter(j => j.chat_id === chat_id).slice(-10).reverse();
    let message = '<b>📊 YouTube Jobs</b>\n\n';
    if (jobs.length === 0) {
        message += 'No videos yet. Tap <b>Generate Video</b> to queue one.';
    } else {
        const emoji: Record<string, string> = { pending: '⏳', processing: '🎬', done: '✅', failed: '❌' };
        message += jobs.map(j => {
            const line = `${emoji[j.status] || '•'} <code>${escapeHtml(j.topic)}</code> — <b>${j.status}</b>`;
            return j.url ? `${line} · <a href="${j.url}">watch</a>` : line;
        }).join('\n');
    }
    const keyboard = [[{ text: '⬅️ Back to YouTube', callback_data: 'youtube:menu' }]];
    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

export async function handleYoutubeSettings(chat_id: number, env: Env): Promise<void> {
    const s = await getYtSettings(chat_id, env);
    const keyboard = [
        [
            { text: `📐 Format: ${s.format === 'both' ? 'both ✓' : 'both'}`, callback_data: 'youtube:set_format:both' },
            { text: `Long ${s.format === 'long' ? '✓' : ''}`, callback_data: 'youtube:set_format:long' },
            { text: `Short ${s.format === 'short' ? '✓' : ''}`, callback_data: 'youtube:set_format:short' },
        ],
        [
            { text: `🔒 ${s.privacy === 'private' ? 'private ✓' : 'private'}`, callback_data: 'youtube:set_privacy:private' },
            { text: `unlisted ${s.privacy === 'unlisted' ? '✓' : ''}`, callback_data: 'youtube:set_privacy:unlisted' },
            { text: `public ${s.privacy === 'public' ? '✓' : ''}`, callback_data: 'youtube:set_privacy:public' },
        ],
        [{ text: '🏷 Set title prefix', callback_data: 'youtube:set_prefix' }],
        [{ text: '#️⃣ Set tags', callback_data: 'youtube:set_tags' }],
        [{ text: '⬅️ Back to YouTube', callback_data: 'youtube:menu' }],
    ];
    const message = `
<b>⚙️ YouTube Settings</b>

<b>Format:</b> <code>${s.format}</code>
<b>Privacy:</b> <code>${s.privacy}</code> <i>(public requires Google app verification)</i>
<b>Title prefix:</b> <code>${s.titlePrefix ? escapeHtml(s.titlePrefix) : '—'}</code>
<b>Tags:</b> <code>${s.tags ? escapeHtml(s.tags) : '—'}</code>
`;
    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

export async function setYtSetting(chat_id: number, key: 'format' | 'privacy', value: string, env: Env): Promise<void> {
    const s = await getYtSettings(chat_id, env);
    if (key === 'format') s.format = value as YtSettings['format'];
    if (key === 'privacy') s.privacy = value;
    await saveYtSettings(chat_id, s, env);
}

export async function setYtTextSetting(chat_id: number, key: 'titlePrefix' | 'tags', value: string, env: Env): Promise<void> {
    const s = await getYtSettings(chat_id, env);
    s[key] = value;
    await saveYtSettings(chat_id, s, env);
}

export async function handleYoutubeConnect(chat_id: number, env: Env): Promise<void> {
    const message = `
<b>🔑 Connect your YouTube channel</b>

Connection happens <i>locally</i> (Google OAuth runs on your machine, not on Cloudflare).

1. Install the local pipeline and its dependencies (see the <code>youtube/README.md</code>).
2. Create a Google Cloud project, enable <b>YouTube Data API v3</b>, and create an <b>OAuth client ID</b> (Desktop app) with scope <code>youtube.upload</code>.
3. Put the client ID/secret in <code>youtube/.env</code>, then run <code>node oauth.mjs</code> — it prints a URL to open and stores the tokens.
4. Start <code>node pipeline.mjs</code> to render and upload queued videos automatically.

The bot only needs the credentials locally — nothing sensitive is stored in Cloudflare.
`;
    const keyboard = [[{ text: '⬅️ Back to YouTube', callback_data: 'youtube:menu' }]];
    await sendInlineKeyboardMessage(chat_id, message, keyboard, env);
}

export async function handleYoutubeCallback(chat_id: number, action: string, env: Env): Promise<void> {
    const [cmd, ...rest] = action.split(':');
    switch (cmd) {
        case 'menu':
            return handleYoutube(chat_id, env);
        case 'generate':
            return handleYoutubeGenerate(chat_id, env);
        case 'status':
            return handleYoutubeStatus(chat_id, env);
        case 'settings':
            return handleYoutubeSettings(chat_id, env);
        case 'connect':
            return handleYoutubeConnect(chat_id, env);
        case 'set_format':
            if (rest[0]) await setYtSetting(chat_id, 'format', rest[0], env);
            return handleYoutubeSettings(chat_id, env);
        case 'set_privacy':
            if (rest[0]) await setYtSetting(chat_id, 'privacy', rest[0], env);
            return handleYoutubeSettings(chat_id, env);
        case 'set_prefix':
            await env.KV_B.put(`user_state_${chat_id}`, 'awaiting_yt_prefix');
            await sendTelegramMessage(chat_id, '🏷 <b>Send the title prefix</b> (or <b>/cancel</b> to stop).', env);
            return;
        case 'set_tags':
            await env.KV_B.put(`user_state_${chat_id}`, 'awaiting_yt_tags');
            await sendTelegramMessage(chat_id, '#️⃣ <b>Send the tags</b> as a comma-separated list (or <b>/cancel</b> to stop).', env);
            return;
        default:
            return;
    }
}