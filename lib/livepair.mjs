// lib/livepair.mjs — shared zero-dependency LivePair client for the bots.
// One fetch wrapper, one job poller, one error type — every bot in this
// repo talks to the API through this file.
const BASE = process.env.LIVEPAIR_BASE ?? "https://livepairai.com";

export class LivePairError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "LivePairError";
    this.status = status;
  }
}

async function api(path, { method = "GET", key, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-api-key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new LivePairError(j.error ?? `${method} ${path} → HTTP ${res.status}`, res.status);
  return j;
}

/** Live model catalog — free, no key. Returns the array. */
export async function listModels() {
  const j = await api("/v1/agent/models");
  return Array.isArray(j) ? j : j.models ?? [];
}

/**
 * Generate media: submit → poll the job → resolve the media URL.
 * Media URLs auto-delete after 48h — download immediately.
 */
export async function generate(key, { model, prompt, ...extra }, { pollMs = 2000, timeoutMs = 600_000 } = {}) {
  const res = await api("/v1/agent/generate", {
    method: "POST",
    key,
    body: { model, prompt, ...extra },
  });
  if (res.url) return res.url;
  const jobId = res.jobId ?? String(res.poll ?? "").split("/").pop();
  if (!jobId) throw new LivePairError(res.error ?? "generate rejected — check key/credits");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const j = await api(`/v1/agent/jobs/${jobId}`);
    if (j.status === "done") return j.url;
    if (j.status === "failed" || j.status === "error")
      throw new LivePairError(j.error ?? "generation failed");
  }
  throw new LivePairError(`job ${jobId} timed out after ${timeoutMs}ms`);
}
