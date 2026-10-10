// LivePair → X/Twitter poster — zero deps, Node 20+.
// Generates an image (or video) with LivePair, uploads it to X, posts a tweet.
//
//   LP_KEY=lp_... X_API_KEY=.. X_API_SECRET=.. X_ACCESS_TOKEN=.. X_ACCESS_SECRET=.. \
//     node twitter-bot.mjs "a cat astronaut" [--video] [--model <id>] [--text "tweet text"]
//
// Get X keys: developer.x.com → create app → "Read and write" permissions →
// Keys and Tokens. Free tier can post + upload media (no read endpoints).
import { createHmac, randomBytes } from "node:crypto";
import { generate } from "./lib/livepair.mjs";
const { LP_KEY, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
for (const [k, v] of Object.entries({ LP_KEY, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET }))
  if (!v) { console.error(`missing env ${k}`); process.exit(1); }

const args = process.argv.slice(2);
const prompt = args.find((a) => !a.startsWith("-"));
const video = args.includes("--video");
const model = args[args.indexOf("--model") + 1] ?? (video ? "wan-3.0-t2v" : "qwen-image-3");
const text = args[args.indexOf("--text") + 1] ?? prompt;
if (!prompt) { console.error('usage: node twitter-bot.mjs "prompt" [--video] [--model id] [--text t]'); process.exit(1); }

// --- OAuth 1.0a signing ---
const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
function oauthHeader(method, url, extra = {}) {
  const p = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: "1.0",
    ...extra, // for multipart posts X ignores body params in signature
  };
  const base = [method, pct(url), pct(Object.keys(p).sort().map((k) => `${pct(k)}=${pct(p[k])}`).join("&"))].join("&");
  const sig = createHmac("sha1", `${pct(X_API_SECRET)}&${pct(X_ACCESS_SECRET)}`).update(base).digest("base64");
  p.oauth_signature = sig;
  return "OAuth " + Object.keys(p).filter((k) => k.startsWith("oauth_")).sort().map((k) => `${pct(k)}="${pct(p[k])}"`).join(", ");
}
const xpost = async (url, body, headers = {}) => {
  const res = await fetch(url, { method: "POST", headers: { Authorization: oauthHeader("POST", url), ...headers }, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X ${url} → ${res.status}: ${JSON.stringify(j)}`);
  return j;
};

// --- LivePair generate ---
console.log(`generating ${video ? "video" : "image"} (${model})…`);
const mediaUrl = await generate(LP_KEY, { model, prompt });

// --- X media upload (v1.1) + tweet (v2) ---
const media = await fetch(mediaUrl).then((r) => r.arrayBuffer());
const form = new FormData();
form.append("media", new Blob([media]), video ? "video.mp4" : "image.png");
const up = await xpost("https://upload.twitter.com/1.1/media/upload.json", form);
const mediaId = up.media_id_string;
if (up.processing_info) {
  for (let i = 0; i < 30 && up.processing_info?.state !== "succeeded"; i++) { // async video processing
    await new Promise((r) => setTimeout(r, (up.processing_info?.check_after_secs ?? 3) * 1000));
    const st = await fetch(`https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
      { headers: { Authorization: oauthHeader("GET", "https://upload.twitter.com/1.1/media/upload.json", { command: "STATUS", media_id: mediaId }) } });
    up.processing_info = (await st.json()).processing_info;
    if (up.processing_info?.state === "failed") throw new Error(up.processing_info.error?.message ?? "media processing failed");
  }
}
const tweet = await xpost("https://api.x.com/2/tweets",
  JSON.stringify({ text, media: { media_ids: [mediaId] } }),
  { "Content-Type": "application/json" });
console.log("posted:", `https://x.com/i/status/${tweet.data.id}`);
