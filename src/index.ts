import { Router } from 'itty-router';
import { handleUpdate, handleGenerate } from './commands';

export interface Env {
    BOT_TOKEN: string;
    GROQ_API_KEY: string;
    KV_B: KVNamespace;
}

const router = Router();

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return router.handle(request, env, ctx);
    },
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
        const users: string[] = await env.KV_B.get('users', 'json') || [];
        for (const user of users) {
            const topics: string[] = await env.KV_B.get(`scheduled_topics_${user}`, 'json') || [];
            if (topics.length > 0) {
                const topic = topics.shift();
                await env.KV_B.put(`scheduled_topics_${user}`, JSON.stringify(topics));
                await handleGenerate(parseInt(user), topic, env);
            }
        }
    }
};

router.post('/webhook', async (request: Request, env: Env, ctx: ExecutionContext) => {
    try {
        const update = await request.json<any>();
        const chat_id = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
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
