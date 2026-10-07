# 05 · Customer & Supplier Master

**Domain** Enterprise & Master Data · **Status** Built (partly) · **Screen** Customer & Supplier Master

---

## Purpose

The counterparties the business trades with. One table for both, because the same company is
routinely both — a mill that buys yarn from a trader also sells it fabric, and keeping two
records means two addresses, two GSTINs and two versions of the truth.

---

## Who uses it

| Role | Can |
|---|---|
| Administrator, Plant Head | Create and edit (`master_data:write`) |
| Store Executive, buyers | Read (`master_data:read`) |

Master data is deliberately separate from transactional permissions. A buyer raises orders all
day and should not be able to invent a supplier while doing it — that is how a payment reaches
an account nobody approved.

---

## Screens

**Customer & Supplier Master** — `Enterprise & Master Data`

Code · Name · Type (supplier / customer / both) · GSTIN.

---

## Data

| Table | Access |
|---|---|
| `party` | read, create, update |

Tenant-scoped, not plant-scoped: a supplier serves the whole group, and duplicating them per
factory is how three plants end up with three payment terms for one vendor.

---

## Rules

- **Type is a classification, not a restriction.** `BOTH` exists because the real relationship
  often is. Nothing stops a purchase order against a party typed `CUSTOMER` today; when that
  check is added it should warn, not block.
- **Codes are normalised** to upper case and trimmed, as everywhere else.
- **GSTIN is stored but not validated.** It is a 15-character structure with a checksum, and the
  field currently accepts anything up to 20 characters.

---

## Depends on / used by

**Used by** purchase orders and goods receipts today; sales orders, invoices and payments when
those are built.

---

## Status

**Built** — create and list parties with type and GSTIN.

**Not built**
- Editing from the screen
- Addresses, contacts, ship-to and bill-to — a purchase order has nowhere to send itself
- Payment terms, credit limit, credit exposure
- Bank details for payment
- GSTIN validation and the state code it implies, which e-way bill will need
- Supplier approval status, and which materials a supplier is approved for — the procurement
  rule "supplier approved for this material" has nothing to check against
- Deactivation, search, pagination

**Deliberately excluded** — deletion.

---

## Decisions

- **One table for customers and suppliers.** Separate tables duplicate every shared attribute
  and force a choice the business does not make.
- **Tenant-scoped, not plant-scoped.** Terms are negotiated by the group.

**Open** — whether a party needs per-legal-entity attributes. A group with two companies may
have different payment terms with the same vendor, which would make terms a child record rather
than a column. Worth settling before the first invoice is built.
