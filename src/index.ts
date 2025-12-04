import { Router } from 'itty-router';

export interface Env {
    BOT_TOKEN: string;
}

const router = Router();

async function sendTelegramMessage(chat_id: number, text: string, env: Env): Promise<boolean> {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: chat_id,
        text: text,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Telegram API Error: ${response.status} - ${errorText}`);
            return false;
        }

        const data = await response.json();
        if (!data.ok) {
            console.error(`Telegram API returned ok=false:`, data);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`Telegram API Request Failed:`, error);
        return false;
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return router.handle(request, env, ctx);
    },
};

router.post('/webhook', async (request: Request, env: Env) => {
    try {
        const update = await request.json<any>();

        if (update.message) {
            const chat_id = update.message.chat.id;
            await sendTelegramMessage(chat_id, "Hello", env);
        }
    } catch (e) {
        console.error('Error processing webhook:', e);
    }
    return new Response('OK', { status: 200 });
});

router.get('/', () => new Response('Bot is running! ✅', { status: 200 }));

// Fallback for all other routes
router.all('*', () => new Response('Not Found.', { status: 404 }));
