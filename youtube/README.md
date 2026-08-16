# CreatorBot YouTube Pipeline

Renders and uploads YouTube videos for jobs queued from the Telegram bot (`📺 YouTube Studio`).

**Flow:** bot queues a job in KV → this pipeline polls KV → generates script (Groq) → images (Pollinations) → narration (edge-tts) → assembles MP4 (ffmpeg) → uploads to your YouTube channel (Data API v3) → notifies you on Telegram.

Everything here is **free**: Groq, Pollinations, edge-tts, and ffmpeg (already installed on this machine). Only costs are YouTube's free API quota (~100 uploads/day).

## Prerequisites (one-time)

1. **ffmpeg** — already installed (`ffmpeg -version`).
2. **edge-tts** — `pip install edge-tts`
3. **Google Cloud project**
   - Console → create project → enable **YouTube Data API v3**
   - APIs & Services → OAuth consent screen → **External** (add yourself as a test user)
   - Credentials → Create credentials → **OAuth client ID** → **Desktop app**
   - Copy the client ID + secret into `.env`
4. **Cloudflare API token** with **KV write/edit** on your account (needed to read the bot's job queue). Find your **Account ID** in the Cloudflare dashboard sidebar. The KV namespace id is already in `.env.example`.

## Setup

```sh
cp .env.example .env   # fill in all values
node oauth.mjs         # prints a URL; open it, authorize, tokens are saved locally
```

## Run

```sh
node pipeline.mjs          # watch mode: polls KV every POLL_SECONDS (default 60s)
node pipeline.mjs --once   # one pass (for cron: */2 * * * * cd ... && node pipeline.mjs --once)
```

To verify ffmpeg assembly without any network/API keys:

```sh
node render.mjs --test     # renders youtube/out/test.mp4 from synthetic assets
```

## Bot side

In the Telegram bot, open **YouTube Studio** → **Generate Video** → send a topic. The pipeline picks it up, renders long-form (1920×1080) and/or Shorts (1080×1920) per your settings, uploads, and DMs you the links.

Settings you can change from the bot: format (long / short / both), privacy, title prefix, tags.

## Notes

- **Privacy:** an unverified Google app can only upload **private** videos. To publish publicly, submit your app for OAuth verification (2–4 weeks) — until then use `private` and publish manually from YouTube Studio, or stay private.
- **Shorts** need to stay under 60s of speech; the script generator targets ~50s.
- Background music: set `MUSIC=/path/to/track.mp3` in `.env` (looped low-volume under the narration).
- Disclose AI content in descriptions/titles as required by YouTube policy (`Altered or Synthetic Content` label in Studio).