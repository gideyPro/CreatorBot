import { Router } from 'itty-router';
import { handleUpdate, handleGenerate } from './commands';
import { setMyCommands } from './telegram';

export interface Env {
    BOT_TOKEN: string;
    GROQ_API_KEY: string;
    KV_B: KVNamespace;
    DB?: D1Database;
}

const router = Router();

async function ensureStatsTable(env: Env) {
    if (!env.DB) return;
    try {
        await env.DB.prepare(
            'CREATE TABLE IF NOT EXISTS posts (channel_id TEXT NOT NULL, post_date TEXT NOT NULL, cnt INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (channel_id, post_date))'
        ).run();
    } catch (e) {
        console.error('Failed to ensure D1 stats table:', e);
    }
}

async function registerCommandsOnce(env: Env) {
    if (await env.KV_B.get('commands_registered')) return;
    await setMyCommands(env);
    await env.KV_B.put('commands_registered', 'true');
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return router.handle(request, env, ctx);
    },
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
        await ensureStatsTable(env);
        await registerCommandsOnce(env);

        const users: string[] = await env.KV_B.get('users', 'json') || [];
        const now = Date.now();

        for (const user of users) {
            const scheduleStatus = await env.KV_B.get(`schedule_status_${user}`) || 'active';
            if (scheduleStatus !== 'active') continue;

            const activeChannel = await env.KV_B.get(`active_channel_${user}`);
            if (!activeChannel) continue;

            const topics: string[] = await env.KV_B.get(`scheduled_topics_${user}`, 'json') || [];
            if (topics.length === 0) continue;

            const nextAt = Number(await env.KV_B.get(`next_post_at_${user}`)) || now;
            if (now < nextAt) continue;

            const intervalHours = Number(await env.KV_B.get(`post_interval_hours_${user}`)) || 8;
            const topic = topics.shift();
            await env.KV_B.put(`scheduled_topics_${user}`, JSON.stringify(topics));

            await handleGenerate(parseInt(user), topic, env, true);

            const jitter = Math.floor(Math.random() * 60 * 60 * 1000);
            await env.KV_B.put(`next_post_at_${user}`, String(Date.now() + intervalHours * 3600 * 1000 + jitter));
        }
    }
};

router.post('/webhook', async (request: Request, env: Env, ctx: ExecutionContext) => {
    try {
        const update = await request.json<any>();
        const chat_id = update.message?.chat?.id || update.callback_query?.message?.chat?.id || update.channel_post?.chat?.id;
        if (chat_id) {
            let users: string[] = await env.KV_B.get('users', 'json') || [];
            if (!users.includes(chat_id.toString())) {
                users.push(chat_id.toString());
                await env.KV_B.put('users', JSON.stringify(users));
            }
        }
        ctx.waitUntil(handleUpdate(update, env, ctx));
    } catch (e) {
        console.error('Error processing webhook:', e);
    }
    return new Response('OK', { status: 200 });
});

router.get('/', () => new Response('Bot is running! ✅', { status: 200 }));

// Fallback for all other routes
router.all('*', () => new Response('Not Found.', { status: 404 }));