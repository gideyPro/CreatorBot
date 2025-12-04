import { Router } from 'itty-router';
import { handleUpdate } from './commands';

export interface Env {
    BOT_TOKEN: string;
    GROQ_API_KEY: string;
}

const router = Router();

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return router.handle(request, env, ctx);
    },
};

router.post('/webhook', async (request: Request, env: Env) => {
    try {
        const update = await request.json<any>();
        await handleUpdate(update, env);
    } catch (e) {
        console.error('Error processing webhook:', e);
    }
    return new Response('OK', { status: 200 });
});

router.get('/', () => new Response('Bot is running! ✅', { status: 200 }));

// Fallback for all other routes
router.all('*', () => new Response('Not Found.', { status: 404 }));
