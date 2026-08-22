# syntax=docker/dockerfile:1.6
#
# MuseumOS API — production image (linux/arm64, Raspberry Pi 5)
#
# Workspace packages @museumos/contracts and @museumos/db ship as raw .ts
# (package.json "main": "./src/index.ts"), so the API runs via tsx in
# production. That keeps the build simple at the cost of ~50ms boot
# overhead — acceptable for the current scale. Revisit with esbuild
# bundling if we ever need cold-start to be tighter.
#
# Images are NOT baked into the image; the host's /srv/museumos/images
# is bind-mounted to /app/img at runtime (see docker-compose.prod.yml).

FROM node:22-alpine AS base
# poppler-utils provides pdftoppm, used to render PDF first-page thumbnails
# (e.g. scanned donation forms attached to donors).
RUN apk add --no-cache libc6-compat openssl tini poppler-utils
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app

# ---- Install workspace deps and generate Prisma client ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/pwa/package.json apps/pwa/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/

# --ignore-scripts skips postinstall hooks (e.g. Prisma's auto-generate)
# until we have the schema copied in.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the source we need at runtime
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/db packages/db
# One-off import/maintenance scripts (import-donors.mjs, etc.). Run via
# `docker exec <api> node /app/scripts/<name>.mjs ...`. xlsx + pg are
# already in /app/node_modules so module resolution works in-place.
COPY scripts scripts

# Generate the Prisma client; binaryTargets in schema.prisma includes
# linux-musl-arm64-openssl-3.0.x for this image.
RUN pnpm --filter @museumos/db exec prisma generate

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production
ENV API_PORT=3000

COPY --from=deps /app /app

EXPOSE 3000

# tini reaps zombies and forwards SIGTERM cleanly to Node.
ENTRYPOINT ["/sbin/tini", "--"]

# Apply pending migrations on boot, then start the API.
CMD ["sh", "-c", "pnpm --filter @museumos/db exec prisma migrate deploy && pnpm --filter @museumos/api exec tsx src/main.ts"]
