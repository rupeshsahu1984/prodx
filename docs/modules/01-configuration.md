# 01 · Configuration & Feature Flags

**Domain** Reports, AI & Administration · **Status** Built · **Screen** Settings

---

## Purpose

Where an administrator sees how the tenant is set up and changes the few things that govern
everything else.

It exists mainly for one control. ADR 0007 made **fiscal period status the gate on every
posting** — no stock movement, no journal entry, nothing gets into a closed period. Then the
only thing that ever set a period's status was the database seed. A control nobody can operate
is not a control, and an accountant who cannot close March has no way to stop last month's
figures moving under them.

The rest of the screen answers the questions an administrator asks first: which legal entities
exist, what their tax registration is, how much master data there is, and which industry packs
are active.

---

## Who uses it

| Role | Can |
|---|---|
| Any signed-in user | See the configuration — `@AnyAuthenticated`, no specific permission |
| Plant Head | Close a period (`period:close`) |
| Administrator | Close **and reopen** (`period:close` + `period:reopen`), manage packs (`pack:manage`) |

Reading configuration needs no permission because hiding it protects nothing — a user can see
their own tenant's fiscal calendar in any case. Changing it is where the permissions live.

---

## Screens

**Settings** — `Reports, AI & Administration → Configuration & Feature Flags`

| Section | Shows | Actions |
|---|---|---|
| Counts | Users, items, customers & suppliers, factories | — |
| Company | Legal entities with GSTIN, base currency, plant count | — |
| Fiscal calendar | Every period of each fiscal year with its status | Soft close · Close · Reopen |
| Industry packs | Each pack, its state and how many records it holds | Install · Disable · Uninstall |

**Audit Trail** — the same domain — reads the events this module writes.

---

## Data

| Table | Access | Notes |
|---|---|---|
| `tenant` | read | The only table with no `tenant_id`; its id *is* the tenant |
| `legal_entity` | read | GSTIN is per legal entity per state, not per tenant |
| `fiscal_year` → `fiscal_period` | read, status write | Scoped to a legal entity |
| `pack_installation` | read | Per-tenant activation (ADR 0009) |
| `audit_event` | append only | Trigger-enforced; no update or delete path exists |

Counts come from `appUser`, `item`, `party` and `plant` through the scoped client, so a plant
head's count reflects their factories rather than the group's.

---

## Rules

### Fiscal period state machine

```
OPEN  ──soft close──▶  SOFT_CLOSED  ──close──▶  CLOSED
  ◀────reopen─────────┘      ◀──────reopen──────┘
```

| Status | Postings allowed |
|---|---|
| `OPEN` | Everything |
| `SOFT_CLOSED` | Only reversals and adjustment journals, and only with the adjustment permission |
| `CLOSED` | Nothing. There is no bypass flag anywhere in the code |

`SOFT_CLOSED` is the state a period sits in while accounts are being finalised: operations have
stopped posting, the accountant is still correcting.

### Reopening is harder than closing, on purpose

Closing is routine month-end work. Reopening changes what an **already-reported** set of
figures can become, so it is a different permission:

- `period:close` — move a period towards closed
- `period:reopen` — move it back

A plant head holds the first and not the second. The refusal names both the permission and the
reason, because "Forbidden" alone leaves an operator unsure whether they made a mistake or hit
a rule.

### Other rules

- Setting a status to what it already is is refused (`NO_CHANGE`) rather than silently accepted —
  a no-op that reports success hides a misclick.
- A late supplier invoice does **not** justify reopening. It posts to the current open period
  with a reference to the original document date. This has to be the documented workflow,
  otherwise users will keep asking for the override.

---

## Controls & audit

Every status change writes an `audit_event` carrying the transition:

```json
{ "status": { "from": "CLOSED", "to": "SOFT_CLOSED" } }
```

with the actor, the timestamp and the source. *Who reopened March* is the first question anyone
asks when numbers move after a close, and the answer belongs in the log rather than in
somebody's memory.

Only the **changed fields** are stored, never the whole row. An audit log that copies rows
slowly becomes a second, less-protected copy of payroll and bank details.

---

## Depends on / used by

**Depends on** the organisation hierarchy (ADR 0003) for legal entities, and the pack registry
(ADR 0009) for the pack list.

**Used by** every posting path in the product. The posting engine resolves a period from the
document's *posting date* — never `createdAt` — and calls `assertPostable`. Six unit tests in
`packages/core` cover that guard, including that a `CLOSED` period refuses even an actor
holding the adjustment permission.

---

## Status

**Built** — configuration overview, fiscal calendar with the full state machine, permission
split between close and reopen, audit on every change, pack management.

**Not built**
- Editing a legal entity's details (name, GSTIN, currency) — read-only today
- Creating a fiscal year and generating its periods — the seed does this
- Feature flags proper: the name promises per-tenant toggles and only pack installation exists
- A close checklist (unposted documents, unreconciled accounts) before a period may close

**Deliberately excluded** — bulk "close everything up to date". Closing periods one at a time is
slow on purpose; a single click that closes nine months is a mistake nobody can undo without
the reopen permission and an audit entry against their name.

---

## Decisions

- **Status on the period, not a date cut-off.** A cut-off date is one number someone can edit;
  a status per period is a state machine with an audit trail behind each transition.
- **Three states, not two.** Two states force a choice between blocking the accountant and
  leaving the period open to operations. `SOFT_CLOSED` is the month-end reality.
- **Reading configuration needs no permission.** Hiding a tenant's own fiscal calendar from its
  own users protects nothing and produces support tickets.

**Open** — whether closing should be *blocked* by unposted documents, or merely warn. Blocking
is safer and will be unpopular on the first month-end; the decision should be the customer's,
made once, and recorded here.
