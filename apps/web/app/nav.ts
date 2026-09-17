/**
 * The menu, generated from the prototype in `prototype/data.js` — all 15 domains
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
  {
    group: 'Home & Control Tower',
    items: [
      { id: 'overview', label: 'Executive Dashboard' },
      { id: 'planned:my-work', label: 'My Work', planned: 'Approvals, exceptions, tasks, reminders and escalations.' },
      { id: 'planned:plant-control-tower', label: 'Plant Control Tower', planned: 'Live orders, machines, WIP, shortages, quality holds and dispatch risk.' },
      { id: 'planned:kpi-alert-center', label: 'KPI & Alert Center', planned: 'Role-based KPI definitions, targets, trends and actionable alerts.' },
    ],
  },
  {
    group: 'Enterprise & Master Data',
    items: [
      { id: 'planned:company-plant-structure', label: 'Company / Plant Structure', planned: 'Legal entity, plant, warehouse, line, work center, shift and cost center.' },
      { id: 'planned:users-roles-sod', label: 'Users, Roles & SoD', planned: 'Role-based access, plant scope, maker-checker and conflict control.' },
      { id: 'planned:item-material-master', label: 'Item & Material Master', planned: 'Raw material, WIP, finished goods, services, attributes and UoM.' },
      { id: 'planned:customer-supplier-master', label: 'Customer & Supplier Master', planned: 'Commercial, tax, quality, logistics, credit and contact data.' },
      { id: 'planned:bom-recipe-routing', label: 'BOM / Recipe / Routing', planned: 'Versioned material structures, operations, resources, yield and effectivity.' },
      { id: 'planned:document-numbering-setup', label: 'Document & Numbering Setup', planned: 'Document types, sequences, templates, attachments and retention.' },
      { id: 'planned:calendar-shift-capacity', label: 'Calendar, Shift & Capacity', planned: 'Working calendars, shifts, holidays, breaks and capacity rules.' },
      { id: 'planned:workflow-approval-setup', label: 'Workflow & Approval Setup', planned: 'Threshold, condition, escalation, delegation and reapproval rules.' },
    ],
  },
  {
    group: 'CRM, Costing & Sales',
    items: [
      { id: 'planned:lead-opportunity', label: 'Lead & Opportunity', planned: 'Pipeline, samples, follow-up, probability and conversion.' },
      { id: 'planned:product-enquiry', label: 'Product Enquiry', planned: 'Requirement capture with textile or carton technical specification.' },
      { id: 'planned:cost-estimate', label: 'Cost Estimate', planned: 'Material, machine, labor, waste, overhead, tooling, freight and margin.' },
      { id: 'planned:quotation', label: 'Quotation', planned: 'Versioned quote, commercial terms, margin approval and validity.' },
      { id: 'planned:sales-order', label: 'Sales Order', planned: 'Customer commitment, schedule, specification, price and credit checks.' },
      { id: 'planned:order-change-control', label: 'Order Change Control', planned: 'Revision, impact, reapproval, customer acknowledgement and audit.' },
      { id: 'planned:available-capable-to-promise', label: 'Available / Capable to Promise', planned: 'Promise using stock, WIP, material and finite capacity.' },
      { id: 'planned:customer-portal', label: 'Customer Portal', planned: 'Enquiry, quote, order, artwork/sample approval, shipment and complaint.' },
    ],
  },
  {
    group: 'Planning & Scheduling',
    items: [
      { id: 'planned:forecast-demand-plan', label: 'Forecast & Demand Plan', planned: 'Customer, product, season and channel demand planning.' },
      { id: 'planned:s-op-lite', label: 'S&OP Lite', planned: 'Monthly demand, supply, inventory, capacity and financial balancing.' },
      { id: 'planned:master-production-schedule', label: 'Master Production Schedule', planned: 'Time-phased production plan with frozen and flexible zones.' },
      { id: 'planned:mrp', label: 'MRP', planned: 'Netted material demand, pegging, purchase and production proposals.' },
      { id: 'planned:capacity-planning', label: 'Capacity Planning', planned: 'Load versus capacity by process, machine, labor and shift.' },
      { id: 'planned:finite-scheduler', label: 'Finite Scheduler', planned: 'Constraint-aware sequence with setup, changeover and due-date logic.' },
      { id: 'planned:material-allocation', label: 'Material Allocation', planned: 'Reserve critical yarn, fabric, paper reels, ink, chemicals and tooling.' },
      { id: 'planned:planning-exceptions', label: 'Planning Exceptions', planned: 'Shortage, overload, late supply, delayed order and reschedule actions.' },
    ],
  },
  {
    group: 'Procurement & Supplier',
    items: [
      { id: 'planned:purchase-requisition', label: 'Purchase Requisition', permission: 'purchase_order:read', planned: 'Material, service, capex and subcontract requirement.' },
      { id: 'planned:rfq-bid-comparison', label: 'RFQ & Bid Comparison', permission: 'purchase_order:read', planned: 'Supplier bids, landed price, lead time, quality and award.' },
      { id: 'purchase-orders', label: 'Purchase Order', permission: 'purchase_order:read' },
      { id: 'planned:supplier-schedule-blanket-po', label: 'Supplier Schedule / Blanket PO', permission: 'purchase_order:read', planned: 'Releases and call-offs against agreed quantities.' },
      { id: 'planned:subcontracting', label: 'Subcontracting', permission: 'purchase_order:read', planned: 'Material sent, operation receipt, loss, yield, charge and settlement.' },
      { id: 'goods-receipts', label: 'Goods Receipt', permission: 'purchase_order:read' },
      { id: 'planned:supplier-quality', label: 'Supplier Quality', permission: 'purchase_order:read', planned: 'Qualification, scorecard, incoming defects and corrective action.' },
      { id: 'planned:invoice-ocr-3-way-match', label: 'Invoice OCR & 3-Way Match', permission: 'purchase_order:read', planned: 'Bill capture, duplicate check, PO/receipt/invoice match and exception.' },
    ],
  },
  {
    group: 'Inventory, Warehouse & Logistics',
    items: [
      { id: 'stock', label: 'Inventory Overview', permission: 'stock:read' },
      { id: 'ledger', label: 'Lot / Roll / Batch Traceability', permission: 'stock:read' },
      { id: 'planned:warehouse-locations', label: 'Warehouse Locations', permission: 'stock:read', planned: 'Zone, aisle, rack, bin, capacity and storage rules.' },
      { id: 'planned:put-away', label: 'Put-away', permission: 'stock:read', planned: 'Quality status, compatibility and capacity-based placement.' },
      { id: 'planned:picking-issue', label: 'Picking & Issue', permission: 'stock:read', planned: 'Wave, FIFO/FEFO, lot rule, scan confirmation and shortage.' },
      { id: 'planned:transfer-replenishment', label: 'Transfer & Replenishment', permission: 'stock:read', planned: 'Bin, warehouse and inter-plant movements with in-transit control.' },
      { id: 'planned:cycle-count-stock-take', label: 'Cycle Count & Stock Take', permission: 'stock:read', planned: 'Blind count, recount, variance approval and posting.' },
      { id: 'planned:packing-labeling', label: 'Packing & Labeling', permission: 'stock:read', planned: 'Pack hierarchy, customer labels, barcode and palletization.' },
      { id: 'planned:dispatch-shipment', label: 'Dispatch & Shipment', permission: 'stock:read', planned: 'Load plan, transporter, vehicle, documents, POD and freight.' },
      { id: 'planned:rfid-barcode-control', label: 'RFID / Barcode Control', permission: 'stock:read', planned: 'Reader/device setup, tag association, event validation and audit.' },
    ],
  },
  {
    group: 'Gate, Security & Weighbridge',
    items: [
      { id: 'gate', label: 'Gate Control Dashboard', permission: 'gate:read' },
      { id: 'planned:vehicle-pre-advice', label: 'Vehicle Pre-Advice', permission: 'gate:read', planned: 'Expected vehicle, transporter, driver, PO/shipment, material and appointment slot.' },
      { id: 'planned:gate-in-entry', label: 'Gate In Entry', permission: 'gate:read', planned: 'Vehicle or person identity, documents, photo, entry time, purpose and security clearance.' },
      { id: 'planned:inward-gate-pass', label: 'Inward Gate Pass', permission: 'gate:read', planned: 'Incoming material, PO/challan reference, quantity, packages, seal and receiving location.' },
      { id: 'planned:weighbridge-transaction', label: 'Weighbridge Transaction', permission: 'gate:read', planned: 'Gross, tare and net weight with device reading, slip, operator and mismatch control.' },
      { id: 'planned:dock-yard-management', label: 'Dock & Yard Management', permission: 'gate:read', planned: 'Queue, parking bay, dock assignment, loading/unloading status and turnaround time.' },
      { id: 'planned:visitor-management', label: 'Visitor Management', permission: 'gate:read', planned: 'Visitor identity, host, purpose, belongings, pass validity and exit confirmation.' },
      { id: 'planned:employee-contractor-access', label: 'Employee / Contractor Access', permission: 'gate:read', planned: 'Badge, biometric, roster, skill, medical, blacklist and access-zone validation.' },
      { id: 'planned:outward-gate-pass', label: 'Outward Gate Pass', permission: 'gate:read', planned: 'Returnable/non-returnable material, scrap, tools, samples and approval evidence.' },
      { id: 'planned:gate-out-entry', label: 'Gate Out Entry', permission: 'gate:read', planned: 'Exit time, document closure, weighbridge reconciliation, pending items and final clearance.' },
      { id: 'planned:returnable-material-register', label: 'Returnable Material Register', permission: 'gate:read', planned: 'Material sent outside, expected return, custodian, reminders and overdue escalation.' },
      { id: 'planned:security-incident-register', label: 'Security Incident Register', permission: 'gate:read', planned: 'Theft, damage, unauthorized access, seal mismatch, investigation and action.' },
    ],
  },
  {
    group: 'Shared Manufacturing & MES',
    items: [
      { id: 'planned:work-order', label: 'Work Order', planned: 'Order release, BOM/routing, quantity, dates, priority and status.' },
      { id: 'planned:dispatch-list', label: 'Dispatch List', planned: 'Machine/operator work queue with readiness checks.' },
      { id: 'planned:material-staging', label: 'Material Staging', planned: 'Kitting, issue, backflush, return and variance.' },
      { id: 'planned:operation-start-stop', label: 'Operation Start / Stop', planned: 'Operator, machine, time, quantity, reason and electronic sign-off.' },
      { id: 'planned:production-confirmation', label: 'Production Confirmation', planned: 'Good, scrap, rework, by-product, consumption and labor.' },
      { id: 'planned:wip-tracking', label: 'WIP Tracking', planned: 'Location, operation, age, hold, quantity and next step.' },
      { id: 'planned:machine-data-oee', label: 'Machine Data / OEE', planned: 'Availability, performance, quality, downtime and micro-stops.' },
      { id: 'planned:shift-handover', label: 'Shift Handover', planned: 'Open work, issues, safety, quality and maintenance communication.' },
      { id: 'planned:rework-scrap', label: 'Rework & Scrap', planned: 'Cause, authorization, route, cost and disposition.' },
      { id: 'planned:production-costing', label: 'Production Costing', planned: 'Standard versus actual material, labor, machine, waste and overhead.' },
    ],
  },
  {
    group: 'Textile Manufacturing Pack',
    items: [
      { id: 'planned:style-color-size-matrix', label: 'Style / Color / Size Matrix', pack: 'textile', planned: 'Variant grid for style, shade, width, size, season and SKU.' },
      { id: 'planned:yarn-fiber-master', label: 'Yarn & Fiber Master', pack: 'textile', planned: 'Count, blend, composition, twist, shade, cone and supplier lot.' },
      { id: 'textile-fabric', label: 'Fabric Specification', pack: 'textile' },
      { id: 'planned:warping-sizing-plan', label: 'Warping & Sizing Plan', pack: 'textile', planned: 'Beam, ends, length, yarn allocation, size recipe and wastage.' },
      { id: 'planned:weaving-knitting-execution', label: 'Weaving / Knitting Execution', pack: 'textile', planned: 'Loom/machine assignment, picks, meters, defects and efficiency.' },
      { id: 'textile-dyelots', label: 'Dyeing Batch & Recipe', pack: 'textile' },
      { id: 'planned:finishing-stenter', label: 'Finishing & Stenter', pack: 'textile', planned: 'Process parameters, width/GSM target, shrinkage and finish control.' },
      { id: 'planned:fabric-inspection-grading', label: 'Fabric Inspection & Grading', pack: 'textile', planned: '4-point defects, roll map, grade, cuttable width and disposition.' },
      { id: 'planned:shade-lab-dip-approval', label: 'Shade / Lab Dip Approval', pack: 'textile', planned: 'Submission, spectro result, customer approval and reference standard.' },
      { id: 'planned:cut-plan-marker', label: 'Cut Plan & Marker', pack: 'textile', planned: 'Marker ratio, ply, fabric allocation, remnants and cut bundle.' },
      { id: 'planned:sewing-line-control', label: 'Sewing Line Control', pack: 'textile', planned: 'Bundle movement, operation bulletin, WIP, output and line efficiency.' },
      { id: 'planned:textile-compliance-traceability', label: 'Textile Compliance & Traceability', pack: 'textile', planned: 'Fiber origin, certificates, chemical compliance and chain of custody.' },
    ],
  },
  {
    group: 'Carton & Corrugated Pack',
    items: [
      { id: 'carton-board', label: 'Board / Paper Specification', pack: 'carton' },
      { id: 'planned:box-design-fefco-style', label: 'Box Design & FEFCO Style', pack: 'carton', planned: 'Dimensions, style, ply, flute, joint, tolerance and drawing.' },
      { id: 'planned:artwork-prepress', label: 'Artwork & Prepress', pack: 'carton', planned: 'Artwork version, color separation, proof, approval and release.' },
      { id: 'carton-tooling', label: 'Die / Plate / Tooling', pack: 'carton' },
      { id: 'planned:carton-estimate-quote', label: 'Carton Estimate & Quote', pack: 'carton', planned: 'Board area, trim, ink, tooling, setup, conversion, freight and margin.' },
      { id: 'carton-trim', label: 'Corrugator Trim Plan', pack: 'carton' },
      { id: 'planned:corrugator-execution', label: 'Corrugator Execution', pack: 'carton', planned: 'Wet-end consumption, board output, warp, waste, speed and downtime.' },
      { id: 'planned:printing-slotting', label: 'Printing & Slotting', pack: 'carton', planned: 'Print colors, plate, anilox, registration, slot and score settings.' },
      { id: 'planned:die-cutting-folder-gluer', label: 'Die Cutting / Folder Gluer', pack: 'carton', planned: 'Tool setup, sheet count, waste, glue, bundle and quality.' },
      { id: 'planned:board-box-quality', label: 'Board & Box Quality', pack: 'carton', planned: 'ECT/BCT, GSM, moisture, COBB, burst, adhesion, dimensions and print.' },
      { id: 'planned:bundle-pallet-load-planning', label: 'Bundle / Pallet / Load Planning', pack: 'carton', planned: 'Pack count, strapping, stacking, cube and vehicle optimization.' },
      { id: 'planned:waste-trim-analytics', label: 'Waste & Trim Analytics', pack: 'carton', planned: 'Wet-end, dry-end, setup, print, die-cut and process waste causes.' },
    ],
  },
  {
    group: 'Quality Management',
    items: [
      { id: 'planned:inspection-plan', label: 'Inspection Plan', planned: 'Characteristics, method, sample, frequency, instrument and tolerance.' },
      { id: 'planned:incoming-inspection', label: 'Incoming Inspection', planned: 'Supplier lot decision, result, hold and release.' },
      { id: 'planned:in-process-quality', label: 'In-Process Quality', planned: 'Operation checks, SPC trend, reaction plan and stop rule.' },
      { id: 'planned:final-inspection', label: 'Final Inspection', planned: 'Finished product specification, grade and release.' },
      { id: 'planned:nonconformance', label: 'Nonconformance', planned: 'Defect, containment, disposition, cost and responsibility.' },
      { id: 'planned:capa', label: 'CAPA', planned: 'Root cause, action, owner, verification and effectiveness.' },
      { id: 'planned:customer-complaint', label: 'Customer Complaint', planned: 'Traceability, investigation, response, claim and closure.' },
      { id: 'planned:calibration', label: 'Calibration', planned: 'Instrument schedule, standard, result, certificate and status.' },
      { id: 'planned:quality-audit', label: 'Quality Audit', planned: 'Plan, checklist, evidence, findings and action follow-up.' },
    ],
  },
  {
    group: 'Maintenance & Utilities',
    items: [
      { id: 'planned:asset-register', label: 'Asset Register', planned: 'Machine hierarchy, specification, criticality, warranty and documents.' },
      { id: 'planned:preventive-maintenance', label: 'Preventive Maintenance', planned: 'Meter/calendar plan, task list, material, labor and compliance.' },
      { id: 'planned:breakdown-maintenance', label: 'Breakdown Maintenance', planned: 'Failure, priority, response, repair, downtime and cause.' },
      { id: 'planned:condition-monitoring', label: 'Condition Monitoring', planned: 'Reading, alarm, trend and predictive recommendation.' },
      { id: 'planned:maintenance-work-order', label: 'Maintenance Work Order', planned: 'Plan, permit, spares, technician, execution and close.' },
      { id: 'planned:spare-parts', label: 'Spare Parts', planned: 'Criticality, min/max, repairable, issue, return and costing.' },
      { id: 'planned:utilities-energy', label: 'Utilities & Energy', planned: 'Electricity, steam, gas, water, compressed air and specific consumption.' },
      { id: 'planned:tool-die-plate-maintenance', label: 'Tool / Die / Plate Maintenance', planned: 'Life counter, repair, change history and readiness.' },
    ],
  },
  {
    group: 'Finance, Cost & Compliance',
    items: [
      { id: 'journal', label: 'General Ledger', permission: 'stock:read' },
      { id: 'planned:accounts-payable', label: 'Accounts Payable', permission: 'stock:read', planned: 'Supplier invoice, tax, due date, payment and reconciliation.' },
      { id: 'planned:accounts-receivable', label: 'Accounts Receivable', permission: 'stock:read', planned: 'Customer invoice, receipt, credit, collection and aging.' },
      { id: 'planned:cash-bank', label: 'Cash & Bank', permission: 'stock:read', planned: 'Bank accounts, payments, statements and reconciliation.' },
      { id: 'planned:tax-e-invoice', label: 'Tax & E-Invoice', permission: 'stock:read', planned: 'GST/local tax rules, e-invoice, e-way bill and statutory reports.' },
      { id: 'planned:fixed-assets', label: 'Fixed Assets', permission: 'stock:read', planned: 'Capitalization, depreciation, transfer, impairment and disposal.' },
      { id: 'planned:standard-actual-cost', label: 'Standard & Actual Cost', permission: 'stock:read', planned: 'Material, operation, overhead, variance and revaluation.' },
      { id: 'planned:job-order-profitability', label: 'Job / Order Profitability', permission: 'stock:read', planned: 'Quote-to-actual margin by customer, order, style or box.' },
      { id: 'planned:budget-cash-forecast', label: 'Budget & Cash Forecast', permission: 'stock:read', planned: 'Department budgets, commitments, collections and liquidity.' },
      { id: 'planned:supplier-invoice-register', label: 'Supplier Invoice Register', permission: 'stock:read', planned: 'Invoice intake, OCR result, GST, PO/GRN match, approval, due date and hold reason.' },
      { id: 'planned:supplier-payment', label: 'Supplier Payment', permission: 'stock:read', planned: 'Payment proposal, bank account validation, approval, remittance and ledger settlement.' },
      { id: 'planned:customer-receipt', label: 'Customer Receipt', permission: 'stock:read', planned: 'Receipt entry, bank reference, invoice allocation, deduction, short payment and reconciliation.' },
      { id: 'planned:journal-voucher', label: 'Journal Voucher', permission: 'stock:read', planned: 'Manual or recurring journal with debit/credit validation, evidence, approval and posting.' },
      { id: 'planned:credit-debit-note', label: 'Credit / Debit Note', permission: 'stock:read', planned: 'Commercial adjustment, tax impact, original document reference, reason and approval.' },
      { id: 'planned:period-close-reconciliation', label: 'Period Close & Reconciliation', permission: 'stock:read', planned: 'Subledger close, stock/GL, AP/AR, bank, tax, WIP and suspense reconciliation.' },
    ],
  },
  {
    group: 'People, Safety & Sustainability',
    items: [
      { id: 'planned:employee-skill-matrix', label: 'Employee & Skill Matrix', planned: 'Employee, contractor, skill, certification and machine authorization.' },
      { id: 'planned:attendance-shift-roster', label: 'Attendance & Shift Roster', planned: 'Shift assignment, attendance, overtime and labor availability.' },
      { id: 'planned:training', label: 'Training', planned: 'Role/process training, assessment, expiry and compliance.' },
      { id: 'planned:incident-near-miss', label: 'Incident & Near Miss', planned: 'Safety event, investigation, action and regulatory record.' },
      { id: 'planned:permit-to-work', label: 'Permit to Work', planned: 'Hazard, isolation, authorization, validity and closure.' },
      { id: 'planned:waste-recycling', label: 'Waste & Recycling', planned: 'Waste type, source, weight, disposal, recovery and revenue.' },
      { id: 'planned:water-energy-carbon', label: 'Water / Energy / Carbon', planned: 'Activity data, intensity, target and auditable sustainability metrics.' },
      { id: 'planned:chemical-sds', label: 'Chemical & SDS', planned: 'Chemical inventory, SDS, hazard, restricted substance and usage.' },
      { id: 'planned:manpower-requisition', label: 'Manpower Requisition', planned: 'Approved headcount, role, skill, shift, employment type, budget and required date.' },
      { id: 'planned:recruitment-joining', label: 'Recruitment & Joining', planned: 'Candidate, selection, offer, documents, medical, induction and joining approval.' },
      { id: 'planned:employee-contractor-master', label: 'Employee / Contractor Master', planned: 'Identity, employment, department, bank, statutory, emergency and access information.' },
      { id: 'planned:leave-holiday-management', label: 'Leave & Holiday Management', planned: 'Leave entitlement, request, approval, balance, roster impact and payroll integration.' },
      { id: 'planned:overtime-incentive', label: 'Overtime & Incentive', planned: 'Approved overtime, production-linked incentive, attendance validation and payroll input.' },
      { id: 'planned:payroll-processing', label: 'Payroll Processing', planned: 'Earnings, deductions, attendance, overtime, statutory contributions, tax and net pay.' },
      { id: 'planned:payslip-bank-transfer', label: 'Payslip & Bank Transfer', planned: 'Payroll finalization, payslip, bank advice, failed payment and employee acknowledgement.' },
      { id: 'planned:performance-appraisal', label: 'Performance & Appraisal', planned: 'Goals, competencies, production/quality measures, review, rating and development plan.' },
      { id: 'planned:separation-full-and-final', label: 'Separation & Full-and-Final', planned: 'Resignation, clearance, asset return, access closure, settlement and exit interview.' },
    ],
  },
  {
    group: 'Reports, AI & Administration',
    items: [
      { id: 'planned:operational-reports', label: 'Operational Reports', planned: 'Sales, purchase, stock, WIP, production, quality, maintenance and dispatch.' },
      { id: 'planned:management-analytics', label: 'Management Analytics', planned: 'OTIF, OEE, yield, waste, inventory turns, margin and cash.' },
      { id: 'planned:self-service-report-builder', label: 'Self-Service Report Builder', planned: 'Authorized fields, filters, layouts, schedule and export.' },
      { id: 'planned:ai-assistant', label: 'AI Assistant', planned: 'Explain variance, summarize exceptions and guide users with evidence.' },
      { id: 'planned:ocr-review-workbench', label: 'OCR Review Workbench', planned: 'Confidence, extracted fields, corrections, approval and learning feedback.' },
      { id: 'planned:integration-monitor', label: 'Integration Monitor', planned: 'API/event/EDI status, retry, error, reconciliation and ownership.' },
      { id: 'planned:audit-trail', label: 'Audit Trail', planned: 'Who, what, when, before/after, reason and source device.' },
      { id: 'packs', label: 'Configuration & Feature Flags' },
      { id: 'planned:data-import-migration', label: 'Data Import & Migration', planned: 'Template, validation, preview, rejection, control totals and audit.' },
      { id: 'planned:system-health-support', label: 'System Health & Support', planned: 'Jobs, queues, performance, incidents, remote support and status.' },
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
