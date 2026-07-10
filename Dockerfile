# HariBaik API — Node HTTP murni, tanpa dependency npm (Node >=18).
# Frontend statis (docs/) disajikan oleh Caddy, jadi image ini backend saja.
FROM node:22-slim
WORKDIR /app
COPY package.json server.js ./
COPY api ./api
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
