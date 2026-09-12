# ADR 0001 — Modular monolith, not microservices

Status: Accepted · 2026-09-12

## Context

The scope is 151 modules across 15 domains. The instinct with that many modules is to split
them into services. The dominant runtime characteristic of an ERP, however, is that a single
business action spans several domains atomically: a goods receipt posts stock, creates an
accrual, updates a purchase order and may trigger an e-way bill.

## Options

1. **Microservices per domain** — independent deploy, but cross-domain atomicity requires
   sagas and compensating transactions for operations that are naturally transactional.
2. **Modular monolith** — one deployable, module boundaries enforced by tooling.
3. **Monolith with no boundaries** — fastest to start, unmaintainable at this module count.

## Decision

**Modular monolith.** One NestJS deployable plus a separate worker process that shares the
codebase. Boundaries are enforced by folder structure, dependency lint rules, and the fact
that engines in `packages/core` may not import Nest or Prisma.

The worker is separate because its failure and scaling profile genuinely differs — an MRP run
must not starve the API — not because it is a different domain.

## Consequences

- Cross-module operations stay in one database transaction. This is the main reason for the choice.
- Module boundaries are a discipline, not a physical constraint, so they need active policing.
  This is an explicit duty of the architect agent and the code reviewer.
- Scaling is vertical plus read replicas for a long time. That is sufficient well past the
  point where this product is commercially proven.
- Revisit only when a specific module has a genuinely divergent scaling or availability
  requirement — not on module count alone.
