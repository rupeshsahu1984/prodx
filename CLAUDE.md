# PRODX Manufacturing ERP

Multi-tenant SaaS ERP for **textile** and **carton/corrugated** manufacturing.

Stack: **NestJS** (API) · **Next.js** App Router (web) · **PostgreSQL** · **Prisma** · TypeScript everywhere.

## Source of truth for scope

The clickable prototype in `prototype/` is the functional spec: **15 domains, 151 modules,
6 end-to-end journeys**. Read `prototype/data.js` (module map), `prototype/schemas.js`
(per-module fields, workflow states, validations, posting impacts) and
`prototype/journeys.js` (cross-functional flows) before designing anything.

Full architecture and gap analysis: `docs/architecture.md`.

## The single most important architectural rule

**151 modules do NOT mean 151 CRUD modules.** The prototype's own `behavior()` function
collapses all 151 modules into **13 behaviour families**. Build a small set of shared
**engines**, then make domain modules thin configuration on top:

| Engine | Responsibility |
|---|---|
| Document | Header/line documents, revisions, state, attachments |
| Workflow & Approval | State machine, approval matrix by threshold, SoD (maker ≠ checker), escalation |
| Numbering | Gapless per-(tenant, series, fiscal year) document numbers |
| Stock Ledger | Append-only movements; balances are projections, never mutated in place |
| GL Posting | Double-entry, immutable; corrections are reversals, never edits |
| UoM | Base UoM + item-specific conversions + dual-quantity (meters *and* kg) |
| Costing | Moving weighted average actual cost + standard cost for variance |
| Audit | Append-only who/what/when/why/source on every state change |
| Attachment | S3/MinIO, signed URLs, scan, retention |
| Notification | BullMQ-backed alerts, reminders, escalation timers |

If you are about to write the same validation/state/posting logic a second time,
stop and lift it into an engine.

## Non-negotiable invariants

1. **Tenant isolation is enforced in Postgres, not in application code.** Every business
   table has `tenant_id`; RLS policies read `current_setting('app.tenant_id')`. The Prisma
   client extension sets it via `SET LOCAL` **inside a transaction** (required for PgBouncer
   transaction-mode pooling). App-level `where` clauses are an optimization, never the control.
2. **Posted financial and stock records are immutable.** No `UPDATE`, no `DELETE`. Reverse and repost.
3. **No posting into a closed fiscal period.** The posting engine checks period status; there is no bypass.
4. **Every write endpoint accepts an idempotency key.** Gate scanners, weighbridges and
   shop-floor terminals retry on flaky networks and WILL send duplicates.
5. **External calls never happen inside a database transaction.** Use the transactional
   outbox: commit the intent with the data, let a worker deliver it.
6. **Authorization is enforced on the backend for every protected operation.** The frontend
   hides things for usability, never for security.
7. **Optimistic locking on every mutable business document** (`version` column). Two supervisors
   confirming the same work order must not double-issue stock.

## Repository layout

```
apps/api          NestJS — modular monolith, NOT microservices
apps/web          Next.js App Router
apps/worker       BullMQ processors (own deployable, shared codebase)
packages/db       Prisma schema, migrations, tenant client extension
packages/contracts Zod schemas — the single API contract shared by api + web
packages/core     Domain engines (framework-agnostic, heavily unit-tested)
packages/ui       Design system ported from the prototype
prototype/        The original clickable HTML prototype (spec, do not edit)
```

## Conventions

- **Money**: Prisma `Decimal`, never `Float`. Store minor units where the domain demands exactness.
- **Quantity**: `Decimal` with explicit UoM. Never a bare number.
- **Dates**: `timestamptz` always. Business dates (posting date, effective date) are separate
  from system timestamps and are NOT interchangeable.
- **Enums**: Prisma enums for fixed domain states; lookup tables for anything a tenant can configure.
- **IDs**: UUIDv7 (time-ordered — keeps B-tree inserts local, unlike UUIDv4).
- **Contracts**: define the Zod schema in `packages/contracts` first; both sides import it.
  Never hand-write a duplicate type on the frontend.
- **Business logic lives in services**, never in controllers, never in Next.js components.
- Every list endpoint is **paginated and indexed**. ERP tables reach millions of rows.

## Team workflow

Requirement → inspect existing code → Architect → Database/Prisma → Backend → API contract
→ Frontend → QA → Security → Code review → build/test → done.

Specialist agents live in `.claude/agents/`. The **Architect has final authority** on
architecture and cross-module decisions.

### Rules every agent follows

1. **Inspect before you create.** Search for an existing module, service, Prisma model,
   component, utility or permission before implementing anything.
2. **Never guess** architecture, API contracts, database fields, permissions or business
   rules. Read them, or ask.
3. **Smallest safe change.** Reject unnecessary complexity.
4. **No destructive database changes without explicit approval.** No dropped columns, no
   data-losing migrations, no `prisma db push` against a shared database.
5. **No API contract changes without Architect approval.**
6. **Never expose** passwords, tokens, API keys, database credentials or secrets — in code,
   logs, errors or API responses.
7. **Run typecheck, lint, tests and build before claiming completion.** Do not say
   "complete" while important tests or builds fail — report what is failing instead.
8. **Update documentation** when architecture, APIs, schema or important business rules change.

## Compliance in scope

- **E-way bill** — dispatch-triggered, Part-A/Part-B split, vehicle updates on transshipment,
  validity by distance. Couples directly to the Gate Out and Dispatch modules.
  ⚠ GST e-invoice (IRN) is currently out of scope; e-way bill payloads will need invoice
  details supplied another way. Revisit this with the client.
- **Payroll statutory** — PF, ESI, PT, TDS. Rates and slabs change yearly and PT is
  state-specific: **effective-dated rule tables, never hardcoded**. Payroll must support
  re-runs and arrears. Payroll data is sensitive — restrict and audit access separately.
