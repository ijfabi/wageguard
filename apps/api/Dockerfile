# syntax=docker/dockerfile:1
# WageGuard API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t wageguard-api .

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# Full workspace build (all packages are compiled to dist/).
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm build \
 && pnpm deploy --filter @wageguard/api --prod --legacy --ignore-scripts /out

# One-off migration runner (has the Prisma CLI). Used by the `migrate` compose service.
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# Minimal runtime: production dependencies and compiled output only, non-root user.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/v1/health >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
