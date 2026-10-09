FROM node:20-slim
WORKDIR /app
COPY . .
# Discord interactions endpoint — Railway/Fly/ECS/VPS all work.
# For the one-shot twitter-bot.mjs, run it in CI or cron instead of this image.
CMD ["node", "discord-bot.mjs"]
