# PRODX ERP — Architecture & Gap Analysis

Multi-tenant SaaS · NestJS · Next.js · PostgreSQL · Prisma
Scope source: the clickable prototype in `prototype/` — 15 domains, 151 modules, 6 journeys.

---

## 1. The core insight

The prototype looks like 151 screens. It is not. Its own `behavior()` function in
`prototype/schemas.js` maps all 151 modules onto **13 behaviour families**, each with a
shared workflow, validation set, posting impact and integration profile.

That is the whole architecture in one observation: **build ~10 engines, then configure 151
modules on top of them.** A team that instead writes 151 CRUD modules will produce roughly
40× the code, and every business rule change will need 151 edits.

Concretely, the prototype already tells you the families:
dashboards · master data · sales · procurement · gate/security · inventory · planning ·
manufacturing · quality · maintenance · finance · people · integration.

---

## 2. Repository layout

```
apps/api           NestJS — modular monolith
apps/web           Next.js App Router
apps/worker        BullMQ processors (separate deployable, shared code)
packages/db        Prisma schema, migrations, tenant client extension
packages/contracts Zod schemas — the one API contract, imported by both sides
packages/core      Engines. Framework-agnostic, no Nest, no Prisma imports.
packages/pack-sdk  Industry-pack contract and registry (ADR 0009)
packages/ui        Design system ported from the prototype
packs/carton       Corrugated carton pack
packs/textile      Textile & garment pack
prototype/         Original HTML prototype. Spec. Do not edit.
docs/adr/          Architecture decision records
```

pnpm workspaces + Turborepo. **Not microservices** — a modular monolith with enforced
boundaries. Distribution is a scaling answer to a problem you do not have yet, and it makes
the one thing an ERP genuinely needs — cross-module transactions — nearly impossible.

---

## 3. Multi-tenancy

Enforced in Postgres, not in application code.

```sql
ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order FORCE  ROW LEVEL SECURITY;   -- see gotcha below
CREATE POLICY tenant_isolation ON purchase_order
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
```

```ts
// packages/db/src/tenant-client.ts
export function forTenant(tenantId: string) {
  return prisma.$extends({
    query: { $allModels: { async $allOperations({ args, query }) {
      const [, result] = await prisma.$transaction([
        prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`,
        query(args),
      ])
      return result
    }}},
  })
}
```

Three gotchas that silently defeat this:

1. **`FORCE ROW LEVEL SECURITY` is required.** A table's owner bypasses RLS by default, and
   Prisma usually connects as the owner. Either connect as a non-owner role or use `FORCE`.
   Without this the policy exists and does nothing — the worst possible failure mode.
2. **`set_config(..., TRUE)` is transaction-local.** With PgBouncer in transaction pooling
   mode, a setting outside a transaction lands on a connection that another tenant may get
   next. It must be inside the transaction.
3. **Background jobs, migrations, admin tools and report queries** run outside the request
   path and are where isolation actually breaks. Every one of them needs an explicit tenant
   context or an audited, deliberate cross-tenant role.

Application-level `where: { tenantId }` remains useful as a query optimization and index
hint. It is never the control.

---

## 4. The engines

| Engine | Owns |
|---|---|
| **Document** | Header/line structure, revisions, state, attachments, linkage |
| **Workflow & Approval** | State machine, approval matrix by threshold, SoD, delegation, escalation |
| **Numbering** | Gapless per (tenant, series, fiscal year) |
| **Stock Ledger** | Append-only movements; balances are projections |
| **GL Posting** | Double-entry, immutable, reversal-only |
| **UoM** | Base unit, item-specific conversions, dual quantities |
| **Costing** | Moving weighted average actual + standard for variance |
| **Audit** | Append-only who/what/when/why/source |
| **Attachment** | S3/MinIO, signed URLs, scanning, retention |
| **Notification** | BullMQ alerts, reminders, escalation timers |

Engines live in `packages/core`, take repository interfaces as arguments, and are unit-tested
without a database. Nest wires them; it does not contain them.

### Gapless numbering

```sql
-- inside the same transaction as the document insert
UPDATE number_series SET next_value = next_value + 1
 WHERE tenant_id = $1 AND series_code = $2 AND fiscal_year = $3
