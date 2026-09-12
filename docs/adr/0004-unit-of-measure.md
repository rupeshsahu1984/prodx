# ADR 0004 — Unit of measure and dual quantity

Status: Accepted · 2026-09-12 · Gap 2

## Context

The most underestimated decision in the project. In textile and carton, one physical thing
carries several quantities at once and the business uses different ones for different purposes:

- A fabric roll is 120 metres **and** 28.5 kg, at 180 GSM and 1.6 m width.
- A carton order is 5,000 pieces **and** 1,240 m² of board **and** 890 kg — priced per kg while
  being produced per piece.

Critically, the second quantity is frequently **measured, not computed**. The weighbridge
reports actual weight; the roll is weighed on receipt. Theoretical weight from GSM × area is
an estimate, and the difference is exactly what the business wants to see.

## Decision

1. Every item has a **base UoM**. All stock is stored in base UoM.
2. Items may be flagged **dual-UoM**, carrying a secondary UoM. Every stock movement and every
   balance stores **both quantities**.
3. The secondary quantity is **captured at the transaction, never derived at read time.**
   Derivation is available only as a default the user may override, and the variance between
   theoretical and actual is reportable.
4. Conversion factors are **item-specific** (`ItemUomConversion`), because metres↔kg depends on
   GSM and width. Dimensionless conversions (kg↔g, m↔cm) live in a global table as fallback.
5. Quantities are `Decimal`, always carried with their UoM. A bare number is never a quantity.

## Consequences

- Stock ledger and balance tables carry `quantity`/`uom` and `secondary_quantity`/`secondary_uom`.
- Costing must state which quantity it values. Default: base UoM, with per-item override where
  the trade prices on the secondary (carton board sold per kg).
- Pricing, planning and capacity each declare the UoM they operate in. Mixing them silently is
  the failure mode this ADR exists to prevent.
- Retrofitting this later would mean rewriting inventory, costing and pricing together, which
  is why it is decided before the first migration.
