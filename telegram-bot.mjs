// telegram-bot.mjs — Telegram image/video bot backed by LivePair, zero deps.
// Long-polls getUpdates; any message text becomes a generation prompt.
//   BOT_TOKEN=123:abc LP_KEY=lp_... node telegram-bot.mjs
//
// Billing rides the owner's prepaid credits — per result, a few cents.
// Swap x-api-key for the x402 rail (USDC wallet) if you want keyless.
import { generate } from "./lib/livepair.mjs";

const BOT = process.env.BOT_TOKEN;   // @BotFather
const KEY = process.env.LP_KEY;      // https://livepairai.com/settings
const TG = `https://api.telegram.org/bot${BOT}`;
const MODEL = process.env.IMAGE_MODEL ?? "qwen-image-3"; // any id from GET /v1/agent/models
const VIDEO = process.env.VIDEO === "1";                  // sendVideo for video models

const tg = (method, body) =>
  fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

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
    await tg("sendChatAction", { chat_id: msg.chat.id, action: VIDEO ? "upload_video" : "upload_photo" }).catch(() => {});
    try {
      const url = await generate(KEY, { model: MODEL, prompt: text });
      await tg(VIDEO ? "sendVideo" : "sendPhoto", {
        chat_id: msg.chat.id,
        [VIDEO ? "video" : "photo"]: url,
        caption: text.slice(0, 900),
      });
    } catch (e) {
      await tg("sendMessage", { chat_id: msg.chat.id, text: `failed: ${e.message}` });
    }
  }
}
