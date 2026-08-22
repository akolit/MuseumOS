# syntax=docker/dockerfile:1.6
#
# MuseumOS admin web — production image (linux/arm64).
# Builds the Vite SPA, then serves it with nginx which also reverse-proxies
# /api and /img to the API container.

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

COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/ui packages/ui
# packages/config provides the shared tsconfig presets (extended by web/ui)
# and the shared tailwind preset (imported by apps/web/tailwind.config.ts).
COPY packages/config packages/config
COPY tsconfig.base.json ./
# Bundled into the admin web's `/changelog` page via a Vite raw import.
COPY CHANGELOG.md ./

RUN pnpm --filter @museumos/web build

# ---- Runtime: nginx serving static + reverse-proxying /api and /img ----
FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine already has a sensible entrypoint + CMD.
