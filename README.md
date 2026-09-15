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
packages/pack-sdk  Industry-pack contract and registry
packs/carton       Corrugated carton pack
packs/textile      Textile & garment pack
prototype/         The original prototype (spec)
```

## Industry packs

The core ERP is industry-neutral. Corrugated carton and textile ship as **packs** that a tenant
installs or removes (ADR 0009):

- A pack owns its own tables, permissions, document types and screens, and depends only on
  `@prodx/pack-sdk`. Core never imports a pack; no pack imports another.
- **Install is per tenant, not per schema.** Every pack's tables exist in every deployment —
  one customer removing textile must not touch another customer on the same database.
- A pack's tables are gated by RLS on `app.packs`, so disabling a pack hides its data
  everywhere at once: API, reports and background jobs, with no application check to forget.
- **Uninstall is refused while the pack holds data.** The answer is `disable`: the screens go,
  the history stays readable. There is no purge flag — deleting posted manufacturing history is
  not an operation this system offers.
- Core rows survive either way. A textile item is still an `item`, its movements are still
  `stock_ledger_entry` rows, and the ledger stays reconcilable.

The demo tenant ships with **carton installed and textile not**, so the plugin behaviour can be
exercised from the Industry packs panel.

## Getting started

```bash
pnpm install
cp .env.example .env          # then replace every REPLACE_ME

# Postgres 16+ and Redis 7+ are expected on the URLs in .env
pnpm db:migrate               # creates the schema
pnpm db:generate

# Tenant isolation. Both are REQUIRED — see below.
psql "$DATABASE_MIGRATION_URL" -v app_password="$PRODX_APP_PASSWORD" \
     -f packages/db/scripts/create-app-role.sql
psql "$DATABASE_MIGRATION_URL" -f packages/db/scripts/rls.sql

# demo tenant you can sign into
pnpm --filter @prodx/api build && pnpm --filter @prodx/api seed:demo

pnpm dev                      # api :3001, web :3000
```

Then open **http://localhost:3000** and sign in:

| | |
|---|---|
| Tenant code | `DEMO` |
| `admin@prodx.demo` | Superadmin — both factories |
| `carton.head@prodx.demo` | Carton Plant only |
| `textile.head@prodx.demo` | Textile Plant only |
| `carton.stores@prodx.demo` | Carton Plant, Stores department, fewer rights |
| Password | `prodx-demo-2026` |

The two plant heads hold the **same role** and see completely different data. Permissions
decide which actions a user may take; **scope** decides which data they may touch, and scope
is enforced by row level security rather than by a filter any developer could forget.

**Receive** on the purchase order creates a draft for everything outstanding; **Post** moves
stock, revalues the items and writes the journal in one transaction; **Reverse** puts all of
it back. Sign in as the buyer to watch the same Reverse button return 403 from the backend.

### Authentication and authorization

The tenant is derived from a **signed JWT claim** — never a header, query parameter or body
field, any of which a caller controls. `POST /auth/login` returns a 15-minute access token
and a rotating refresh token; the refresh token is stored hashed and is revocable, and reuse
of an already-rotated token revokes the whole family for that user, since reuse means it leaked.

Authorization is a **globally applied guard that denies by default**. A route with no
`@RequirePermission(...)` and no `@Public()` returns 403 rather than being open — a forgotten
decorator becomes an obvious failure in development instead of a breach in production.

Passwords use scrypt from Node's standard library (OWASP parameters, no native module), with
account lockout after repeated failures.

### RLS is not optional

`scripts/rls.sql` is what actually enforces tenant isolation (ADR 0002). Until it has run,
every tenant can read every other tenant's data. It:

- asserts the non-owner `prodx_app` role exists (created by `create-app-role.sql`,
  which requires a password to be supplied rather than carrying one),
- enables **and forces** row level security on every table with a `tenant_id`,
- installs append-only triggers on the stock ledger, genealogy, journal and audit tables.

Run `scripts/check-rls.sql` in CI. It returns rows only when a table is unprotected, so a
non-empty result should fail the build. A new table without a policy is a defect.

## Verification

```bash
# unit tests — no database needed
pnpm --filter @prodx/core --filter @prodx/api test

# integration tests — prove RLS, immutability and gapless numbering
brew services start postgresql@16
packages/db/scripts/setup-test-db.sh
pnpm --filter @prodx/db test

pnpm typecheck && pnpm build
```

Phase 0 status: **73 tests passing.** 53 unit tests (numbering, fiscal periods, valuation,
passwords, permissions, JWT, auth middleware, permission guard) and 20 integration tests against a real PostgreSQL 16, which prove:

- a connection that never set a tenant sees **zero rows**, not the whole table
- one tenant cannot read, update or delete another tenant's row **even knowing its exact id**
- an insert carrying another tenant's id is rejected by the policy's `WITH CHECK`
- every one of the 47 tenant-scoped tables carries an enabled, forced policy
- a connection with no plant scope sees **no factory at all**, and one scoped to a single
  factory cannot read or write another's data even by exact id
- the stock ledger, genealogy, journal and audit tables reject `UPDATE` and `DELETE`
  **even for the owning role**
- 25 concurrent allocations produce distinct, contiguous document numbers, and a rolled-back
  transaction returns its number rather than burning it
- posting a goods receipt moves stock, revalues the item, writes a balanced journal, consumes
  purchase-order quantity and queues an outbox message — atomically
- **reversal restores stock, valuation and order quantity exactly**, leaving the original
  entries in place
- a refused posting — closed period, missing permission, over-receipt, double-post — leaves
  **no partial state at all**
- one tenant cannot post another tenant's receipt even with its exact id

The integration suite deliberately **fails** rather than skipping when no database is present.

## Build order

Journeys, not modules. Phase 0 is the engines; Phase 1 is Procure-to-Pay with Gate, which
exercises the stock ledger, GL, approvals, numbering and device idempotency in one flow.
The full sequence is in [`docs/architecture.md`](docs/architecture.md#6-build-order).
