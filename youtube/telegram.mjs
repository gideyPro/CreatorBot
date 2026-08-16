import { CFG } from './config.mjs';

async function tg(method, payload) {
    if (!CFG.BOT_TOKEN) throw new Error('BOT_TOKEN not set');
    const res = await fetch(`https://api.telegram.org/bot${CFG.BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Telegram ${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram ${method}: ${JSON.stringify(data)}`);
    return data.result;
}

export async function sendTelegramMessage(chatId, text) {
    return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

export async function notifyChat(chatId, html) {
    if (!chatId) return;
    try {
        await sendTelegramMessage(chatId, html);
    } catch (e) {
        console.error('Telegram notify failed:', e.message);
    }
}