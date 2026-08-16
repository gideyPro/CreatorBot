import fs from 'node:fs/promises';
import path from 'node:path';

const POLLINATIONS = 'https://image.pollinations.ai/prompt/';

export async function downloadImage(prompt, outPath, width = 1280, height = 720) {
    const url = `${POLLINATIONS}${encodeURIComponent(prompt)}?nologo=true&width=${width}&height=${height}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
        const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
        if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(outPath, buf);
        return outPath;
    } finally {
        clearTimeout(timer);
    }
}

export async function downloadImages(prompts, dir, orientation) {
    const files = [];
    const [w, h] = orientation === 'vertical' ? [720, 1280] : [1280, 720];
    for (let i = 0; i < prompts.length; i++) {
        const out = path.join(dir, `img_${i}.jpg`);
        await downloadImage(prompts[i], out, w, h);
        files.push(out);
    }
    return files;
}