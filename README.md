# PRODX Manufacturing ERP

Multi-tenant SaaS ERP for textile and carton manufacturing.
**NestJS · Next.js · PostgreSQL · Prisma · TypeScript**

## Where to start reading

| Document | What it settles |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Architecture, and 22 gaps the prototype leaves open, ranked by cost to fix later |
| [`docs/adr/`](docs/adr) | The eight decisions that are expensive to reverse — read these before touching the schema |
| [`CLAUDE.md`](CLAUDE.md) | Invariants, conventions and the team workflow |
| [`prototype/`](prototype) | The clickable prototype. **This is the functional spec** — 15 domains, 151 modules. Do not edit. |

The one thing to understand first: the prototype's own `behavior()` function maps all 151
modules onto **13 behaviour families**. The build is therefore ~10 shared engines with the
modules configured on top — not 151 hand-written CRUD modules.

## Layout

```
apps/api           NestJS — modular monolith
apps/web           Next.js App Router
apps/worker        Outbox dispatcher and background jobs
packages/db        Prisma schema, tenant client extension, RLS scripts
packages/core      Engines. No Nest, no Prisma — unit-testable without a database.
packages/contracts Zod schemas shared by api and web
prototype/         The original prototype (spec)
```

## Getting started

```bash
pnpm install
cp .env.example .env          # then edit the credentials

# Postgres 16+ and Redis 7+ are expected on the URLs in .env
pnpm db:migrate               # creates the schema
psql "$DATABASE_MIGRATION_URL" -f packages/db/scripts/rls.sql   # REQUIRED — see below
pnpm db:generate

pnpm dev                      # api :3001, web :3000
```

### RLS is not optional

`scripts/rls.sql` is what actually enforces tenant isolation (ADR 0002). Until it has run,
every tenant can read every other tenant's data. It:

- creates the non-owner `prodx_app` role the application connects as,
- enables **and forces** row level security on every table with a `tenant_id`,
- installs append-only triggers on the stock ledger, genealogy, journal and audit tables.

Run `scripts/check-rls.sql` in CI. It returns rows only when a table is unprotected, so a
non-empty result should fail the build. A new table without a policy is a defect.

## Verification

```bash
pnpm typecheck && pnpm test && pnpm build
```

Phase 0 status: 19 unit tests covering the numbering, fiscal-period and valuation engines;
all six packages build and typecheck. Integration tests against a real Postgres — which is the
only way to test RLS and transaction semantics meaningfully — arrive with Phase 1.

## Build order

Journeys, not modules. Phase 0 is the engines; Phase 1 is Procure-to-Pay with Gate, which
exercises the stock ledger, GL, approvals, numbering and device idempotency in one flow.
The full sequence is in [`docs/architecture.md`](docs/architecture.md#6-build-order).
