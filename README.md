# LivePair Bots

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![Deploy to Render](https://img.shields.io/badge/deploy-Render-46E3B7)](https://render.com/deploy?repo=https://github.com/livepairai/livepair-bots)
[![Zero dependencies](https://img.shields.io/badge/deps-0-success)](./package.json)

Production-ready bot templates that put the [LivePair AI](https://livepairai.com)
image & video generation API inside **Discord, Telegram, X/Twitter, and n8n**.

Every template is **zero-dependency** — Node 20+ built-ins only, no
discord.js, no bot frameworks. Clone, set env vars, run. Billing is
per-result against prepaid `lp_` credits: no subscription, no monthly tier.
Renders auto-delete after 48h; nothing enters a public feed.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Bots](#bots)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [n8n workflows](#n8n-workflows)
- [Architecture](#architecture)
- [Error handling](#error-handling)
- [Related projects](#related-projects)

## Requirements

- **Node.js ≥ 20** (uses built-in `fetch`, `crypto`, `http` — nothing else)
- A LivePair API key — create one at [livepairai.com/settings](https://livepairai.com/settings)
- Platform credentials for the bot you're running (see [Configuration](#configuration))

## Quick start

```sh
git clone https://github.com/livepairai/livepair-bots.git
cd livepair-bots
cp .env.example .env    # fill in your keys

node telegram-bot.mjs   # or discord-bot.mjs / twitter-bot.mjs
```

## Bots

| File | Platform | Interface | Billing |
|---|---|---|---|
| [`discord-bot.mjs`](./discord-bot.mjs) | Discord | `/imagine` + `/video` slash commands | owner's `lp_` key |
| [`telegram-bot.mjs`](./telegram-bot.mjs) | Telegram | long-polling, any message → media | owner's `lp_` key |
| [`twitter-bot.mjs`](./twitter-bot.mjs) | X/Twitter | one-shot CLI poster (cron/CI friendly) | owner's `lp_` key |

### Discord

Slash commands via the **interactions webhook** — no gateway connection,
no discord.js. Request signatures are verified with Node's built-in
ed25519 crypto.

```sh
# 1. Create an app at discord.com/developers → copy PUBLIC KEY + APP ID
# 2. Register commands once (GUILD_ID for instant testing; global takes ~1h)
APP_ID=… BOT_TOKEN=… node register-commands.mjs
# 3. Run the webhook server
PUBLIC_KEY=… APP_ID=… LP_KEY=lp_… node discord-bot.mjs
# 4. Set the app's Interactions Endpoint URL → https://<host>:8787/interactions
```

Built-in behavior:

- **Model picker** — optional `model` option resolved against the live
  catalog (`/v1/agent/models`, cached 5 min). Defaults: `qwen-image-3`
  for images, `wan-3.0-t2v` for video; override with `IMAGE_MODEL` /
  `VIDEO_MODEL`.
- **Private-line gating** — model ids containing `-private` answer only
  in bot DMs or NSFW-flagged guild channels, using Discord's own channel
  flag. Public channels get an ephemeral nudge.
- **Quota-free by design** — every generation bills your key; add your
  own rate limiting (env, KV, per-user auth) if you need it.

### Telegram

Long-polls `getUpdates`; any message text becomes a generation prompt and
the bot replies with the rendered media.

```sh
BOT_TOKEN=123:abc… LP_KEY=lp_… node telegram-bot.mjs
```

`BOT_TOKEN` comes from @BotFather. Set `IMAGE_MODEL` for any catalog id;
`VIDEO=1` switches replies to `sendVideo` for video models.

### X/Twitter

One-shot generate-and-post — designed for cron, CI jobs, and schedulers.
OAuth 1.0a signing is implemented inline with built-in crypto.

```sh
node twitter-bot.mjs "a cat astronaut, cinematic" --text "daily drop"
node twitter-bot.mjs "slow wave crash" --video --model wan-3.0-t2v
```

X credentials come from **your own app** at developer.x.com (Read+Write).
The free tier posts tweets and uploads media — sufficient for a poster
bot. Async video uploads are polled via the media-upload STATUS command.

## Configuration

| Variable | Used by | Source |
|---|---|---|
| `LP_KEY` | all | [livepairai.com/settings](https://livepairai.com/settings) — prepaid credits |
| `BOT_TOKEN` | telegram, register-commands | @BotFather / Discord dev portal |
| `PUBLIC_KEY`, `APP_ID` | discord | Discord developer portal |
| `X_API_KEY`/`X_API_SECRET`/`X_ACCESS_TOKEN`/`X_ACCESS_SECRET` | twitter | developer.x.com app |
| `IMAGE_MODEL` / `VIDEO_MODEL` | discord, telegram | any id from `GET /v1/agent/models` |
| `LIVEPAIR_BASE` | all | API base override (default `https://livepairai.com`) |
| `PORT` | discord | webhook listen port (default `8787`) |

See [`.env.example`](./.env.example) for a ready-to-copy template.

## Deployment

**Render (one click):**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/livepairai/livepair-bots)

`render.yaml` ships a free-plan web service for the Discord bot — fill
`PUBLIC_KEY`, `APP_ID`, `LP_KEY` in the dashboard, then point the app's
Interactions Endpoint URL at the deployed `/interactions` path.

**Docker / any VPS:**

```sh
docker build -t livepair-bots . && docker run -p 8787:8787 --env-file .env livepair-bots
# Railway: railway up  ·  Fly: fly deploy  ·  bare metal: node discord-bot.mjs
```

## n8n workflows

Import via **Workflows → Import from File**:

- [`n8n-telegram-workflow.json`](./n8n-telegram-workflow.json) — Telegram
  trigger → generate → poll → `sendPhoto`.
- [`n8n-x-workflow.json`](./n8n-x-workflow.json) — webhook →
  **LivePair Generate Media** (community node) → **Post to X**. Requires
  [`@livepairai/n8n-nodes-livepair`](https://www.npmjs.com/package/@livepairai/n8n-nodes-livepair)
  + X OAuth2 credentials.

## Architecture

```
┌────────────┐   webhook/polling   ┌──────────────┐   HTTPS    ┌─────────────────┐
│  Platform   │ ──────────────────→ │  bot script   │ ─────────→ │ livepairai.com  │
│ (Discord/… │                     │  (this repo)  │            │ /v1/agent/*     │
└────────────┘                     │               │            └─────────────────┘
                                   │  lib/livepair.mjs            submit → jobId
                                   │  · generate()  submit+poll   poll  → media URL
                                   │  · listModels() catalog      (48h TTL)
                                   │  · LivePairError typed errs
                                   └──────────────┘
```

One API contract backs everything: `POST /v1/agent/generate` → `jobId` →
`GET /v1/agent/jobs/{id}` → media URL. Two payment rails: `lp_` prepaid
key, or x402 (agents pay per call in USDC on Base — see
[`x402-payment.md`](../livepair-examples/x402-payment.md) in the examples
repo). Agent-facing config snippets for Hermes/OpenClaw and any
OpenAI-compatible framework live in [`hermes-openclaw.md`](./hermes-openclaw.md).

### OpenAI-compatible surfaces

Already inside an OpenAI-shaped client? Point it at
`https://livepairai.com/v1/agent` — `/chat/completions`,
`/images/generations`, and `/videos` (+ `GET /videos/{id}`,
`/videos/{id}/content`) all speak the stock spec shapes, and
`GET /models` returns the OpenAI `object:"list"` shape so model pickers
populate. Same `lp_` key, same credits billing.

## Error handling

The shared client throws `LivePairError` with an HTTP `status`:

| Status | Meaning | Action |
|---|---|---|
| `401`/`403` | bad or missing `lp_` key | fix credentials |
| `402` | insufficient credits (or an x402 quote) | top up at /settings |
| `429` | rate limited | back off |
| `5xx` | server error | safe to retry |
| — | job `failed`/`timeout` | prompt or provider issue; check error message |

Failed generations don't settle — you're only billed for results.

## Related projects

- [`livepair-examples`](https://github.com/livepairai/livepair-examples) — API cookbook (`livepair.py` client, mobile proxy, x402)
- [`livepair-cli`](https://github.com/livepairai/livepair-cli) — `npm i -g livepair` terminal client
- [`n8n-nodes-livepair`](https://github.com/livepairai/n8n-nodes-livepair) — n8n community node
- [`ComfyUI-LivePair`](https://github.com/livepairai/ComfyUI-LivePair) — ComfyUI nodes
- [`livepair-skills`](https://github.com/livepairai/livepair-skills) — agent SKILL.md · [OpenAPI](https://livepairai.com/v1/agent/openapi.json) · [MCP](https://livepairai.com/mcp)

## License

MIT — see [LICENSE](./LICENSE). Contributions welcome.
