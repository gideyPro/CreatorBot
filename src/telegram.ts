import { Env } from './index';

export async function sendTelegramMessage(chat_id: number, text: string, env: Env): Promise<boolean> {
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

export async function getChatMemberCount(chat_id: number, env: Env): Promise<number> {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/getChatMemberCount`;
    const payload = {
        chat_id: chat_id,
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
            return -1;
        }

        const data = await response.json();
        if (!data.ok) {
            console.error(`Telegram API returned ok=false:`, data);
            return -1;
        }
        return data.result;
    } catch (error) {
        console.error(`Telegram API Request Failed:`, error);
        return -1;
    }
}

export async function sendInlineKeyboardMessage(chat_id: number, text: string, keyboard: any, env: Env): Promise<boolean> {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: chat_id,
        text: text,
        reply_markup: {
            inline_keyboard: keyboard,
        },
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
