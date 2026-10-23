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
# The app only needs `node`. Package managers bundled in the base image (npm, npx, corepack, yarn)
# are removed: they are unused at runtime and carried the only HIGH findings in the image scan.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/v1/health >/dev/null || exit 1
# otel.js is a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
CMD ["node", "--enable-source-maps", "--import", "./dist/otel.js", "dist/main.js"]
