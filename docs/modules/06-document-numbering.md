# 06 · Document & Numbering Setup

**Domain** Enterprise & Master Data · **Status** Built (partly) · **Screen** Document & Numbering Setup

---

## Purpose

Issues the numbers that identify every business document — and issues them **without gaps**.

Indian statutory series, invoices in particular, must not skip a number. The naive
`MAX(number) + 1` produces duplicates the first time two users click Save in the same second,
and the defect typically surfaces at an audit rather than in testing (ADR 0008).

---

## Who uses it

| Role | Can |
|---|---|
| Administrator | Create series (`master_data:write`) |
| Everyone else | Read |

---

## Screens

**Document & Numbering Setup** — `Enterprise & Master Data`

Legal entity · Document type · Fiscal year · Format · next value.

---

## Data

| Table | Access |
|---|---|
| `number_series` | read, create |

Unique on (tenant, legal entity, series code, fiscal year).

---

## Rules

### Allocation is a locking UPDATE inside the document's own transaction

```sql
UPDATE number_series SET next_value = next_value + 1
 WHERE tenant_id = $1 AND legal_entity_id = $2
   AND series_code = $3 AND fiscal_year = $4
RETURNING next_value - 1;
```

The row lock is held until commit, so a rolled-back document **returns** its number. A Postgres
`SEQUENCE` is wrong here: it deliberately leaks numbers on rollback.

This serialises allocation per series, which is correct rather than a bottleneck — contention
is per series per legal entity, and the lock is held only for the rest of one transaction.

### Which means document creation must be a short transaction

No external calls, no file uploads, no waiting on a user while the lock is held. This constraint
is why the transactional outbox exists.

### Format placeholders

`{FY}` and a run of `#` giving the zero-padded width: `INV/{FY}/{####}` → `INV/2026-27/0042`.
A value wider than the padding is **not** truncated — silently rewriting a number is worse than
an over-long one.

### Numbers are allocated late

A purchase order gets its number at **release**, a goods receipt at **posting** — not when the
draft is created. A draft that is abandoned should not consume a statutory number, and an
unnumbered document stores `NULL` rather than an empty string, because Postgres permits many
NULLs under a unique index and one empty string collides with the next.

### Internal references do not use this

Event ids, scan references and anything without a legal requirement use UUIDs or sequences.
Gapless numbering is reserved for documents that need it.

---

## Depends on / used by

**Used by** purchase order release and goods receipt posting today; every statutory document
later. Two integration tests prove the properties: 25 concurrent allocations are distinct and
contiguous, and a rolled-back transaction returns its number.

---

## Status

**Built** — create and list series, the locking allocator, format resolution.

**Not built**
- Editing a series, including correcting `nextValue` after a data migration
- **Automatic fiscal-year rollover.** A series is per fiscal year; on 1 April the series for the
  new year must already exist or the first document of the year fails. This needs a scheduled
  job with an idempotency guard — lazy create-on-first-use would race
- Per-plant or per-document-category series
- A preview of the next number before allocation

**Deliberately excluded** — resetting a series downwards. Reissuing a number that has already
been on a document sent to a customer is not an operation this system should offer.

---

## Decisions

- **A counter row, not a sequence.** Sequences are faster and leak numbers; the statute cares
  about the gaps, not the speed.
- **Per fiscal year, not continuous.** Indian practice restarts each year, and the format
  carries `{FY}` so the number stays unambiguous.

**Open** — whether a cancelled document should release its number for reuse. Today it does not;
the number stays consumed and the document stays in the series as cancelled, which is the
conservative reading of the requirement and worth confirming with the client's auditor.
