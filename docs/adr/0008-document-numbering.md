# ADR 0008 — Gapless document numbering

Status: Accepted · 2026-09-12 · Gap 6

## Context

Indian statutory document series — invoices in particular — must not have gaps. The naive
`MAX(number) + 1` produces duplicates the first time two users save simultaneously, and the
defect typically surfaces at an audit rather than in testing.

## Options

1. **`MAX(number) + 1`** — races. Rejected.
2. **Postgres `SEQUENCE`** — concurrent and fast, but deliberately leaks numbers on rollback.
   Rejected for statutory series; acceptable for internal references.
3. **Locked counter row** — serializes per series, no gaps.

## Decision

A `NumberSeries` row per `(tenant, legal_entity, series_code, fiscal_year)`, incremented inside
the same transaction as the document insert:

```sql
UPDATE number_series SET next_value = next_value + 1
 WHERE tenant_id = $1 AND legal_entity_id = $2
   AND series_code = $3 AND fiscal_year = $4
RETURNING next_value - 1;
```

The row lock is held until commit, so a rolled-back document returns its number. Format is a
template on the series (`INV/{FY}/{####}`), resolved after the number is allocated.

## Consequences

- Number allocation serializes per series. This is correct, not a bottleneck: contention is per
  series per legal entity, and the lock is held only for the remainder of one transaction.
- **Document creation must therefore be a short transaction.** No external calls, no file
  uploads, no user interaction while the lock is held. This constraint is why the transactional
  outbox exists (ADR to follow) and it is stated in the backend agent's rules.
- Series are configured per legal entity and fiscal year, and roll over automatically. Rollover
  is a scheduled job with an idempotency guard, not a lazy create-on-first-use, so that the
  first invoice of a new year does not race.
- Internal, non-statutory references (event ids, scan ids) use sequences or UUIDs. Gapless
  numbering is reserved for documents that legally require it.
