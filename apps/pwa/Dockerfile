# syntax=docker/dockerfile:1.6
#
# MuseumOS capture PWA — production image (linux/arm64).
# Builds the Vite + Workbox bundle, then serves it with nginx which also
# reverse-proxies /api and /img to the API container (same-origin from the
# browser's POV, so no CORS needed).

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/pwa/package.json apps/pwa/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/pwa apps/pwa
COPY packages/contracts packages/contracts
COPY packages/ui packages/ui
# Shared tsconfig + tailwind presets — extended by apps/pwa/tsconfig.json
# and imported by apps/pwa/tailwind.config.ts.
COPY packages/config packages/config
COPY tsconfig.base.json ./
# Bundled into /changelog via a Vite raw import. Same source as the admin web.
COPY CHANGELOG.md ./

RUN pnpm --filter @museumos/pwa build

# ---- Runtime: nginx serving static + reverse-proxying /api and /img ----
FROM nginx:alpine AS runtime
COPY apps/pwa/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/pwa/dist /usr/share/nginx/html

EXPOSE 80
