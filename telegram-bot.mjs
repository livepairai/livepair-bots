// telegram-bot.mjs — Telegram image/video bot backed by LivePair, zero deps.
// Long-polls getUpdates; any message text becomes a generation prompt.
//   BOT_TOKEN=123:abc LP_KEY=lp_... node telegram-bot.mjs
//
// Billing rides the owner's prepaid credits — per result, a few cents.
// Swap x-api-key for the x402 rail (USDC wallet) if you want keyless.
const BOT = process.env.BOT_TOKEN;   // @BotFather
const KEY = process.env.LP_KEY;      // https://livepairai.com/settings
const TG = `https://api.telegram.org/bot${BOT}`;
const LP = "https://livepairai.com";
const MODEL = "qwen-image-3"; // any id from GET /v1/agent/models

const tg = (method, body) =>
  fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const lp = (path, body) =>
  fetch(`${LP}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body),
  }).then((r) => r.json());

async function generate(prompt) {
  // submit → poll the job until the media URL lands
  const { jobId } = await lp("/v1/agent/generate", { model: MODEL, prompt });
  if (!jobId) throw new Error("generate rejected — check credits/key");
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await fetch(`${LP}/v1/agent/jobs/${jobId}`).then((r) => r.json());
    if (j.status === "done") return j.url;
    if (j.status === "failed") throw new Error(j.error ?? "generation failed");
  }
  throw new Error("timed out");
}

let offset = 0;
console.log("polling…");
for (;;) {
  const { result = [] } = await tg("getUpdates", { offset, timeout: 30 }).catch(() => ({}));
  for (const u of result) {
    offset = u.update_id + 1;
    const msg = u.message;
    const text = msg?.text?.trim();
    if (!text || text.startsWith("/")) {
      if (text === "/start")
        await tg("sendMessage", { chat_id: msg.chat.id, text: "Send me a prompt — I'll generate it on LivePair." });
      continue;
    }
    await tg("sendChatAction", { chat_id: msg.chat.id, action: "upload_photo" }).catch(() => {});
    try {
      const url = await generate(text);
      await tg("sendPhoto", { chat_id: msg.chat.id, photo: url, caption: text.slice(0, 900) });
    } catch (e) {
      await tg("sendMessage", { chat_id: msg.chat.id, text: `failed: ${e.message}` });
    }
  }
}
