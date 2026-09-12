# ADR 0007 — Fiscal calendar and period locks

Status: Accepted · 2026-09-12 · Gap 5

## Context

The prototype has a "Period Close & Reconciliation" page, but nothing structurally prevents a
posting from landing in a closed period. Once six months of transactions exist, adding this
means finding and cleaning back-dated postings by hand.

## Decision

```
FiscalYear (legal-entity scoped) → FiscalPeriod { OPEN | SOFT_CLOSED | CLOSED }
```

- **OPEN** — normal posting.
- **SOFT_CLOSED** — only reversals and adjustment journals, and only with an explicit permission.
  This is the state a period sits in while accounts are being finalized.
- **CLOSED** — nothing posts. Reopening is an audited action requiring elevated permission.

The posting engine resolves the period from the document's **posting date** and checks status.
There is **no bypass flag and no admin override path in code** — the only way to post into a
soft-closed period is the permission, and into a closed one, reopening it.

`posting_date` is a distinct column from `created_at`. They are never used interchangeably: one
is a business fact the user chooses, the other is a system timestamp.

## Consequences

- Every posting path takes a posting date and resolves a period. This is a parameter on the
  posting engine's interface, not an ambient value.
- Stock movements are period-checked too, not only GL. Inventory that moves in a closed period
  silently breaks the GL-to-inventory reconciliation.
- Late documents (a supplier invoice arriving after close) post to the current open period with
  a reference to the original document date. This is standard practice and must be the
  documented workflow, otherwise users will ask for the override.
