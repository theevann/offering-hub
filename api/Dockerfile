FROM node:20.19.0-slim AS base

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS dev
ENV NODE_ENV=development
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev:docker"]

FROM deps AS prod-migrate
ENV NODE_ENV=production
COPY . .
RUN npx prisma generate

FROM deps AS prod-build
COPY . .
RUN npx prisma generate && npm prune --omit=dev

FROM base AS prod-runtime
ENV NODE_ENV=production

COPY --from=prod-build --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-build --chown=node:node /app/package*.json ./
COPY --from=prod-build --chown=node:node /app/src ./src
COPY --from=prod-build --chown=node:node /app/prisma ./prisma
COPY --from=prod-build --chown=node:node /app/prisma.config.ts ./prisma.config.ts

USER node

EXPOSE 3000

CMD ["node", "src/index.js"]
