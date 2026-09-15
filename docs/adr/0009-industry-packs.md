# ADR 0009 — Industry packs as installable plugins

Status: Accepted · 2026-09-13

## Context

The product must work as a corrugated-carton ERP, as a textile ERP, or as both. A customer
running only cartons should never see fabric, shade bands or dye lots; a textile customer
should never see flutes or FEFCO styles. The prototype already separates these as two
12-module domains, and the manufacturing processes genuinely differ — a corrugator trim plan
and a dyeing batch share almost nothing.

Everything else — procurement, inventory, gate, quality, finance, people — is common.

## The decision that is easy to get wrong

**In multi-tenant SaaS, "uninstall" cannot mean dropping tables.** Tenant A uninstalling the
textile pack must not affect tenant B, who is running on the same schema. Every pack's tables
are therefore always present in the database; installation is a **per-tenant activation**, not
a schema migration.

Getting this backwards — treating install as DDL — produces a system that can only ever host
one customer per database, which is a different product.

## Decision

### Packs own their code and their tables; core never imports a pack

```
packages/core        engines — knows nothing about any industry
packages/pack-sdk    the contract a pack implements, and the registry
packs/carton         board spec, flute, FEFCO style, corrugator, trim
packs/textile        fabric spec, yarn, shade band, dye lot, grading
```

Dependency flows one way: `packs/* → pack-sdk → core`. A lint rule fails the build if core or
another pack is imported from a pack. Two packs never know about each other.

### A pack declares itself in a manifest

```ts
{
  id: 'carton',
  name: 'Corrugated Carton',
  version: '1.0.0',
  requires: { core: '>=1.0.0' },
  permissions: ['board_spec:read', 'trim_plan:run', ...],
  documentTypes: [{ code: 'TRIM_PLAN', numberFormat: 'TRIM/{FY}/{####}' }],
  itemCategories: [{ code: 'BOARD', ... }],
  workflows: [...],
  navigation: [...],
  tables: ['carton_board_spec', 'carton_trim_plan', ...],   // for the uninstall guard
  seed: (tx, tenantId) => ...,                              // master data on install
}
```

Core resolves navigation, permissions, workflows and document types by asking the registry, so
adding a pack requires **no edit to core**.

### Installation state per tenant

```
NOT_INSTALLED → INSTALLED → DISABLED → (uninstall, only when empty)
```

- **Install** — records the installation, seeds the pack's master data, grants its permissions
  to the roles that ask for them, and makes its navigation appear.
- **Disable** — the pack's screens and APIs stop working and new documents are refused, but
  existing rows stay readable. This is the state for a customer who has stopped a product line
  and still needs last year's history and audit trail.
- **Uninstall** — permitted **only when the pack owns no rows for that tenant**. Otherwise the
  API refuses and tells the operator to disable instead. There is no purge flag: deleting
  posted manufacturing history is not an operation this system offers.

### Enforcement is in the database, not only the application

A pack's tables carry a policy that additionally requires the pack to be enabled:

```sql
USING (tenant_id = app_tenant() AND app_pack_enabled('carton'))
```

`app.packs` is set on the session alongside `app.tenant_id` and `app.plant_scope`. Disabling a
pack therefore makes its data invisible everywhere at once — API, reports, background jobs —
without a single application-level check to forget.

This is the same principle as ADR 0002 and 0003: **a forgotten check must degrade behaviour,
never disclose data.**

### What survives an uninstall

Core rows do. A textile item is still an `item`; its stock movements are still
`stock_ledger_entry` rows; its journal entries are untouched. Only the pack-specific
*attributes* — shade band, yarn count, fabric spec — become invisible. Inventory valuation and
the general ledger stay reconcilable, which is non-negotiable.

## Consequences

- Every pack's migrations ship in every deployment, installed or not. Schema size grows with
  the catalogue of packs, not with what a customer uses. Acceptable: empty tables cost nothing.
- Core must not gain an `if (textile)` branch anywhere. Where behaviour must differ, core
  defines an extension point and packs register into it — allocation strategy, cost components,
  item categories.
- A pack cannot be uninstalled once used, only disabled. This is deliberate and must be clear
  in the UI, because operators will otherwise expect "uninstall" to mean "remove and forget".
- Cross-pack features (a customer who prints cartons for a textile mill) belong in core or in a
  third pack, never as a dependency between the two.