RETURNING next_value - 1;
```

The row lock is held to commit, so a rollback returns the number. Postgres `SEQUENCE` is
wrong here — it deliberately leaks numbers on rollback, and Indian statutory invoice series
must not have gaps. This serializes per series, which is acceptable and correct.

---

## 5. Gap analysis — what the prototype does not yet answer

The prototype is unusually well thought through: it already encodes workflow states,
validations, posting impacts, integration points and role scoping. These are the things it
does **not** settle, ordered by how expensive they are to fix later.

### Tier 1 — decide before the first migration

**1. Organization hierarchy and scope of every entity.**
The prototype shows "Plant 01" as a card. You need Tenant → Company → Plant → Warehouse →
Location, and an explicit decision per entity about where it lives. Item master is usually
tenant-global; stock is plant-scoped; costs are often company-scoped. Getting this wrong
means re-keying every table.

**2. Unit of measure, including dual quantity.** *The most underestimated item on this list.*
A fabric roll is simultaneously 120 metres, 28.5 kg and 180 GSM. A carton order is 5,000
pieces, 1,240 m² of board and 890 kg — and is priced per kg while being produced per piece.
The prototype has "UoM" as one column. You need base UoM per item, item-specific conversion
factors (not a global table — conversion depends on GSM and width), and **stock records
carrying two quantities simultaneously**. Retrofitting dual UoM means rewriting inventory,
costing and pricing together.

**3. Inventory valuation method.** The prototype has a "Standard & Actual Cost" page but no
decision behind it. FIFO, weighted average and standard cost imply *different stock ledger
columns*. Recommendation: **moving weighted average per (item, plant)** as the actual, plus
standard cost for variance reporting. FIFO layer tracking becomes painful once dyeing and
re-grading start splitting and merging lots.

**4. Lot / roll / serial identity and genealogy.** Textile needs roll-level identity — each
roll has its own shade, grade and length. Carton is batch-level. Model one `StockUnit` with a
granularity flag. Genealogy is a **graph, not a tree**: a beam produces many rolls, a roll is
cut into many pieces, and pieces from several rolls merge into one shipment. Store it as
edges. A `parent_id` column cannot represent a merge, and recalls need both directions.

**5. Fiscal calendar and period locks.** "Period Close" exists as a page, but nothing prevents
posting into a closed period. You need FiscalYear → Period with status, checked by the posting
engine with no bypass. Adding this after six months of live transactions means cleaning up
back-dated postings by hand.

**6. Gapless document numbering.** Covered above. The naive `MAX(number)+1` breaks the first
time two users click Save simultaneously, and it will not be noticed until an audit.

### Tier 2 — correctness and integrity

**7. Optimistic locking.** Two supervisors confirming the same work order will double-issue
material. `version` column, `UPDATE ... WHERE version = ?`, clean 409.

**8. Idempotency for device events.** The prototype explicitly promises "duplicate device
event blocked" for barcode, RFID and weighbridge — but that is an infrastructure feature, not
a validation. Weighbridges resend on flaky serial links; gate scanners double-tap. You need an
idempotency key table storing the original response, keyed on (tenant, source, external ref).

**9. Transactional outbox.** A goods receipt posts stock, creates an accrual, updates the PO
*and* may trigger an e-way bill. The first three are one database transaction; the fourth is
an external call that must not be inside it. Commit the intent to an outbox table in the same
transaction and let a worker deliver it. **This is the most commonly missed pattern in ERP
builds**, and its absence shows up as stock posted but e-way bill missing, discovered at the
factory gate with a loaded truck waiting.

**10. Segregation of duties as a runtime check.** "Users, Roles & SoD" is a page in the
prototype. SoD is not a page — it is a check at approval time: maker ≠ checker, plus detection
of conflicting role combinations (whoever can create a supplier must not be able to approve
its payment). It must be enforced and auditable.

**11. Approval matrix.** The prototype's form shows "Approval threshold ○" as an unchecked
item. Behind it needs to sit rules by document type, amount band, plant and category,
resolving to an approver chain — with delegation for leave and escalation on timeout.

### Tier 3 — operational

**12. Offline behaviour at the gate and on the shop floor.** These are precisely the two
places where the network is worst — a gate at the plant boundary, terminals beside machines.
Decide early: a PWA with an IndexedDB queue and idempotent replay, or native clients. It
changes every write endpoint's signature, so it cannot be bolted on.

**13. Analytics will take down your OLTP database.** 151 modules of dashboards plus a
"Self-Service Report Builder" pointed at live tables produces lock contention and timeouts
during shift changes. Read replica plus scheduled materialized views, or a separate reporting
schema. Decide before the first dashboard is built.

**14. Attachment storage.** The form promises "PDF, XLSX, image up to 10 MB". That is S3 or
MinIO with signed URLs, server-side type and size validation, virus scanning, and a retention
policy. Never blobs in Postgres.

**15. Background jobs.** MRP runs, payroll processing, e-way bill delivery, scheduled reports
and escalation timers. BullMQ + Redis, as a separate deployable, with idempotent jobs and
dead-letter handling.

**16. Data migration and go-live.** "Data Import & Migration" is one page; in reality it is a
project. Masters, opening stock with valuation, open purchase and sales orders, WIP, and
opening GL balances that must reconcile to the old system. Needs a staging schema, validation
reports, control totals and a dry-run mode. Plan it as a workstream from month one.

### Tier 4 — domain-specific, and where you beat generic ERPs

**17. Corrugator trim optimization is an algorithm, not a form.** "Corrugator Trim Plan" and
"Waste & Trim Analytics" are listed as screens. Combining orders across a corrugator deck to
minimize trim waste is a cutting-stock problem — real optimization work, and directly worth
money at a plant. Generic ERPs do not have it. Budget engineering time, not a form.

**18. Shade and lot continuity in textile.** A garment must be cut from one dye lot, or from
shade bands that visually match. "Shade / Lab Dip Approval" exists as a page, but the
requirement is an *allocation constraint*: stock units carry a shade band, and picking must
respect it. SAP and Odoo cannot do this without heavy customization. It is a genuine
differentiator.

**19. Item variants, not flat SKUs.** "Style / Color / Size Matrix" implies generated
combinations. Model items with characteristics (style, colour, size, GSM, width) rather than
one flat SKU per combination, or the item master explodes into hundreds of thousands of rows.

**20. Subcontracting / job work.** Listed as one page. In India it carries its own GST
obligations — job-work challans, return within the statutory time limit, and material that is
legally yours while physically at the supplier. You need a "stock at third party" location
type and an ageing report against the statutory clock.

### Tier 5 — compliance, as scoped

**21. E-way bill without e-invoice is an unusual pairing.** E-way bill payloads carry invoice
details, so without IRN generation those will need another source. Part-A/Part-B split,
vehicle updates on transshipment and validity by distance all couple directly to your Gate Out
and Dispatch modules — which is an advantage, since you already model them properly. Worth
re-confirming with the client that GST e-invoice is genuinely out of scope.

**22. Payroll statutory needs a versioned rule engine.** PF, ESI, PT and TDS rates and slabs
change annually, and professional tax differs by state. Effective-dated rule tables, never
hardcoded values. Payroll must support re-runs and arrears when a rule changes retroactively.
Payroll data is also your most sensitive data — separate access control and its own audit
trail, distinct from the general audit log.

---

## 6. Build order

Do not build 151 modules. Build journeys, and let each one prove the engines.

| Phase | Content | Why this order |
|---|---|---|
| **0** | Tenancy, auth, and all 10 engines. No business modules. | Everything else composes these. Getting them wrong later is a rewrite. |
| **1** | **Procure to Pay + Gate** | Exercises stock ledger, GL, approvals, numbering and device idempotency in one flow — and gate/weighbridge is your visible differentiator. |
| **2** | **Plan to Produce + MES**, for **one** manufacturing pack only | Pick carton or textile. Building both at once doubles the domain surface before you have learned either. |
| **3** | **Order to Cash** + AR | Now the commercial side has real inventory and costs behind it. |
| **4** | **Record to Report** | GL, costing and period close, once there are genuine transactions to close. |
| **5** | **Hire to Payroll** | Largely independent; statutory rules are their own project. |
| **6** | The second manufacturing pack | Cheap by now — the engines and the first pack taught you the shape. |

Dashboards and the report builder come *after* the read-replica decision, not before.

## 7. Deliberately not building

- **All 151 modules.** Ship journeys; let real usage decide what the long tail needs.
- **Microservices.** A modular monolith with enforced boundaries. Revisit at genuine scale.
- **A custom report builder, early.** Point Metabase at the read replica and buy back months.
- **Your own authentication primitives.** Multi-tenant SaaS auth is subtle — use a proven
  library or provider, and spend your effort on authorization instead, which is where ERP
  security actually fails.
