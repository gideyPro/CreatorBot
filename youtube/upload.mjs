import fs from 'node:fs';
import { getAccessToken } from './oauth.mjs';

const API = 'https://www.googleapis.com/upload/youtube/v3/videos';

export async function uploadVideo({ filePath, title, description, tags = [], categoryId = '28', privacyStatus = 'private', madeForKids = false }) {
    const accessToken = await getAccessToken();
    const fileSize = fs.statSync(filePath).size;
    const metadata = {
        snippet: {
            title: String(title).slice(0, 100),
            description: String(description).slice(0, 5000),
            tags: tags.slice(0, 50),
            categoryId,
        },
        status: {
            privacyStatus,
            selfDeclaredMadeForKids: madeForKids,
        },
    };

    const initRes = await fetch(`${API}?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(fileSize),
        },
        body: JSON.stringify(metadata),
    });
    if (initRes.status === 401) {
        throw new Error('OAuth token expired/unauthorized. Re-run: node oauth.mjs');
    }
    if (initRes.status === 403) {
        throw new Error(`YouTube rejected upload (403). Unverified apps can only upload PRIVATE videos. Body: ${await initRes.text()}`);
    }
    if (!initRes.ok) {
        throw new Error(`Upload init failed: HTTP ${initRes.status} ${await initRes.text()}`);
    }

    const uploadUri = initRes.headers.get('location');
    if (!uploadUri) throw new Error('No upload URI returned by YouTube');

    const buf = fs.readFileSync(filePath);
    const putRes = await fetch(uploadUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) },
        body: buf,
    });
    if (!putRes.ok) {
        throw new Error(`Upload PUT failed: HTTP ${putRes.status} ${await putRes.text()}`);
    }

    const data = await putRes.json();
    return data?.id;
}