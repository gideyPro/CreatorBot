import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        child.on('error', e => reject(new Error(`${cmd} not found: ${e.message}`)));
        child.on('close', code => {
            if (code === 0) resolve(out);
            else reject(new Error(`${cmd} failed (exit ${code}): ${err.slice(-1000)}`));
        });
    });
}

export async function audioDuration(file) {
    const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file]);
    const data = JSON.parse(out);
    return Number(data?.format?.duration || 0);
}

// Ken Burns clip: one image held for the length of one narration segment.
async function renderClip(image, audio, out, width, height) {
    const dur = await audioDuration(audio);
    if (dur < 1) throw new Error(`Narration segment too short (${dur}s): ${audio}`);
    const fps = 30;
    const frames = Math.max(1, Math.round(dur * fps));
    const fadeOutStart = Math.max(0.2, dur - 0.4).toFixed(2);
    const filter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},` +
        `zoompan=z='min(zoom+0.0004,1.2)':d=${frames}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',` +
        `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart}:d=0.4,format=yuv420p[v]`;
    await run('ffmpeg', [
        '-y', '-i', image, '-i', audio,
        '-filter_complex', filter,
        '-map', '[v]', '-map', '1:a',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-t', dur.toFixed(2),
        '-shortest', out,
    ]);
}

async function concatClips(clips, out) {
    const list = path.join(path.dirname(out), 'concat_list.txt');
    fs.writeFileSync(list, clips.map(c => `file '${c.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    try {
        await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
    } finally {
        fs.rmSync(list, { force: true });
    }
}

async function addBackgroundMusic(video, music, out) {
    if (!music) return out;
    await run('ffmpeg', [
        '-y', '-i', video, '-stream_loop', '-1', '-i', music,
        '-filter_complex', '[1:a]volume=0.12,aloop=loop=-1:size=2e9[bg];[0:a][bg]amix=inputs=2:duration=first:normalize=0[a]',
        '-map', '0:v', '-map', '[a]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-shortest', out,
    ]);
}

export async function renderSlideshow({ images, narrations, out, orientation = 'landscape', music = '' }) {
    const [width, height] = orientation === 'vertical' ? [1080, 1920] : [1920, 1080];
    const workDir = path.dirname(out);
    fs.mkdirSync(workDir, { recursive: true });

    const clips = [];
    const n = Math.min(images.length, narrations.length);
    for (let i = 0; i < n; i++) {
        const clip = path.join(workDir, `clip_${i}.mp4`);
        await renderClip(images[i], narrations[i], clip, width, height);
        clips.push(clip);
    }

    const joined = path.join(workDir, '_joined.mp4');
    await concatClips(clips, joined);

    if (music) {
        await addBackgroundMusic(joined, music, out);
        fs.rmSync(joined, { force: true });
    } else {
        fs.renameSync(joined, out);
    }

    for (const f of clips) fs.rmSync(f, { force: true });
    return out;
}

async function makeTestAssets(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const imgs = [];
    for (let i = 0; i < 2; i++) {
        const img = path.join(dir, `test_img_${i}.jpg`);
        await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x2b3a67:s=1920x1080:d=1', '-frames:v', '1',
            '-vf', `drawtext=text='Test slide ${i + 1}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2`,
            img]);
        imgs.push(img);
    }
    const audios = [];
    for (let i = 0; i < 2; i++) {
        const aud = path.join(dir, `test_aud_${i}.mp3`);
        await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', aud]);
        audios.push(aud);
    }
    return { imgs, audios };
}

if (process.argv[1] && process.argv[1].endsWith('render.mjs') && process.argv.includes('--test')) {
    const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'test.mp4');
    try {
        const { imgs, audios } = await makeTestAssets(path.dirname(out));
        await renderSlideshow({ images: imgs, narrations: audios, out, orientation: 'landscape' });
        console.log('✅ Test video rendered:', out);
    } catch (e) {
        console.error('Render test failed:', e.message);
        process.exit(1);
    }
}