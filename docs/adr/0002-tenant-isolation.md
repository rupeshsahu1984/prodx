# ADR 0002 — Tenant isolation via PostgreSQL RLS

Status: Accepted · 2026-09-12

## Context

Multi-tenant SaaS holding other companies' commercial, financial and payroll data. A
cross-tenant leak is an existential event, not a bug. Isolation must not depend on every
developer remembering a `where` clause across 151 modules.

## Options

1. **Database per tenant** — strongest isolation, but 151 modules × N tenants of migrations,
   and connection-pool exhaustion at any real tenant count.
2. **Schema per tenant** — better, but migration fan-out remains and cross-tenant reporting
   becomes awkward.
3. **Shared schema + application-level filtering** — one forgotten `where` is a breach.
4. **Shared schema + Row Level Security** — the database refuses, regardless of application code.

## Decision

**Shared schema with `tenant_id` on every business table and RLS enforcing it.**

- Policies use `current_setting('app.tenant_id', TRUE)::uuid`.
- `FORCE ROW LEVEL SECURITY` on every table, because the table owner otherwise bypasses RLS
  and Prisma typically connects as owner. Additionally, the application connects as a
  dedicated non-owner role.
- The tenant id is set with `set_config(..., TRUE)` **inside the transaction**, via a Prisma
  client extension, because PgBouncer transaction pooling reuses connections between statements.
- Application-level `where: { tenantId }` remains, as an index hint and query optimization. It
  is never the control.

## Consequences

- A forgotten filter degrades performance, it does not leak data.
- Anything outside the request path — background jobs, migrations, admin tooling, report
  queries — must establish tenant context explicitly. These are the real risk surface and are
  called out in the security agent's review order.
- Every migration that creates a table must enable and force RLS in the same migration.
  A table without a policy is a defect, and CI checks for it.
- A deliberate cross-tenant role exists for platform operations. Its use is audited.
