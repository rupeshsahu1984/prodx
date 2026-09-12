# ADR 0005 — Inventory valuation method

Status: Accepted · 2026-09-12 · Gap 3

## Context

The prototype has a "Standard & Actual Cost" page with no method behind it. The choice is not
a setting — FIFO, weighted average and standard cost require *different stock ledger columns*,
so it must be made before the ledger exists.

Textile and carton both split and merge lots constantly: a dye lot is re-graded into A/B/seconds,
rolls are cut and rejoined, board trim is recovered. FIFO layer tracking degrades badly under
those transformations, and reconstructing layers after a re-grade is close to arbitrary.

## Decision

**Moving weighted average per (item, plant)** as the actual valuation, with **standard cost held
separately** for variance analysis.

- `ItemPlantValuation` holds `quantity_on_hand`, `total_value` and derived `unit_cost`, updated
  **inside the same transaction** as the stock ledger insert.
- Unit cost is `Decimal(18, 6)`. Total value is `Decimal(18, 2)`.
- Standard cost lives on a versioned, effective-dated `StandardCost` record. Purchase price
  variance and production variance are computed against it and posted to dedicated GL accounts.
- Negative stock is rejected by default, per plant. Allowing it makes weighted average
  meaningless, and the "we'll fix it later" backdated correction is the usual cause of
  irreconcilable inventory.

## Consequences

- Valuation is explainable at audit in one sentence, which matters more than theoretical precision.
- Lot-level actual cost is not available. Where a customer genuinely needs per-lot cost, it is
  derived from the production order's actual cost, not from the inventory layer.
- The valuation row is a write hotspot per (item, plant). Acceptable — contention is per item,
  and the update is inside a transaction that is already writing the ledger.
- Changing method later requires a revaluation at a period boundary. Treat as a migration project.
