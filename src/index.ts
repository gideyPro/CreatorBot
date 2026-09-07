import { Router } from 'itty-router';
import { handleUpdate, handleGenerate } from './commands';
import { setMyCommands } from './telegram';
import { handleAgentCron } from './agent';

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
        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS post_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                message_id INTEGER,
                post_date TEXT NOT NULL,
                topic TEXT,
                content_type TEXT,
                views INTEGER DEFAULT 0,
                member_count_at_post INTEGER,
                recorded_at TEXT NOT NULL
            )`
        ).run();
        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS channel_daily (
                channel_id TEXT NOT NULL,
                snapshot_date TEXT NOT NULL,
                member_count INTEGER,
                total_views INTEGER,
                posts_count INTEGER,
                PRIMARY KEY (channel_id, snapshot_date)
            )`
        ).run();
        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                goal_text TEXT NOT NULL,
                target_subscribers INTEGER,
                target_days INTEGER,
                status TEXT DEFAULT 'active',
                created_at TEXT NOT NULL,
                completed_at TEXT
            )`
        ).run();
        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS weekly_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                goal_id INTEGER,
                week_start TEXT NOT NULL,
                plan_json TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                performance_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (goal_id) REFERENCES goals(id)
            )`
        ).run();
    } catch (e) {
        console.error('Failed to ensure D1 tables:', e);
    }
}

async function registerCommandsOnce(env: Env) {
    if (await env.KV_B.get('commands_registered')) return;
    await setMyCommands(env);
    await env.KV_B.put('commands_registered', 'true');
}

async function safeJsonList(env: Env, key: string): Promise<string[]> {
    try {
        const val = await env.KV_B.get(key, 'json');
        return Array.isArray(val) ? val : [];
    } catch (e) {
        console.error(`Failed to read KV list for ${key}:`, e);
        return [];
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return router.handle(request, env, ctx);
    },
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
        await ensureStatsTable(env);
        await registerCommandsOnce(env);

        const users = await safeJsonList(env, 'users');
        if (users.length === 0) return;
        const now = Date.now();

        for (const user of users) {
            try {
                const scheduleStatus = await env.KV_B.get(`schedule_status_${user}`) || 'active';
                if (scheduleStatus !== 'active') continue;

                const activeChannel = await env.KV_B.get(`active_channel_${user}`);
                if (!activeChannel) continue;

                const topics = await safeJsonList(env, `scheduled_topics_${user}`);
                if (topics.length === 0) continue;

                const intervalHours = Number(await env.KV_B.get(`post_interval_hours_${user}`)) || 8;

                const rawNext = await env.KV_B.get(`next_post_at_${user}`);
                const nextAt = rawNext === null
                    ? now + intervalHours * 3600 * 1000 + Math.floor(Math.random() * 60 * 60 * 1000)
                    : Number(rawNext) || now;
                if (now < nextAt) continue;

                const topic = topics[0];
                const posted = await handleGenerate(parseInt(user), topic, env, true);
                if (!posted) continue;

                topics.shift();
                await env.KV_B.put(`scheduled_topics_${user}`, JSON.stringify(topics));

                const jitter = Math.floor(Math.random() * 60 * 60 * 1000);
                await env.KV_B.put(`next_post_at_${user}`, String(Date.now() + intervalHours * 3600 * 1000 + jitter));
            } catch (e) {
                console.error(`Scheduled post failed for user ${user}:`, e);
            }
        }

        await handleAgentCron(env);
    }
};

router.post('/webhook', async (request: Request, env: Env, ctx: ExecutionContext) => {
    try {
        const update = await request.json<any>();
        const chat_id = update.message?.chat?.id || update.callback_query?.message?.chat?.id || update.channel_post?.chat?.id;
        if (chat_id) {
            const users = await safeJsonList(env, 'users');
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