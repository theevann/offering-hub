FROM node:20.19.0-slim AS base

WORKDIR /app
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libxss1 \
    libasound2 \
    libgbm-dev \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS dev
ENV NODE_ENV=development
COPY . .
RUN mkdir -p /app/session /app/logs /app/.wwebjs_cache \
    && chown -R node:node /app/session /app/logs /app/.wwebjs_cache
USER node
CMD ["npm", "run", "dev"]

FROM deps AS prod-build
COPY . .
RUN npm prune --omit=dev

FROM base AS prod-runtime
ENV NODE_ENV=production
COPY --from=prod-build --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-build --chown=node:node /app/package*.json ./
COPY --from=prod-build --chown=node:node /app/src ./src
RUN mkdir -p /app/session /app/logs && chown node:node /app/session /app/logs
USER node
CMD ["node", "src/index.js"]
