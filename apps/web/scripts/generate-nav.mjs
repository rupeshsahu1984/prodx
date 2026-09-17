/**
 * Generates app/nav.ts from the prototype's own module map.
 *
 * The prototype is the functional spec (CLAUDE.md), so the menu is derived from
 * it rather than hand-maintained. Hand-maintaining it is how the menu ended up
 * with 25 of 151 modules and no Sales, HR or Quality at all.
 *
 *   pnpm --filter @prodx/web nav:generate
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')

globalThis.window = {}
// eslint-disable-next-line no-eval
eval(readFileSync(resolve(root, 'prototype/data.js'), 'utf8'))
const domains = globalThis.window.PRODX_DOMAINS

/** Screens that exist, keyed by the prototype's module name. */
const BUILT = {
  'Executive Dashboard': 'overview',
  'Purchase Order': 'purchase-orders',
  'Goods Receipt': 'goods-receipts',
  'Inventory Overview': 'stock',
  'Lot / Roll / Batch Traceability': 'ledger',
  'Gate Control Dashboard': 'gate',
  'General Ledger': 'journal',
  'Board / Paper Specification': 'carton-board',
  'Die / Plate / Tooling': 'carton-tooling',
  'Corrugator Trim Plan': 'carton-trim',
  'Fabric Specification': 'textile-fabric',
  'Dyeing Batch & Recipe': 'textile-dyelots',
  'Configuration & Feature Flags': 'packs',
}

/** Domains owned by an industry pack, hidden until it is installed. */
const PACK_OF = {
  'Textile Manufacturing Pack': 'textile',
  'Carton & Corrugated Pack': 'carton',
}

/** Permission a domain needs to appear. Undefined means any signed-in user. */
const PERM_OF = {
  'Procurement & Supplier': 'purchase_order:read',
  'Inventory, Warehouse & Logistics': 'stock:read',
  'Gate, Security & Weighbridge': 'gate:read',
  'Finance, Cost & Compliance': 'stock:read',
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

let out = `/**
 * The menu, generated from the prototype in \`prototype/data.js\` — all 15 domains
 * and 151 modules, nothing trimmed.
 *
 * An earlier version listed only the screens that existed. That was the wrong
 * shape for an ERP: a buyer looking for Sales, or an accountant looking for
 * Period Close, could not tell whether the product lacked it or the menu was
 * broken. Every module is here; the ones without a screen say so when opened.
 *
 * Generated file — edit scripts/generate-nav.mjs, not this.
 */
export interface NavItem {
  id: string
  label: string
  /** Permission needed to see it at all. */
  permission?: string
  /** Industry pack that must be installed. */
  pack?: string
  /** Absent when the screen exists; otherwise what it will hold. */
  planned?: string
}

export interface NavGroup {
  group: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
`

for (const [domain, modules] of domains) {
  const pack = PACK_OF[domain]
  const perm = PERM_OF[domain]
  out += `  {\n    group: '${esc(domain)}',\n    items: [\n`
  for (const [name, description] of modules) {
    const built = BUILT[name]
    const parts = [`id: '${built ?? `planned:${slug(name)}`}'`, `label: '${esc(name)}'`]
    if (perm !== undefined) parts.push(`permission: '${perm}'`)
    if (pack !== undefined) parts.push(`pack: '${pack}'`)
    if (built === undefined) parts.push(`planned: '${esc(description)}'`)
    out += `      { ${parts.join(', ')} },\n`
  }
  out += `    ],\n  },\n`
}

out += `]

/** Wildcards expand only at segment boundaries, matching the backend guard. */
export function holds(granted: readonly string[], required?: string): boolean {
  if (required === undefined) return true
  return granted.some((g) => {
    if (g === '*' || g === required) return true
    const a = g.split(':')
    const b = required.split(':')
    return a.length === b.length && a.every((seg, i) => seg === '*' || seg === b[i])
  })
}
`

writeFileSync(resolve(here, '../app/nav.ts'), out)
const total = domains.reduce((sum, [, m]) => sum + m.length, 0)
// eslint-disable-next-line no-console
console.log(
  `  nav.ts: ${domains.length} domains, ${total} modules, ${Object.keys(BUILT).length} with screens`,
)
