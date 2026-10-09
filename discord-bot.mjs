// discord-bot.mjs — Discord slash-command image bot backed by LivePair.
// Zero deps: Discord posts interactions to OUR http endpoint — no gateway,
// no discord.js. Signature verified with Node's built-in ed25519 verify.
//
//   PUBLIC_KEY=<app public key> APP_ID=<app id> LP_KEY=lp_... PORT=8787 \
//     node discord-bot.mjs
//
// One-time setup (register the /imagine command):
//   curl -X PUT "https://discord.com/api/v10/applications/$APP_ID/commands" \
//     -H "Authorization: Bot $BOT_TOKEN" -H "content-type: application/json" \
//     -d '{"name":"imagine","description":"Generate an image on LivePair","type":1,
//          "options":[{"name":"prompt","description":"what to draw","type":3,"required":true}]}'
// then set the app's Interactions Endpoint URL to https://<your-host>:8787/interactions
import { createServer } from "node:http";
import { verify } from "node:crypto";

const PUBLIC_KEY = process.env.PUBLIC_KEY;
const APP_ID = process.env.APP_ID;
const KEY = process.env.LP_KEY;
const LP = "https://livepairai.com";
const MODEL = "qwen-image-3"; // any id from GET /v1/agent/models

async function generate(prompt) {
  const res = await fetch(`${LP}/v1/agent/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({ model: MODEL, prompt }),
  }).then((r) => r.json());
  if (!res.jobId && !res.url) throw new Error("generate rejected — check credits/key");
  if (res.url) return res.url;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await fetch(`${LP}/v1/agent/jobs/${res.jobId}`).then((r) => r.json());
    if (j.status === "done") return j.url;
    if (j.status === "failed") throw new Error(j.error ?? "generation failed");
  }
  throw new Error("timed out");
}

const okSig = (sig, ts, body) =>
  verify(
    "ed25519",
    Buffer.concat([Buffer.from(ts), body]),
    `-----BEGIN PUBLIC KEY-----\n${PUBLIC_KEY}\n-----END PUBLIC KEY-----`,
    Buffer.from(sig, "hex"),
  );

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
    if (!sig || !ts || !okSig(sig, ts, body)) {
      res.writeHead(401).end("bad signature");
      return;
    }
    const ix = JSON.parse(body.toString());

    if (ix.type === 1) { // PING — Discord's endpoint check
      res.writeHead(200, { "content-type": "application/json" }).end('{"type":1}');
      return;
    }

    if (ix.type === 2) { // APPLICATION_COMMAND
      const prompt = ix.data.options?.find((o) => o.name === "prompt")?.value ?? "";
      // ACK fast (3s limit), finish the job in the background
      res.writeHead(200, { "content-type": "application/json" }).end('{"type":5}');
      const followup = `https://discord.com/api/v10/webhooks/${APP_ID}/${ix.token}/messages/@original`;
      try {
        const url = await generate(prompt);
        await fetch(followup, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: url }),
        });
      } catch (e) {
        await fetch(followup, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `failed: ${e.message}` }),
        });
      }
      return;
    }

    res.writeHead(200, { "content-type": "application/json" }).end('{"type":5}');
  });
}).listen(process.env.PORT ?? 8787, () => console.log("listening /interactions"));
