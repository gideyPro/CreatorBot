import { spawn } from 'node:child_process';
import { CFG } from './config.mjs';

export function tts(text, outPath) {
    return new Promise((resolve, reject) => {
        const child = spawn('edge-tts', ['--text', text, '--voice', CFG.VOICE, '--write-media', outPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let err = '';
        child.stderr.on('data', d => { err += d; });
        child.on('error', e => reject(new Error(`edge-tts not found — install with: pip install edge-tts (${e.message})`)));
        child.on('close', code => {
            if (code === 0) resolve(outPath);
            else reject(new Error(`edge-tts failed (exit ${code}): ${err.slice(-500)}`));
        });
    });
}

export async function ttsSegments(segments, dir) {
    const files = [];
    for (let i = 0; i < segments.length; i++) {
        const out = `${dir}/narration_${i}.mp3`;
        await tts(segments[i], out);
        files.push(out);
    }
    return files;
}

export function splitScript(script, n) {
    const sentences = script
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);
    if (sentences.length === 0) return [script];
    if (sentences.length <= n) return sentences;
    const buckets = Array.from({ length: n }, () => []);
    sentences.forEach((s, i) => buckets[Math.floor((i * n) / sentences.length)].push(s));
    return buckets.map(b => b.join(' ')).filter(Boolean);
}