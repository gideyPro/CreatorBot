import http from 'node:http';
import fs from 'node:fs';
import { CFG, loadEnv, assertCfg } from './config.mjs';

function saveTokens(tokens) {
    fs.writeFileSync(CFG.TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function loadTokens() {
    if (!fs.existsSync(CFG.TOKENS_FILE)) return null;
    return JSON.parse(fs.readFileSync(CFG.TOKENS_FILE, 'utf8'));
}

export async function exchangeCode(code, redirectUri) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: CFG.YT_CLIENT_ID,
            client_secret: CFG.YT_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        saved_at: Date.now(),
    });
    return data;
}

export async function refreshAccessToken() {
    const tokens = loadTokens();
    if (!tokens?.refresh_token) throw new Error('No saved refresh token. Run: node oauth.mjs');
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: tokens.refresh_token,
            client_id: CFG.YT_CLIENT_ID,
            client_secret: CFG.YT_CLIENT_SECRET,
            grant_type: 'refresh_token',
        }),
    });
    if (!res.ok) throw new Error(`Token refresh failed: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    tokens.access_token = data.access_token;
    tokens.expires_in = data.expires_in;
    tokens.saved_at = Date.now();
    saveTokens(tokens);
    return tokens.access_token;
}

export async function getAccessToken() {
    const tokens = loadTokens();
    if (!tokens) throw new Error('Not connected. Run: node oauth.mjs');
    const age = Date.now() - (tokens.saved_at || 0);
    const maxAge = ((tokens.expires_in || 3600) - 60) * 1000;
    if (age >= maxAge) return refreshAccessToken();
    return tokens.access_token;
}

function startAuthServer() {
    const redirectUri = `http://127.0.0.1:${CFG.REDIRECT_PORT}`;
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, redirectUri);
            const code = url.searchParams.get('code');
            if (code) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body style="font-family:sans-serif"><h3>✅ Authorized!</h3><p>You can close this window and return to the terminal.</p></body></html>');
                server.close();
                resolve({ redirectUri, code });
            } else {
                res.writeHead(400);
                res.end('No authorization code in the query string.');
                reject(new Error('No code received in redirect'));
            }
        });
        server.on('error', e => reject(new Error(`Could not start local server on port ${CFG.REDIRECT_PORT}: ${e.message}`)));
        server.listen(CFG.REDIRECT_PORT, '127.0.0.1', () => resolve({ redirectUri }));
    });
}

export async function runOAuthFlow() {
    loadEnv();
    assertCfg(['YT_CLIENT_ID', 'YT_CLIENT_SECRET']);
    const { redirectUri, code } = await startAuthServer();
    const params = new URLSearchParams({
        client_id: CFG.YT_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.upload',
        access_type: 'offline',
        prompt: 'consent',
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    console.log('\nOpen this URL in your browser and authorize the app:\n');
    console.log(url);
    console.log('\nWaiting for authorization…');
    await exchangeCode(code, redirectUri);
    console.log('✅ Tokens saved to', CFG.TOKENS_FILE, '\n');
}

if (process.argv[1] && process.argv[1].endsWith('oauth.mjs')) {
    runOAuthFlow().catch(e => {
        console.error('OAuth failed:', e.message);
        process.exit(1);
    });
}