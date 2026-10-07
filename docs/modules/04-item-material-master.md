# 04 · Item & Material Master

**Domain** Enterprise & Master Data · **Status** Built (partly) · **Screen** Item & Material Master

---

## Purpose

Defines what the business buys, makes and sells, and — more consequentially — **how each thing
is measured**.

Unit of measure is the most underestimated decision in this product (ADR 0004). A fabric roll
is simultaneously 120 metres, 28.5 kg and 180 GSM. A carton order is 5,000 pieces, 1,240 m² of
board and 890 kg, priced per kg while produced per piece. An item master that stores one
quantity forces every downstream module to guess which one, and the guesses disagree.

---

## Who uses it

| Role | Can |
|---|---|
| Administrator, Plant Head | Create and edit items (`master_data:write`) |
| Store Executive | Read (`master_data:read`) |

---

## Screens

**Item & Material Master** — `Enterprise & Master Data`

| Field | Meaning |
|---|---|
| Code | Normalised to upper case and trimmed |
| Name | |
| Base unit | Every stock figure for this item is in this unit |
| Second unit | Optional. Makes the item dual-UoM |
| Tracking | Lot / batch · Serial (each roll) · Bulk |

---

## Data

| Table | Access | Notes |
|---|---|---|
| `item` | read, create, update | Tenant-scoped; cost and stock are per plant |
| `uom` | read | Dimension: LENGTH, MASS, AREA, VOLUME, COUNT, TIME |
| `item_uom_conversion` | — | Schema exists, no screen yet |
| `stock_unit` | created with the item | One default lot, so the ledger has something to post against |

---

## Rules

### An item exists once per tenant; its stock and cost exist per plant

That separation is why an inter-plant transfer is a document rather than an adjustment, and why
the same item can carry a different moving-average cost in two factories.

### The second quantity is measured, never derived

A dual-UoM item carries both quantities on every movement and balance. The second one is
**captured at the transaction**, not calculated from the first. The weighbridge reports actual
weight; theoretical weight from GSM × area is an estimate, and the difference between them is
exactly what the plant wants to see.

Derivation is offered as a default the user may overwrite — never as the stored value.

### Conversions are item-specific

Metres ↔ kilograms depends on GSM and width, so it cannot live in a global table. Dimensionless
conversions (kg ↔ g, m ↔ cm) do.

### Tracking granularity is chosen per item and cannot be changed casually

| Granularity | Use |
|---|---|
| `SERIAL` | Each roll is individually identified — textile |
| `LOT` | Batch-level — board, chemicals |
| `BULK` | No tracking |

A `BULK` item still gets a stock unit row, so every inventory query has one shape. The
alternative — a nullable stock unit — puts a branch in every inventory query forever.

### Codes are normalised at the edge

`rm-001`, `RM-001 ` and `RM-001` are the same item. Without this they become three, and nobody
notices for a year. A duplicate is then a 409 someone can act on.

---

## Depends on / used by

**Depends on** units of measure.

**Used by** purchase orders, goods receipts, the stock ledger, valuation, the packs — which
extend an item rather than replacing it, so uninstalling a pack cannot break inventory
valuation — and every costing calculation.

---

## Status

**Built** — create and list items, base and second unit, tracking granularity, default stock
unit, code normalisation.

**Not built**
- Editing an item from the screen (the API supports it)
- Item-specific UoM conversions — the table exists, nothing writes to it, so dual-UoM
  quantities are captured but never converted
- Characteristics (style, colour, size, GSM, width) — stored as JSON, no editor; this is what
  keeps a style/colour/size matrix from exploding into thousands of flat SKUs
- Item categories, valuation class, purchase and sales UoM
- Deactivating an item
- Search, filtering and pagination — the list is capped at 200 and that will not hold

**Deliberately excluded** — deleting an item. Movements reference it permanently.

---

## Decisions

- **Dual quantity on the item, not a conversion at read time.** The second figure is a
  measurement with its own error, and averaging it away loses the variance the plant manages.
- **One default stock unit created with the item.** Without it the first goods receipt has
  nothing to post against, and the error arrives at the gate with a truck waiting.
- **Characteristics as JSON rather than columns.** Each industry wants different ones, and the
  pack declares them in its manifest. Columns would put textile fields in a carton customer's
  table.

**Open** — whether item codes should be generated from a number series rather than typed.
Typed codes carry meaning a plant relies on; generated ones never collide.
