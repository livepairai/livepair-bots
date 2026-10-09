// discord-bot.mjs — Discord slash-command media bot backed by LivePair.
// Zero deps: Discord posts interactions to OUR http endpoint — no gateway,
// no discord.js. Signature verified with Node's built-in ed25519 verify.
//
//   PUBLIC_KEY=<app public key> APP_ID=<app id> LP_KEY=lp_... PORT=8787 \
//     node discord-bot.mjs
//
// You need a LivePair API key (lp_…) — create one at
// https://livepairai.com/settings. Every generation bills prepaid credits
// against that key, so quota/cost policy is yours to set.
//
// Commands to register (one-time, see register-commands.mjs or curl below):
//   /imagine prompt [model]   image generation
//   /video   prompt [model]   video generation
// Private-line models (id contains "-private") only run in NSFW-flagged
// guild channels or bot DMs — Discord's own channel flag does the gating.
//
// Every successful generation bills YOUR LP_KEY — there is no built-in
// free tier. Rate-limit however you like (env, KV, your own auth) —
// the example deliberately ships none.
//
//   curl -X PUT "https://discord.com/api/v10/applications/$APP_ID/commands" \
//     -H "Authorization: Bot $BOT_TOKEN" -H "content-type: application/json" \
//     -d '{"name":"imagine","description":"Generate an image","type":1,
//          "options":[
//            {"name":"prompt","description":"what to draw","type":3,"required":true},
//            {"name":"model","description":"model id (default qwen-image-3)","type":3}
//          ]}'
//   (same for "video" — default model wan-3.0-t2v)
// then set the app's Interactions Endpoint URL to https://<host>:8787/interactions
import { createServer } from "node:http";
import { createPublicKey, verify } from "node:crypto";

const PUBLIC_KEY = process.env.PUBLIC_KEY;
const APP_ID = process.env.APP_ID;
const KEY = process.env.LP_KEY;
const LP = process.env.LIVEPAIR_BASE ?? "https://livepairai.com";
const DEFAULT_IMAGE_MODEL = process.env.IMAGE_MODEL ?? "qwen-image-3";
const DEFAULT_VIDEO_MODEL = process.env.VIDEO_MODEL ?? "wan-3.0-t2v";

const isPrivateModel = (id) => id.includes("-private");

let modelCache;
async function models() {
  if (modelCache && Date.now() - modelCache.at < 300_000) return modelCache.list;
  const j = await fetch(`${LP}/v1/agent/models`).then((r) => r.json());
  const list = Array.isArray(j) ? j : j.models ?? [];
  modelCache = { at: Date.now(), list };
  return list;
}

async function generate(prompt, modelId) {
  const res = await fetch(`${LP}/v1/agent/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({ model: modelId, prompt }),
  }).then((r) => r.json());
  if (!res.jobId && !res.url) throw new Error(res.error ?? "generate rejected — check credits/key");
  if (res.url) return res.url;
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await fetch(`${LP}/v1/agent/jobs/${res.jobId}`).then((r) => r.json());
    if (j.status === "done") return j.url;
    if (j.status === "failed") throw new Error(j.error ?? "generation failed");
  }
  throw new Error("timed out");
}

// Discord's public key is raw hex — wrap it in the ed25519 SPKI DER header
// before asking crypto to verify, or the key parse itself throws.
const PUB = createPublicKey({
  key: Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(PUBLIC_KEY, "hex"),
  ]),
  format: "der",
  type: "spki",
});
const okSig = (sig, ts, body) =>
  verify("ed25519", Buffer.concat([Buffer.from(ts), body]), PUB, Buffer.from(sig, "hex"));

const reply = (content, ephemeral = true) => ({
  type: 4,
  data: { content, ...(ephemeral ? { flags: 64 } : {}) },
});

async function finishJob(ix, prompt, model) {
  const followup = `https://discord.com/api/v10/webhooks/${APP_ID}/${ix.token}/messages/@original`;
  const patch = (body) =>
    fetch(followup, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const url = await generate(prompt, model.id);
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url) || model.kind === "video";
    await patch(
      isVideo
        ? { content: `${url}\n— \`${model.id}\` via <https://livepairai.com>` }
        : {
            embeds: [
              {
                image: { url },
                footer: { text: `${model.id} · via livepairai.com` },
                description: prompt.slice(0, 200),
              },
            ],
          },
    );
  } catch (e) {
    await patch({ content: `generation failed: ${e.message}` });
  }
}

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/interactions") {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const sig = req.headers["x-signature-ed25519"];
    const ts = req.headers["x-signature-timestamp"];
    const send = (obj) =>
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(obj));
    if (!sig || !ts || !okSig(sig, ts, body)) {
      res.writeHead(401).end("bad signature");
      return;
    }
    const ix = JSON.parse(body.toString());
    if (ix.type === 1) return send({ type: 1 }); // PING — Discord's endpoint check
    if (ix.type !== 2) return send({ type: 5 }); // ACK others

    const cmd = ix.data?.name ?? "";
    const prompt = String(
      ix.data?.options?.find((o) => o.name === "prompt")?.value ?? "",
    ).slice(0, 2000);
    if (!prompt || !["imagine", "video"].includes(cmd))
      return send(reply("unknown command"));

    const wanted =
      String(ix.data?.options?.find((o) => o.name === "model")?.value ?? "") ||
      (cmd === "video" ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL);
    const list = await models().catch(() => []);
    const model = list.find((m) => m.id === wanted);
    if (!model)
      return send(
        reply(
          `unknown model \`${wanted}\` — ids: ${list
            .slice(0, 10)
            .map((m) => m.id)
            .join(", ")}…`,
        ),
      );

    // Private line: NSFW-flagged guild channels or bot DMs only.
    const inDm = ix.channel?.type === 1;
    if (isPrivateModel(model.id) && !inDm && ix.channel?.nsfw !== true)
      return send(
        reply(
          "Private-line models run in **bot DMs** or **NSFW-flagged channels** only — private means actually private. Open a DM with me and run the same command.",
        ),
      );

    // ACK fast (3s limit), finish the job in the background
    send({ type: 5 });
    finishJob(ix, prompt, model);
  });
}).listen(process.env.PORT ?? 8787, () => console.log("listening /interactions"));
