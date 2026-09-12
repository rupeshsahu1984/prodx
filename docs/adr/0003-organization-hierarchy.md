# ADR 0003 — Organization hierarchy and entity scope

Status: Accepted · 2026-09-12 · Gap 1

## Context

The prototype represents the organization as a single card reading "Plant 01". Real
deployments have multiple legal entities and multiple plants, and different master data
belongs at different levels. Deciding this after tables exist means re-keying the schema.

## Decision

```
Tenant → LegalEntity (company) → Plant → Warehouse → StorageLocation
```

Scope assignment, fixed per entity:

| Level | Entities |
|---|---|
| Tenant | Item, UoM, Party (customer/supplier), User, Role, Item characteristics |
| LegalEntity | Fiscal calendar, GL accounts, number series for statutory documents, tax registration |
| Plant | Stock, work orders, capacity, gate and weighbridge events, BOM/routing versions |
| Warehouse / Location | Stock balances, put-away and picking rules |

Scope is expressed as **explicit nullable foreign keys** (`legal_entity_id`, `plant_id`), not
a polymorphic `org_unit_id`. A generic column is more elegant and strictly worse here: it
loses referential integrity, produces unusable indexes, and makes every query a union.

## Consequences

- `tenant_id` is present on every business table for RLS, *in addition* to the scope columns.
- Composite indexes take the shape `(tenant_id, plant_id, <business key>)`. An index on
  `tenant_id` alone is useless.
- Inter-plant stock transfer is a first-class document, not an ad-hoc adjustment, because
  stock is plant-scoped by definition.
- An item exists once per tenant; its cost and stock exist per plant. Item *status* may need
  a per-plant override later — anticipated, not built now.
