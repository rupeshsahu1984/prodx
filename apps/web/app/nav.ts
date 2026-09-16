/**
 * The left-hand menu.
 *
 * Every entry is clickable. Entries whose screen is not built yet say so when
 * you open them rather than doing nothing — a menu item that silently ignores a
 * click is worse than one that admits it is not ready, because the user cannot
 * tell the difference between "not built" and "broken".
 */
export interface NavItem {
  id: string
  label: string
  /** Permission needed to see it at all. */
  permission?: string
  /** Industry pack that must be installed. */
  pack?: string
  /** False when the screen exists; otherwise what it will hold. */
  planned?: string
}

export interface NavGroup {
  group: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    group: 'Home & Control Tower',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'planned:my-work', label: 'My Work', planned: 'Approvals, exceptions and tasks assigned to you.' },
      { id: 'planned:control-tower', label: 'Plant Control Tower', planned: 'Live orders, machines, WIP and dispatch readiness.' },
      { id: 'planned:kpi', label: 'KPI & Alert Center', planned: 'Threshold breaches and their owners.' },
    ],
  },
  {
    group: 'Procurement & Supplier',
    items: [
      { id: 'purchase-orders', label: 'Purchase Orders', permission: 'purchase_order:read' },
      { id: 'goods-receipts', label: 'Goods Receipts', permission: 'goods_receipt:read' },
      { id: 'planned:rfq', label: 'RFQ & Bid Comparison', planned: 'Quote requests and side-by-side comparison.' },
      { id: 'planned:invoice-match', label: 'Invoice OCR & 3-Way Match', planned: 'PO, receipt and invoice reconciliation.' },
    ],
  },
  {
    group: 'Inventory & Logistics',
    items: [
      { id: 'stock', label: 'Stock & Valuation', permission: 'stock:read' },
      { id: 'ledger', label: 'Stock Ledger', permission: 'stock:read' },
      { id: 'planned:traceability', label: 'Lot / Roll Traceability', planned: 'Genealogy in both directions, for recalls.' },
      { id: 'planned:dispatch', label: 'Dispatch & Shipment', planned: 'Packing, loading and e-way bill.' },
    ],
  },
  {
    group: 'Gate, Security & Weighbridge',
    items: [
      { id: 'gate', label: 'Gate Control', permission: 'gate:read' },
      { id: 'planned:visitor', label: 'Visitor Management', planned: 'Passes, hosts and escorted access.' },
      { id: 'planned:returnable', label: 'Returnable Material Register', planned: 'What left the plant and has not come back.' },
    ],
  },
  {
    group: 'Carton & Corrugated Pack',
    items: [
      { id: 'carton-board', label: 'Board / Paper Specification', pack: 'carton', permission: 'carton_board_spec:read' },
      { id: 'carton-tooling', label: 'Die / Plate / Tooling', pack: 'carton', permission: 'carton_tool:read' },
      { id: 'carton-trim', label: 'Corrugator Trim Plan', pack: 'carton', permission: 'carton_trim_plan:read' },
      { id: 'planned:box-style', label: 'Box Design & FEFCO Style', pack: 'carton', planned: 'Box styles, dimensions and blank sizes.' },
    ],
  },
  {
    group: 'Textile Manufacturing Pack',
    items: [
      { id: 'textile-fabric', label: 'Fabric Specification', pack: 'textile', permission: 'textile_fabric_spec:read' },
      { id: 'textile-dyelots', label: 'Dyeing Batch & Shade Band', pack: 'textile', permission: 'textile_dye_lot:read' },
      { id: 'planned:yarn', label: 'Yarn & Fiber Master', pack: 'textile', planned: 'Counts, fibres and twist.' },
      { id: 'planned:grading', label: 'Fabric Inspection & Grading', pack: 'textile', planned: '4-point grading against each roll.' },
    ],
  },
  {
    group: 'Finance & Compliance',
    items: [
      { id: 'journal', label: 'Journal', permission: 'stock:read' },
      { id: 'planned:ap', label: 'Accounts Payable', planned: 'Supplier invoices, ageing and payment.' },
      { id: 'planned:close', label: 'Period Close', planned: 'Reconciliation and period locking.' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { id: 'packs', label: 'Industry Packs' },
      { id: 'planned:users', label: 'Users, Roles & SoD', planned: 'Role assignment and conflicting-duty detection.' },
      { id: 'planned:audit', label: 'Audit Trail', planned: 'Who changed what, when and from which source.' },
    ],
  },
]

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
