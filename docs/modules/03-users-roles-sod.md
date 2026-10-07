# 03 · Users, Roles & SoD

**Domain** Enterprise & Master Data · **Status** Built (partly) · **Screen** Users, Roles & SoD

---

## Purpose

Decides who may do what, and to which data. Those are two different questions and the module
keeps them apart:

- **Roles** carry permissions — *which actions*
- **Plant and department assignments** carry scope — *which data*

They are independent on purpose. The demo's two plant heads hold an identical role and see
completely different factories. Collapsing them into one concept is the mistake that forces a
customer to invent "Plant Head (Bhiwandi)" and "Plant Head (Ichalkaranji)" as separate roles,
and then to maintain the same permission list twice.

---

## Who uses it

| Role | Can |
|---|---|
| Administrator | Create and edit users and roles (`master_data:write`) |
| Plant Head | Same, within their own factories — RLS refuses the rest |
| Store Executive | Read only (`master_data:read`) |

---

## Screens

**Users, Roles & SoD** — `Enterprise & Master Data`

| Section | Shows | Actions |
|---|---|---|
| New user | Email, name, password, role, factory | Create |
| Users | Each user with roles, factories, departments, lock state | — |
| Roles | Code, name, permission list, how many users hold it | — |

A user's departments column reads *"all of their plants"* when they have no department
assignment, because that is what it means — not "none".

---

## Data

| Table | Access | Notes |
|---|---|---|
| `app_user` | read, create, update | The list never returns `passwordHash` |
| `role` | read, create, update | `permissions` and `conflictsWith` are string arrays |
| `user_role` | replaced wholesale | |
| `user_plant_access` | replaced wholesale | |
| `user_department_access` | replaced wholesale | |

---

## Rules

### Permissions are `domain:action`, wildcards expand at segment boundaries only

`purchase_order:*` grants every action on purchase orders. It does **not** grant
`purchase_order_draft:read` — a prefix match would, and would quietly hand over a different
domain. `*` grants everything.

The same matching runs in two places: the backend guard, which is the control, and the menu,
which is convenience. Both are tested.

### Scope is separate from permission, and empty means different things

| Assignment | Empty means |
|---|---|
| Plants | **Nothing** — a non-superadmin with no plants sees no factory data |
| Departments | **Every department of their plants** — a plant head is not department-restricted |

The asymmetry is real and is resolved in the **auth layer**, which sends the explicit `*` for
a user with no department rows. The database still treats an empty scope as nothing, so a code
path that forgets to establish context fails closed rather than opening up.

### Segregation of duties is a runtime check, not a page

Holding `purchase_order:approve` is necessary and never sufficient. The workflow engine refuses
when the approver is the submitter — tested against a superadmin holding `*`, who is still
refused with `403 SEGREGATION_OF_DUTIES`.

### Role and scope rows are replaced wholesale, inside one transaction

Updating a user deletes and recreates every role, plant and department row. A partial update
that left a stale plant assignment behind would **silently widen** someone's access, which is
the worst way for this to fail.

### Passwords

scrypt from Node's standard library at OWASP parameters, with the cost parameters stored in
the hash so raising them later re-hashes on next login. A malformed stored hash verifies as
false rather than throwing — a distinguishable failure is an oracle. Eight failed attempts lock
the account for fifteen minutes.

---

## Controls & audit

The user list returns a fixed `select`, never the whole row. Returning everything "because the
frontend filters it" is how password hashes reach logs and analytics.

Login answers with one message for every failure — wrong tenant, unknown user, wrong password —
and hashes a dummy password when the user does not exist, so a missing account is not
measurably faster than a wrong one.

---

## Depends on / used by

**Depends on** Company / Plant Structure for the factories and departments it assigns.

**Used by** every protected route in the product. The permissions guard denies by default: a
route declaring neither `@RequirePermission` nor `@Public` returns 403, so a forgotten decorator
is an obvious failure in development rather than an open endpoint in production.

---

## Status

**Built** — users with roles and both scope dimensions, roles with permissions, password
hashing and lockout, SoD at approval time.

**Not built**
- Editing a user or role from the screen — the API supports update, the UI only creates
- Assigning more than one role or factory at a time — the API accepts arrays, the form offers one
- `conflictsWith` is stored and **never enforced**: the field for "whoever creates a supplier
  may not approve its payment" exists, and nothing checks it yet
- Password reset, forced rotation, MFA
- Deactivating a user from the screen

**Deliberately excluded** — deleting a user. Documents reference their approver and submitter,
and those references must stay resolvable. Deactivation is the answer.

---

## Decisions

- **Permissions on roles, not on users.** A permission granted directly to a person is
  invisible at review time and outlives their job.
- **`isSuperAdmin` as a flag, not a role.** It means "every factory and every department",
  which is scope rather than permission, so it does not belong in a permission list.
- **Scope re-read on token refresh.** Revoking a factory takes effect within one access-token
  lifetime — fifteen minutes — rather than at next sign-in.

**Open** — whether `conflictsWith` should block assignment outright or warn and record. Blocking
is the safer default and will be unpopular in a plant where one person genuinely does both jobs.
