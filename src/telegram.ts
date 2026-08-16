import { Env } from './index';

const TG_URL = 'https://api.telegram.org/bot';

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function sanitizeHtml(text: string): string {
    let t = escapeHtml(text);
    t = t.replace(/&lt;br\s*\/?&gt;/gi, '\n');
    t = t.replace(/&lt;\/?(p|li|ul|ol|blockquote|div|span)&gt;/gi, '\n');
    t = t.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
    t = t.replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>');
    t = t.replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>');
    t = t.replace(/&lt;pre&gt;/g, '').replace(/&lt;\/pre&gt;/g, '');
    return t;
}

export function splitText(text: string, max = 4000): string[] {
    const chunks: string[] = [];
    let rest = text;
    while (rest.length > max) {
        let cut = rest.lastIndexOf('\n', max);
        if (cut < max / 2) cut = max;
        chunks.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
    }
    if (rest.length > 0) chunks.push(rest);
    return chunks;
}

export function truncate(text: string, max: number, suffix = '…'): string {
    if (text.length <= max) return text;
    return text.slice(0, max - suffix.length) + suffix;
}

export function convertMarkdownToHtml(text: string): string {
    let t = text
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/__([^_\n]+)__/g, '<b>$1</b>')
        .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
        .replace(/_([^_\n]+)_/g, '<i>$1</i>')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    t = t.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
    t = t.replace(/^\s*(---+|\*\*\*+|___+)\s*$/gm, '\n');
    t = t
        .replace(/<h[1-6]>/g, '<b>').replace(/<\/h[1-6]>/g, '</b>')
        .replace(/<strong>/g, '<b>').replace(/<\/strong>/g, '</b>')
        .replace(/<em>/g, '<i>').replace(/<\/em>/g, '</i>')
        .replace(/<ul>/g, '\n').replace(/<\/ul>/g, '\n')
        .replace(/<li>/g, '\n• ').replace(/<\/li>/g, '')
        .replace(/<p>/g, '\n').replace(/<\/p>/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<a href="[^"]*">/g, '').replace(/<\/a>/g, '');
    return t;
}

export function closeOpenTags(text: string): string {
    let out = text;
    out = out.replace(/<[a-zA-Z\/]*$/, '');
    const pairs: Array<[string, string]> = [
        ['b', '</b>'],
        ['i', '</i>'],
        ['code', '</code>'],
    ];
    for (const [open, close] of pairs) {
        const opens = (out.match(new RegExp(`<${open}>`, 'g')) || []).length;
        const closes = (out.match(new RegExp(`</${open}>`, 'g')) || []).length;
        const diff = opens - closes;
        if (diff > 0) out += close.repeat(diff);
    }
    return out;
}

export function cleanTruncated(text: string): string {
    return closeOpenTags(text);
}

async function tgCall(method: string, payload: any, env: Env): Promise<any> {
    const url = `${TG_URL}${env.BOT_TOKEN}/${method}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            console.error(`Telegram API Error: ${method} ${response.status} - ${await response.text()}`);
            return null;
        }
        const data = await response.json();
        if (!data.ok) {
            console.error(`Telegram API ok=false: ${method}`, data);
            return null;
        }
        return data.result;
    } catch (error) {
        console.error(`Telegram API Request Failed: ${method}`, error);
        return null;
    }
}

export async function sendTelegramMessage(chat_id: number | string, text: string, env: Env): Promise<number | null> {
    const result = await tgCall('sendMessage', { chat_id, text, parse_mode: 'HTML' }, env);
    return result?.message_id ?? null;
}

export async function sendTelegramMessageSafe(chat_id: number | string, text: string, env: Env): Promise<number | null> {
    const htmlId = await sendTelegramMessage(chat_id, text, env);
    if (htmlId !== null) return htmlId;
    return sendTelegramMessagePlain(chat_id, text, env);
}

export async function sendTelegramMessagePlain(chat_id: number | string, text: string, env: Env): Promise<number | null> {
    const result = await tgCall('sendMessage', { chat_id, text }, env);
    return result?.message_id ?? null;
}

export async function editMessageText(chat_id: number | string, message_id: number, text: string, env: Env): Promise<boolean> {
    const result = await tgCall('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML' }, env);
    return result !== null;
}

export async function deleteMessage(chat_id: number | string, message_id: number, env: Env): Promise<boolean> {
    const result = await tgCall('deleteMessage', { chat_id, message_id }, env);
    return result !== null;
}

export async function sendPhoto(chat_id: number | string, photoUrl: string, caption: string, env: Env): Promise<number | null> {
    const result = await tgCall('sendPhoto', { chat_id, photo: photoUrl, caption, parse_mode: 'HTML' }, env);
    return result?.message_id ?? null;
}

export async function sendPhotoSafe(chat_id: number | string, photoUrl: string, caption: string, env: Env): Promise<number | null> {
    const photoId = await sendPhoto(chat_id, photoUrl, caption, env);
    if (photoId !== null) return photoId;
    const result = await tgCall('sendPhoto', { chat_id, photo: photoUrl, caption }, env);
    return result?.message_id ?? null;
}

export async function sendPhotoPlain(chat_id: number | string, photoUrl: string, caption: string, env: Env): Promise<number | null> {
    if (caption.length === 0) {
        const result = await tgCall('sendPhoto', { chat_id, photo: photoUrl }, env);
        return result?.message_id ?? null;
    }
    const result = await tgCall('sendPhoto', { chat_id, photo: photoUrl, caption }, env);
    return result?.message_id ?? null;
}

export async function sendInlineKeyboardMessage(chat_id: number | string, text: string, keyboard: any, env: Env): Promise<number | null> {
    const result = await tgCall('sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }, env);
    return result?.message_id ?? null;
}

export async function sendInlineKeyboardMessageSafe(chat_id: number | string, text: string, keyboard: any, env: Env): Promise<number | null> {
    const id = await sendInlineKeyboardMessage(chat_id, text, keyboard, env);
    if (id !== null) return id;
    const result = await tgCall('sendMessage', { chat_id, text, reply_markup: { inline_keyboard: keyboard } }, env);
    return result?.message_id ?? null;
}

export async function editMessageReplyMarkup(chat_id: number | string, message_id: number, keyboard: any, env: Env): Promise<boolean> {
    const result = await tgCall('editMessageReplyMarkup', { chat_id, message_id, reply_markup: { inline_keyboard: keyboard } }, env);
    return result !== null;
}

export async function answerCallbackQuery(callbackQueryId: string, env: Env, text?: string): Promise<boolean> {
    const result = await tgCall('answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: false }, env);
    return result !== null;
}

export async function getChatMemberCount(chat_id: number | string, env: Env): Promise<number> {
    const result = await tgCall('getChatMemberCount', { chat_id }, env);
    return typeof result === 'number' ? result : -1;
}

export async function getChat(chat_id: number | string, env: Env): Promise<any> {
    return await tgCall('getChat', { chat_id }, env);
}

export async function setMyCommands(env: Env): Promise<boolean> {
    const commands = [
        { command: 'generate', description: 'Generate a post' },
        { command: 'stats', description: 'View channel stats' },
        { command: 'settings', description: 'Open settings' },
        { command: 'addchannel', description: 'Add a channel' },
        { command: 'youtube', description: 'Generate & upload YouTube videos' },
        { command: 'cancel', description: 'Cancel current action' },
        { command: 'help', description: 'Show help' },
    ];
    const result = await tgCall('setMyCommands', { commands }, env);
    return result !== null;
}