// register-commands.mjs — one-time Discord slash-command registration.
//
//   APP_ID=<app id> BOT_TOKEN=<bot token> node register-commands.mjs
//
// Registers /imagine and /video globally (propagates in ~1h). For instant
// testing in one server, pass GUILD_ID=<guild id> to register guild-scoped.
const APP_ID = process.env.APP_ID;
const TOKEN = process.env.BOT_TOKEN;
const GUILD = process.env.GUILD_ID;
if (!APP_ID || !TOKEN) {
  console.error("APP_ID and BOT_TOKEN required");
  process.exit(1);
}

const option = (name, description, required = false) => ({
  name,
  description,
  type: 3, // STRING
  required,
});

const commands = [
  {
    name: "imagine",
    description: "Generate an image with LivePair",
    type: 1,
    options: [
      option("prompt", "what to draw", true),
      option("model", "model id (default qwen-image-3)"),
    ],
  },
  {
    name: "video",
    description: "Generate a video clip with LivePair",
    type: 1,
    options: [
      option("prompt", "what to animate", true),
      option("model", "model id (default wan-3.0-t2v)"),
    ],
  },
];

const url = GUILD
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

for (const cmd of commands) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  console.log(r.ok ? `✓ /${cmd.name}` : `✗ /${cmd.name}: ${JSON.stringify(j)}`);
}
console.log(GUILD ? "guild-scoped — instant" : "global — propagates within ~1h");
