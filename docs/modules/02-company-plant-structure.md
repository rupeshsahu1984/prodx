# 02 · Company / Plant Structure

**Domain** Enterprise & Master Data · **Status** Built (partly) · **Screen** Company / Plant Structure

---

## Purpose

Defines the shape of the business, and with it **what every user can see**.

This module is not filing-cabinet maintenance. The hierarchy it maintains is the spine of the
scoping model (ADR 0003): a user is granted factories and departments, and row-level security
filters every query in the product against them. Create a plant in the wrong legal entity and
its costs land in the wrong books; put a department under the wrong plant and someone sees data
they should not.

Getting this wrong is expensive because it is hard to unwind — stock, orders and journals all
carry the plant they were posted against, and those rows are immutable.

---

## The hierarchy

```
Tenant                     one customer on the SaaS
  └─ Legal Entity          a company that files its own returns — GSTIN, currency, books
       └─ Plant            a factory. Stock, orders and production live here
            ├─ Warehouse   a store within the factory
            │    └─ Storage Location   a bay, rack or yard position
            └─ Department  stores, production, quality, purchase
```

Departments sit beside warehouses rather than inside them: a department is an organisational
unit that owns documents, a warehouse is a physical place that holds stock. The same department
uses several warehouses and the same warehouse serves several departments.

### What lives at which level

| Level | Entities |
|---|---|
| Tenant | Items, units of measure, customers and suppliers, users, roles |
| Legal entity | Fiscal calendar, GL accounts, number series, tax registration |
| Plant | Stock, purchase orders, goods receipts, gate events, production |
| Warehouse / location | Stock balances, put-away and picking |

An item exists once for the tenant; its **cost and stock exist per plant**. That separation is
why an inter-plant transfer is a document rather than an adjustment.

---

## Who uses it

| Role | Can |
|---|---|
| Administrator | Create plants and departments (`master_data:write`) |
| Plant Head | Create departments in **their own** factories — RLS refuses the rest |
| Store Executive | Read only (`master_data:read`) |

A plant head cannot attach a department to a factory outside their scope, and the refusal comes
from the database rather than from a check in the service that could be forgotten.

---

## Screens

**Company / Plant Structure** — `Enterprise & Master Data`

| Section | Shows | Actions |
|---|---|---|
| New plant | Code, name, legal entity | Create plant |
| Per plant | Departments as chips; warehouses with their locations | Add department |

---

## Data

| Table | Access | Notes |
|---|---|---|
| `legal_entity` | read | GSTIN is per legal entity per state |
| `plant` | read, create | Scoped on its **own id**, not a `plant_id` column |
| `warehouse`, `storage_location` | read, created with the plant | |
| `department` | read, create | Documents carry `department_id`; null means plant-wide |

Every foreign key here is `onDelete: Restrict`. A plant with a single posted movement cannot be
deleted, and that is correct — business documents must not vanish because someone tidied up the
master data.

---

## Rules

### A plant is created with a warehouse and a bay

A factory with no warehouse cannot receive anything, so creating a plant also creates
`<CODE>-WH / BAY-01` in the same transaction. Leaving it as a second step produces plants that
look ready and reject the first goods receipt with a message about missing storage.

### Codes are normalised at the edge

`carton-02` is stored as `CARTON-02`. Without this, `carton-02`, `CARTON-02 ` and `Carton-02`
become three factories, and nobody notices for a year.

### Stock at a third party is a location, not a separate table

A location can be flagged `isThirdParty`. Material at a subcontractor is still the company's
stock — it is legally theirs while physically elsewhere — so it stays in the same ledger with a
location that says where it is. Modelling it separately would take job-work stock out of
inventory valuation, which is exactly what an auditor asks about.

### Negative stock is refused per plant

`allowNegativeStock` defaults to false. Allowing it makes moving-average valuation meaningless,
and the back-dated correction that follows is the usual cause of inventory nobody can
reconcile.

---

## Depends on / used by

**Depends on** nothing else — this is the root of the data model.

**Used by** everything. The RLS policies generated in `scripts/rls.sql` scope the `plant` table
on its own id, every table carrying `plant_id` on that column, and every table carrying
`department_id` on the department scope. Seventeen integration tests cover those two dimensions.

---

## Status

**Built** — the hierarchy, plant creation with its warehouse and bay, department creation,
per-plant view of departments and storage.

**Not built**
- Creating or editing a **legal entity** — the seed does it, so a second company needs a
  developer
- Adding warehouses and locations beyond the one created with the plant
- Editing or deactivating a plant
- Shift calendars and capacity, which the prototype places in a separate module
- Inter-plant transfer as a document

**Deliberately excluded** — deleting anything. Restrict foreign keys make it impossible once a
document exists, and a "delete" that silently becomes "deactivate" is worse than no button.

---

## Decisions

- **Explicit `legal_entity_id` and `plant_id` columns, not a generic `org_unit_id`.** The
  polymorphic version is more elegant and strictly worse here: it loses referential integrity,
  produces indexes the planner cannot use, and turns every query into a union.
- **Department beside warehouse, not under it.** They answer different questions — who owns the
  document, and where the goods are.
- **Plant scoped on its own id.** Every other table scopes on `plant_id`; the plant table has
  none, so the RLS generator treats it as a special case rather than leaving it ungated.

**Open** — whether a plant may belong to more than one legal entity over time (a demerger).
Today it cannot. Adding it later means a valid-from date on the relationship, which is a
schema change, so it is worth asking the client before the first go-live.
