# Module specifications

One document per module, in the order they are built. Each follows the same shape so a reader
can find the same fact in the same place every time:

| Section | Answers |
|---|---|
| **Purpose** | Why the module exists, in terms of what goes wrong without it |
| **Who uses it** | Roles, and the permissions they need |
| **Screens** | What is on screen and what each control does |
| **Data** | Tables read and written, and which are append-only |
| **Rules** | The business rules the module enforces — the heart of the document |
| **Controls & audit** | What is recorded, and what a refusal looks like |
| **Depends on / used by** | Where it sits among the other 150 modules |
| **Status** | What is built, what is not, and what is deliberately excluded |
| **Decisions** | Choices made and their reasoning; open questions named as open |

Write the rules section first. A module description that lists fields without the rules those
fields exist to enforce is a database diagram, not a specification — and the rules are what
someone will need when a customer asks "why did it refuse".

Scope for all 151 modules comes from `prototype/` (see `CLAUDE.md`).

## Index

| # | Module | Domain | Status |
|---|---|---|---|
| 01 | [Configuration & Feature Flags](01-configuration.md) | Reports, AI & Administration | Built |
| 02 | [Company / Plant Structure](02-company-plant-structure.md) | Enterprise & Master Data | Built (partly) |
