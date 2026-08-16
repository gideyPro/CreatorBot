import { CFG, assertCfg } from './config.mjs';

async function kvUrl(key) {
    assertCfg(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'KV_NAMESPACE_ID']);
    return `https://api.cloudflare.com/client/v4/accounts/${CFG.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CFG.KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
}

export async function kvGet(key) {
    const res = await fetch(await kvUrl(key), {
        headers: { Authorization: `Bearer ${CFG.CLOUDFLARE_API_TOKEN}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KV get ${key}: HTTP ${res.status} ${await res.text()}`);
    return await res.text();
}

export async function kvGetJson(key, fallback = null) {
    const raw = await kvGet(key);
    if (raw === null || raw === '') return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export async function kvPut(key, value) {
    const res = await fetch(await kvUrl(key), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${CFG.CLOUDFLARE_API_TOKEN}` },
        body: value,
    });
    if (!res.ok) throw new Error(`KV put ${key}: HTTP ${res.status} ${await res.text()}`);
}