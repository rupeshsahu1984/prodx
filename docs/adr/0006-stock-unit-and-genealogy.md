# ADR 0006 — Stock unit identity and genealogy

Status: Accepted · 2026-09-12 · Gap 4

## Context

Traceability granularity differs by material. A fabric roll is individually identified and
carries its own shade, grade and length. Corrugated board is tracked by batch. Consumables are
bulk. A recall must answer both directions: *where did this go* and *what went into this*.

## Decision

### One entity, explicit granularity

`StockUnit` represents a tracked physical entity, with a `granularity` of `BULK`, `LOT` or
`SERIAL`. A textile roll is a `SERIAL` stock unit; a board batch is `LOT`; consumables are `BULK`.
Attributes that allocation depends on — shade band, grade, length, weight — live on the stock unit.

### Genealogy is a directed acyclic graph, not a tree

```
StockUnitLink(parent_stock_unit_id, child_stock_unit_id, transformation_id, quantity_contributed)
```

A `parent_id` column on the child cannot represent a merge, and merges are routine: a beam
produces many rolls (split), pieces from several rolls become one shipment (merge), and a dye
batch consumes several greige lots to produce several graded outputs (both at once).

Traversal is a recursive CTE in both directions. `transformation_id` points at the document
that caused the link — the work order, the grading transaction, the packing list — so the trace
explains itself rather than being a bare edge.

## Consequences

- Allocation rules can constrain on stock-unit attributes. This is what makes shade continuity
  (ADR 0009, to be written) possible at all.
- Trace queries are recursive and must be depth-limited and indexed on both columns.
- `BULK` items still get a stock unit row, so the ledger has one uniform shape. The alternative
  — a nullable stock unit — puts a branch in every inventory query forever.
- Genealogy rows are append-only. A correction adds a reversing transformation; it never
  deletes an edge, because a recall must see what was believed at the time.
