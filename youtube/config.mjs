import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadEnv() {
    const envFile = path.join(HERE, '.env');
    if (!fs.existsSync(envFile)) return;
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, key, val] = m;
        if (!(key in process.env)) process.env[key] = val.trim().replace(/^["']|["']$/g, '');
    }
}

function get(name, fallback = '') {
    const v = process.env[name];
    return v === undefined || v === '' ? fallback : v;
}

export const CFG = {
    GROQ_API_KEY: get('GROQ_API_KEY'),
    BOT_TOKEN: get('BOT_TOKEN'),
    TELEGRAM_CHAT_ID: get('TELEGRAM_CHAT_ID'),
    CLOUDFLARE_ACCOUNT_ID: get('CLOUDFLARE_ACCOUNT_ID'),
    CLOUDFLARE_API_TOKEN: get('CLOUDFLARE_API_TOKEN'),
    KV_NAMESPACE_ID: get('KV_NAMESPACE_ID'),
    YT_CLIENT_ID: get('YT_CLIENT_ID'),
    YT_CLIENT_SECRET: get('YT_CLIENT_SECRET'),
    MODEL: get('GROQ_MODEL', 'llama-3.1-8b-instant'),
    VOICE: get('VOICE', 'en-US-ChristopherNeural'),
    PRIVACY: get('PRIVACY', 'private'),
    MUSIC: get('MUSIC', ''),
    OUT_DIR: get('OUT_DIR', path.join(HERE, 'out')),
    POLL_SECONDS: Number(get('POLL_SECONDS', '60')),
    REDIRECT_PORT: Number(get('REDIRECT_PORT', '8770')),
    TOKENS_FILE: get('TOKENS_FILE', path.join(HERE, 'tokens.json')),
};

export function assertCfg(keys) {
    const missing = keys.filter(k => !CFG[k]);
    if (missing.length > 0) {
        throw new Error(`Missing config in youtube/.env: ${missing.join(', ')}`);
    }
}
