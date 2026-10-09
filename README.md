# LivePair Bots — Telegram, Discord & X/Twitter AI media bot templates

Ready-to-run bot templates that put the [LivePair AI](https://livepairai.com)
private image & video generation API inside Telegram, Discord, X/Twitter,
and n8n automation. **Pay per result** from prepaid credits — no subscription, no
monthly tier. Renders auto-delete after 48h; nothing enters a public feed.

Every template is zero-dependency (Node 20+ built-ins only) — clone, set
env vars, run.

## Telegram AI image bot

[`telegram-bot.mjs`](./telegram-bot.mjs) — long-polls `getUpdates`; any
message becomes a generation prompt, replies with the photo:

```bash
BOT_TOKEN=123:abc LP_KEY=lp_... node telegram-bot.mjs
```

`BOT_TOKEN` from @BotFather, `LP_KEY` from
https://livepairai.com/settings. Swap `MODEL` for any id in
`GET https://livepairai.com/v1/agent/models` (image and video models —
switch `sendPhoto` to `sendVideo` for clips).

## Discord AI image & video bot

[`discord-bot.mjs`](./discord-bot.mjs) — `/imagine` + `/video` slash
commands via the Discord interactions **webhook** — no gateway, no
discord.js, signatures verified with Node's built-in crypto:

```bash
PUBLIC_KEY=<app public key> APP_ID=<app id> LP_KEY=lp_... node discord-bot.mjs
```

1. Create an app at the Discord developer portal → copy `PUBLIC KEY` and
   `APPLICATION ID`.
2. Register the commands once:
   `APP_ID=… BOT_TOKEN=… node register-commands.mjs`
   (`GUILD_ID=…` registers instantly for testing; global takes ~1h)
3. Point the app's **Interactions Endpoint URL** at
   `https://<your-host>/interactions`.

Built in:

- **Model picker** — optional `model` option against the live catalog
  (`/v1/agent/models`, cached 5min); defaults `qwen-image-3` /
  `wan-3.0-t2v`, override via `IMAGE_MODEL`/`VIDEO_MODEL`.
- **Private-line gating** — models whose id contains `-private` answer
  only in **bot DMs** or **NSFW-flagged channels**, using Discord's own
  channel flag. Public channels get an ephemeral nudge instead.
- **No built-in quota** — every generation bills your `LP_KEY`; add
  your own rate limiting if you need it (env, KV, per-user auth).
- Public results carry a `via livepairai.com` footer — remove it if you
  want, but leaving it helps the next dev find the template.

## X/Twitter — generate + post

[`twitter-bot.mjs`](./twitter-bot.mjs) — generates an image or clip with
LivePair, uploads it to X, posts the tweet. One-shot CLI — run it from a
cron, CI job, or wire it to any trigger:

```bash
node twitter-bot.mjs "a cat astronaut, cinematic" --text "daily drop"
node twitter-bot.mjs "slow wave crash" --video
```

X keys come from **your own app** at developer.x.com (Read and write
permission) → set `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` /
`X_ACCESS_SECRET`. The free tier can post tweets + upload media; it just
can't *read* timelines — fine for a poster bot. OAuth1.0a signing is
implemented inline with Node's built-in crypto, so still zero deps.

Prefer a GUI? The [n8n workflow](#n8n-workflows--generate--reply--post)
below does the same thing with a visual editor.

## Deploy anywhere

**Render (one click):**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/livepairai/livepair-bots)

`render.yaml` ships a free-plan web service for the Discord bot — fill
`PUBLIC_KEY`, `APP_ID`, `LP_KEY` in the Render dashboard, then point the
app's Interactions Endpoint URL at the deployed `/interactions` path.

**Anywhere else** — the included `Dockerfile` runs the Discord bot on
Railway, Fly.io, ECS, or any VPS:

```bash
docker build -t livepair-bots . && docker run -p 8787:8787 --env-file .env livepair-bots
# Railway: railway up   ·   Fly: fly deploy   ·   plain VPS: node discord-bot.mjs
```

## n8n workflows — generate → reply / post

- [`n8n-telegram-workflow.json`](./n8n-telegram-workflow.json) — Telegram
  trigger → `generate` → wait/poll loop → `sendPhoto`.
- [`n8n-x-workflow.json`](./n8n-x-workflow.json) — webhook →
  **LivePair Generate Media** (community node) → **Post to X** — auto-post
  generated media to X/Twitter. Needs the
  [`@livepairai/n8n-nodes-livepair`](https://www.npmjs.com/package/@livepairai/n8n-nodes-livepair)
  community node + X OAuth2 credentials.

Import via **Workflows → Import from File**. Same node pattern ports to
Make/Zapier HTTP steps.

## Agent frameworks (Hermes / OpenClaw / anything OpenAI-compatible)

[`hermes-openclaw.md`](./hermes-openclaw.md) — config snippets: point any
agent framework's OpenAI-compatible provider at LivePair for chat
(`deepseek`, `kimi`, `llama`, `grok` and ~25 models), or hand it the MCP
server / x402 keyless payment rail.

## The API behind it

`POST /v1/agent/generate` → job → `GET /v1/agent/jobs/{id}` → media URL.
Two payment rails: `lp_` prepaid API key, or x402 (agents pay per call in
USDC on Base, no account needed). Full agent contract:
[`livepairai/livepair-skills`](https://github.com/livepairai/livepair-skills) ·
OpenAPI `https://livepairai.com/v1/agent/openapi.json` · MCP
`https://livepairai.com/mcp`

ComfyUI users: [`livepairai/ComfyUI-LivePair`](https://github.com/livepairai/ComfyUI-LivePair)

## License

MIT
