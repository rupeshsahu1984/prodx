# 07 · Workflow & Approval Setup

**Domain** Enterprise & Master Data · **Status** Built (partly) · **Screen** Workflow & Approval Setup

---

## Purpose

Configures **who must sign, at what value**. The prototype shows "Approval threshold ○" as an
unchecked item on a form; this is the machinery behind it.

Without it, approval is either everyone or nobody. With it, a ₹40,000 order needs one
signature and a ₹4,00,000 order needs two, one of which demands an authority an ordinary
approver does not hold.

---

## Who uses it

| Role | Can |
|---|---|
| Administrator | Create rules (`master_data:write`) |
| Everyone else | Read |

---

## Screens

**Workflow & Approval Setup** — `Enterprise & Master Data`

Document type · From (₹) · To (₹, blank = no limit) · Step · Permission needed · Plant.

---

## Data

| Table | Access | Notes |
|---|---|---|
| `approval_rule` | read, create | Bands, each naming a permission and a step |
| `approval_record` | — | Append-only; written by the document, not here |

---

## Rules

### Bands are `[from, to)` so they cannot overlap

Exactly ₹1,00,000 belongs to the higher band, not to both. An inclusive upper bound makes two
rules match one amount and the chain non-deterministic.

### A gap blocks the document — it never auto-approves

If no band covers the value, submission is refused with `NO_APPROVAL_RULE`. Silently approving
an unbudgeted purchase is the worst possible default, so the engine throws rather than
returning an empty chain.

### Steps run in sequence, and each names its own authority

A two-step chain for high value might require `purchase_order:approve` at step 1 and
`purchase_order:approve_high_value` at step 2. The second approver need **not** hold the
general approve right — requiring both would force every specialised approver to carry the
generic permission and defeat the point of having bands.

### The chain is resolved at submission, not at approval

An approver signs for a value. If the amount changes afterwards, the document goes back through
submit and the chain is resolved again.

### A plant on a rule narrows it; `NULL` means group-wide

A null plant is deliberately visible to every plant-scoped user — hiding group configuration
would stop approvals in factories nobody suspects.

### Rejection does not erase signatures

Approvals belong to a submission **cycle**. Rejecting advances the cycle, so earlier signatures
stop counting without being deleted — the record is append-only because who approved what is a
fact.

---

## Depends on / used by

**Used by** the purchase order lifecycle today. Ten integration tests cover it, including that
the submitter is refused even holding `*`, and that a two-step chain requires both authorities.

---

## Status

**Built** — create and list rules, band resolution, multi-step chains, per-plant rules, cycle
handling.

**Not built**
- Editing or deleting a rule — a wrong band can only be corrected by a developer
- **Overlap and gap detection.** Nothing stops configuring two rules that both match ₹50,000,
  or leaving ₹2,00,000–₹3,00,000 uncovered. The first produces a surprising chain, the second
  blocks documents at month-end
- Category and supplier dimensions — the columns exist, the form does not offer them
- Delegation for leave, and escalation when an approver does not act
- Approval by named person or group rather than by permission
- Document types beyond purchase order

**Deliberately excluded** — an "approve anyway" override. An approval matrix with a bypass is
decoration.

---

## Decisions

- **Rules name a permission, not a person.** People leave; the authority stays with the role.
- **Resolved at submission.** The alternative — resolving at each approval — lets an edited
  amount slip past a chain chosen for the old one.
- **Throw on no match.** Returning an empty chain would read as "fully approved" to any caller
  that checked `length === 0`.

**Open** — whether a document whose amount *decreases* after approval should re-enter the chain.
Today any change requires resubmission, which is safe and will annoy buyers correcting a typo.
