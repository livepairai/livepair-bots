# Hermes / OpenClaw-style self-hosted agents

Any agent framework that accepts an **OpenAI-compatible provider** can use
LivePair as a backend. Two surfaces depending on what you need:

## Chat backend (roleplay / assistant agents)

```
Base URL:  https://livepairai.com/v1/agent
API key:   lp_your_key            # from https://livepairai.com/settings
Model:     deepseek/deepseek-v4.1-flash   # or any id under textModels in GET /v1/agent/models
```

The framework posts to `{base}/chat/completions` — served by the same
handler as `POST /v1/agent/chat`. Billed per token against prepaid
credits; keep `max_tokens` tight to pay less.

**Notes for framework configs:**

- No streaming — the endpoint returns one JSON `chat.completion` object.
  Disable SSE/streaming flags in the framework's provider config.
- No function/tool calling on this surface. If the agent needs tools,
  give it the MCP server below instead.
- Caps: 50 messages / 48,000 chars per request, `max_tokens` ≤ 8192.

## Tool-capable agents (image/video generation)

Point the agent's MCP host at the remote server:

```json
{ "mcpServers": { "livepair": { "url": "https://livepairai.com/mcp" } } }
```

Eleven tools appear — model catalog, prompt enhance, model recommender,
paid `generate_image`/`generate_video`, quoting, job polling. With
`x-api-key: lp_…` on the MCP connection, generate tools run inline;
without a key the tool returns the x402 payment details for the agent's
wallet to settle.

For frameworks without MCP, image/video is two plain HTTP calls:

```
POST https://livepairai.com/v1/agent/generate
  headers: x-api-key: lp_…, content-type: application/json
  body:    {"model":"<model id from GET /v1/agent/models>","prompt":"…"}
  → {"jobId":"…"}

GET https://livepairai.com/v1/agent/jobs/{jobId}
  → {"status":"done","url":"https://…"}   (media auto-deletes in 48h)
```

## Keyless agents (x402)

Agents carrying a USDC wallet skip the key entirely: `POST /v1/agent/generate`
answers `402 Payment Required` with the exact amount on Base; settle and
retry with `PAYMENT-SIGNATURE`. Any x402 client (`@x402/fetch`, thirdweb)
drives the whole loop — see `SKILL.md` at the repo root for the full
payment protocol.
