import { Env } from './index';

export async function sendTelegramMessage(chat_id: number | string, text: string, env: Env): Promise<number | null> {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: chat_id,
        text: text,
        parse_mode: 'Markdown',
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
            return null;
        }

        const data = await response.json();
        if (!data.ok) {
            console.error(`Telegram API returned ok=false:`, data);
            return null;
        }
        return data.result.message_id;
    } catch (error) {
        console.error(`Telegram API Request Failed:`, error);
        return null;
    }
}

export async function editMessageText(chat_id: number | string, message_id: number, text: string, env: Env): Promise<boolean> {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`;
    const payload = {
        chat_id: chat_id,
        message_id: message_id,
        text: text,
        parse_mode: 'Markdown',
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

export async function deleteMessage(chat_id: number | string, message_id: number, env: Env): Promise<boolean> {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/deleteMessage`;
    const payload = {
        chat_id: chat_id,
        message_id: message_id,
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

export async function sendPhoto(chat_id: number | string, photoUrl: string, caption: string, env: Env): Promise<boolean> {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`;
    const payload = {
        chat_id: chat_id,
        photo: photoUrl,
        caption: caption,
        parse_mode: 'Markdown',
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

export async function getChatMemberCount(chat_id: number | string, env: Env): Promise<number> {
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

export async function sendInlineKeyboardMessage(chat_id: number | string, text: string, keyboard: any, env: Env): Promise<boolean> {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: chat_id,
        text: text,
        parse_mode: 'Markdown',
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
