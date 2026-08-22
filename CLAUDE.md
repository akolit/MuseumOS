# MuseumOS — Claude Code Guide

## Project Overview

MuseumOS is an inventory and collection-management platform for computing-history museums. A production deployment catalogues ~20,000 exhibits across 16 categories (Books, Cards, Computers, Consoles, Devices, Magazines, Motherboards, Others, Parts, Peripherals, Power Supply, Processors, RAMs, Software, Storage, Terminals).

## Architecture

- **Monorepo**: pnpm workspaces
- **Backend**: NestJS (apps/api) with Prisma ORM
- **Frontend**: React + Vite (apps/web for admin, apps/pwa for mobile capture)
- **Shared**: @museumos/contracts (Zod schemas), @museumos/ui (shadcn components), @museumos/db (Prisma)
- **Database**: PostgreSQL 16 with extensions: uuid-ossp, unaccent, pg_trgm
- **Schema strategy**: Single `exhibits` table with typed core fields + JSONB `attributes` column for category-specific data, validated by JSON Schema per category

## Key Commands

```bash
pnpm install          # Install all deps
docker compose up -d  # Start Postgres, Redis, MinIO
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed categories, locations, admin user
pnpm dev              # Start API + web
```

## Coding Conventions

- TypeScript strict mode everywhere, no `any` without justification
- Conventional Commits (feat:, fix:, chore:)
- No premature abstractions
- Greek + English bilingual: all UI strings via i18next, never hardcoded
- Search: accent-insensitive via `unaccent`, `simple` text search config (no stemming)
- Auth: server-side sessions with HTTP-only cookies, Argon2id hashing, SameSite=Lax cookies
- Permissions: `requirePermission()` guard with verb+resource pattern
- Soft delete only (deleted_at timestamp)
- Audit log on every mutation

## Themes

Three themes via CSS custom properties on `[data-theme]`:
- `light` — neutral whites, orange accent (#E8751A)
- `dark` — OLED black (#0A0A0A)
- `museum` — parchment (#F4EFE6), ink (#1C1917), brass (#A77B3A)

## Build Order

Follow milestone order from the spec. Stop after each milestone for confirmation.
Current progress: Milestone 0 (repo bootstrap).
