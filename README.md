# LivePair Bots — Telegram & Discord AI image/video bot templates

Ready-to-run bot templates that put the [LivePair AI](https://livepairai.com)
private image & video generation API inside Telegram, Discord, and n8n
automation. **Pay per result** from prepaid credits — no subscription, no
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

## Discord AI image bot

[`discord-bot.mjs`](./discord-bot.mjs) — `/imagine` slash command via the
Discord interactions **webhook** — no gateway, no discord.js, signatures
verified with Node's built-in crypto:

```bash
PUBLIC_KEY=<app public key> APP_ID=<app id> LP_KEY=lp_... node discord-bot.mjs
```

Register the command once (curl in the file header), point the app's
Interactions Endpoint at `/interactions`, done.

## n8n workflow — Telegram → generate → reply

[`n8n-telegram-workflow.json`](./n8n-telegram-workflow.json) — import via
**Workflows → Import from File**: Telegram trigger → `generate` →
wait/poll loop → `sendPhoto`. Fill in `lp_YOUR_KEY` and your Telegram
credentials. Same node pattern ports to Make/Zapier HTTP steps.

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
