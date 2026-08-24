# Deploying MuseumOS

MuseumOS is a plain Docker Compose stack. It runs on anything that runs Docker —
a VPS, a NUC, a Raspberry Pi 5 — and needs roughly **2 GB RAM**, plus disk for
your images (exhibit photos dominate: budget generously).

This guide covers a self-hosted deployment behind a reverse proxy with TLS.

## Contents

- [What the stack contains](#what-the-stack-contains)
- [Prerequisites](#prerequisites)
- [1. Configure](#1-configure)
- [2. Reverse proxy](#2-reverse-proxy)
- [3. Bring it up](#3-bring-it-up)
- [4. First login](#4-first-login)
- [Backups](#backups)
- [Upgrading](#upgrading)
- [Security checklist](#security-checklist)
- [Troubleshooting](#troubleshooting)

## What the stack contains

`docker-compose.prod.yml` declares five services:

| Service | Role |
|---------|------|
| `postgres` | PostgreSQL 16 with the `uuid-ossp`, `unaccent` and `pg_trgm` extensions |
| `backup` | Nightly `pg_dump`, gzipped, with retention |
| `api` | NestJS. Runs `prisma migrate deploy` on boot, then serves `/api` and `/img` |
| `web` | nginx serving the admin SPA, proxying `/api` and `/img` to `api` |
| `pwa` | nginx serving the mobile capture PWA, same proxying |

Exhibit images are **not** in the database. They live on a host directory
bind-mounted into `api` at `/app/img`. Back that directory up separately.

## Prerequisites

- Docker Engine 24+ with the Compose plugin
- Two DNS names pointing at the host — one for the admin app, one for the
  capture PWA (e.g. `museumos.example.org` and `capture.example.org`)
- Inbound `:80` and `:443` reaching the host, so Let's Encrypt can complete
  its HTTP-01 challenge

## 1. Configure

```bash
cp .env.production.example .env
```

Fill it in. The three that matter most:

```bash
# Generate with: openssl rand -hex 64
SESSION_SECRET=<64+ random hex chars>

# Generate with: openssl rand -base64 32
DB_PASSWORD=<strong password>

WEB_HOST=museumos.example.org
PWA_HOST=capture.example.org
```

> **`SESSION_SECRET` is not optional.** The API refuses to start in production
> without it, and rejects anything under 32 characters. This is deliberate: the
> session cookie is signed with it, so a weak or shared secret lets anyone mint
> a valid administrator session.

Then create the host directories the stack bind-mounts:

```bash
sudo mkdir -p /srv/museumos/{postgres-data,images,backups}
```

Running a second instance on the same host — a demo, or a staging copy next to
production — set `DATA_DIR` to a different directory in each `.env` and create
that one instead:

```bash
sudo mkdir -p /srv/museumos-demo/{postgres-data,images,backups}
```

> Two instances must never share a `DATA_DIR`. Both would start a PostgreSQL
> server against the same data directory, which corrupts it, and the second
> instance would serve the first one's collection.

## 2. Reverse proxy

**If your platform already provides one** — [Coolify](https://coolify.io/),
Dokploy, CapRover, Cloudron — use it. Bind `WEB_HOST` to the `web` service and
`PWA_HOST` to `pwa` in its UI, then delete the `labels:` and `networks:` blocks
from `web` and `pwa` in `docker-compose.prod.yml`, along with the `proxy-net`
entry at the bottom. The platform handles TLS.

**If you're running your own Traefik**, the labels are already there. Point
these at it:

```bash
PROXY_NETWORK=<the Docker network your Traefik watches>
PROXY_CONSTRAINT_LABEL=<its constraint label, if it uses one>
```

The network must already exist and be owned by Traefik — MuseumOS joins it as
`external` and never manages its lifecycle. The labels assume a certificate
resolver named `letsencrypt`; rename it in the compose file if yours differs.

**If you have no proxy yet**, Traefik and Caddy are both reasonable. Caddy is
the shorter path — it obtains certificates with no configuration beyond the
hostname.

Whichever you use, set the hop count so the API can find the real client IP:

```bash
TRUST_PROXY_HOPS=2
```

**Count the proxies that append to `X-Forwarded-For`, and be exact.** The
default of `2` matches this compose file, where requests reach the API as
`client → Traefik → nginx → api`: Traefik sets the header, the `web`/`pwa`
nginx appends to it. Use `1` if you expose the API directly behind a single
proxy, and add one for a CDN in front.

This is what the login rate limiter keys on and what the audit log records:

- **Too low** — `req.ip` resolves to the innermost proxy, so every client on
  the internet shares one rate-limit bucket. One attacker locks out everyone.
- **Too high** — a client can forge its own address by sending an
  `X-Forwarded-For` header, sidestepping the rate limit and poisoning the
  audit log.

To check, log in and confirm the audit-log entry records your real address:

```sql
SELECT action, ip, created_at FROM audit_log WHERE action = 'login'
ORDER BY created_at DESC LIMIT 5;
```

## 3. Bring it up

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The `api` container runs `prisma migrate deploy` at boot, so the schema is
created on first start. Watch it:

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

Then seed the categories, locations and the first admin user:

```bash
docker compose -f docker-compose.prod.yml exec api pnpm db:seed
```

## 4. First login

The seed prints the generated admin password **once**:

```
  Admin user:
    ✓ Created admin: admin@example.org (role: admin)
    ⚠ Generated password (shown once — save it now): kJ8x...
```

Save it, log in at `https://$WEB_HOST`, and change it under **Settings →
Account**. To choose the password yourself instead, set `SEED_ADMIN_PASSWORD`
before seeding — and remove it from `.env` afterwards.

Verify:

```bash
curl -I https://museumos.example.org
curl -s https://museumos.example.org/api/health
```

## Backups

The `backup` service dumps PostgreSQL nightly to `$DATA_DIR/backups`. That
covers the catalogue but **not the images** — those are files on disk. Back up
`$DATA_DIR/images` with whatever you already use (restic, borg, rsync to a
second machine).

Restore a dump with:

```bash
gunzip -c backup.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U museumos museumos
```

Test your restore path before you need it.

## Upgrading

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically on `api` boot. Take a database backup first —
Prisma migrations are not reversible.

## Security checklist

Before exposing an instance to the internet:

- [ ] `SESSION_SECRET` is a fresh 64-character random value, unique to this deployment
- [ ] `DB_PASSWORD` is strong, and PostgreSQL is **not** port-mapped to the host
      (`docker-compose.prod.yml` deliberately uses `expose:`, not `ports:` —
      `docker-compose.yml` maps ports for local development only, never deploy it)
- [ ] The seeded admin password has been changed, and any `SEED_ADMIN_PASSWORD`
      removed from the environment
- [ ] `TRUST_PROXY_HOPS` matches your actual proxy depth, so the login rate
      limiter throttles per client rather than per proxy
- [ ] `CORS_ORIGINS` lists only hostnames you control
- [ ] TLS is terminated and HTTP redirects to HTTPS
- [ ] `.env` is not committed, and not readable by other users on the host
- [ ] Backups run, and you have restored one successfully at least once

Note that `/img` is served **without authentication** — anything under the
images directory is readable by anyone who knows or guesses its URL. If you
store scanned donation forms (which contain donor personal data), consider
whether that is acceptable for your deployment, and put the images directory
behind your proxy's auth if it isn't.

## Troubleshooting

**API exits immediately with a `SESSION_SECRET` error.** Working as intended —
set it to 32+ characters and restart.

**Login says "Invalid credentials" for the seeded admin.** The seed only creates
the user if that email doesn't already exist. If you seeded once, changed
`SEED_ADMIN_PASSWORD`, and reseeded, nothing happened the second time. Reset the
password directly, or delete the row and reseed.

**Everyone gets rate-limited at once.** `TRUST_PROXY_HOPS` is wrong, so every
request is attributed to the proxy's IP and shares one bucket.

**Images 404 but the app works.** The bind-mount isn't lining up. Confirm the
host directory exists and that `api` sees it: `docker compose exec api ls /app/img`.

**Certificates never issue.** Inbound `:80` must reach the proxy for the HTTP-01
challenge. Check the DNS record resolves to this host and that nothing upstream
(router, firewall, another web server) is holding port 80.
