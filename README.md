# CreatorBot

A free, AI-powered Telegram bot on Cloudflare Workers that generates posts, images, and manages your Telegram channels automatically.

## Features

- `/generate <topic>` — AI posts with a **preview step** before publishing (Post / Regenerate / New topic / Cancel)
- **Automatic publishing** to your channel on a schedule (4h / 8h / 12h / 24h, with jitter)
- **Image generation** (free → uses Pollinations.ai) or text-only mode
- Optional **Amharic translation** of generated posts
- **Channel management**: register, remove, and switch the active channel
- **Stats**: members, posts today/total, queue size (D1-backed, falls back to KV)
- Model picker, `/cancel`, `/help`, command hints, inline-button navigation

## Costs

Everything runs on Cloudflare's free Workers plan plus free external APIs (Groq, Pollinations, Google Translate). The only paid-cost risk is if you exceed free-tier limits (10ms CPU, 100K req/day). Scheduled posts are pure API calls, so they use almost no CPU.

## Setup

1. Install deps:
   ```sh
   npm install
   ```

2. Create a KV namespace and put its id in `wrangler.toml` (`KV_B`).

3. Set secrets:
   ```sh
   npx wrangler secret put BOT_TOKEN     # from @BotFather
   npx wrangler secret put GROQ_API_KEY  # from console.groq.com
   ```

4. (Optional) D1 for deeper stats:
   ```sh
   npx wrangler d1 create creatorbot_stats
   # paste database_id into wrangler.toml, uncomment the [[d1_databases]] block
   npx wrangler d1 execute creatorbot_stats --remote --file=./schema.sql
   ```

5. Deploy:
   ```sh
   npm run deploy
   ```

6. Wire up the Telegram webhook (replace values):
   ```sh
   curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://creatorbot.<your-subdomain>.workers.dev/webhook","secret_token":"<pick-a-random-string>"}'
   ```
   The bot registers its command list automatically on the first cron run.

7. Register commands with the same `secret_token` in `index.ts` (optional hardening) — or rely on the auto-registered command list.

## Commands

- `/generate <topic>`
- `/addchannel <@handle>`
- `/stats`
- `/settings`
- `/cancel`
- `/help`

To post to a channel, add the bot as an **admin** of that channel first.