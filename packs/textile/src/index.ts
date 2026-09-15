import type { PackManifest } from '@prodx/pack-sdk'

/**
 * Textile and garment.
 *
 * The shade band on a fabric lot is the reason this pack exists as more than a
 * menu: allocation has to respect it, and a generic ERP cannot express that.
 */
export const textilePack: PackManifest = {
  id: 'textile',
  name: 'Textile & Garment',
  version: '1.0.0',
  description:
    'Yarn and fibre master, fabric specifications, dyeing batches with shade bands, fabric inspection and grading, cut plans.',

  permissions: [
    'textile_yarn:read',
    'textile_yarn:write',
    'textile_fabric_spec:read',
    'textile_fabric_spec:write',
    'textile_dye_lot:read',
    'textile_dye_lot:write',
    'textile_grading:read',
    'textile_grading:write',
  ],

  documentTypes: [
    { code: 'TEXTILE_DYE_LOT', name: 'Dyeing Batch', numberFormat: 'DYE/{FY}/{####}' },
    { code: 'TEXTILE_GRADING', name: 'Fabric Inspection & Grading', numberFormat: 'INSP/{FY}/{####}' },
  ],

  itemCategories: [
    {
      code: 'YARN',
      name: 'Yarn & Fibre',
      characteristics: [
        { code: 'count', name: 'Count', type: 'text', unit: 'Ne', required: true },
        { code: 'fibre', name: 'Fibre', type: 'select', options: ['Cotton', 'Polyester', 'Viscose', 'Blend'], required: true },
        { code: 'twist', name: 'Twist', type: 'text', unit: 'TPI' },
      ],
    },
    {
      code: 'FABRIC',
      name: 'Fabric',
      characteristics: [
        { code: 'gsm', name: 'GSM', type: 'number', unit: 'GSM', required: true },
        { code: 'width', name: 'Width', type: 'number', unit: 'inch', required: true },
        { code: 'construction', name: 'Construction', type: 'text' },
        { code: 'shade_band', name: 'Shade Band', type: 'text' },
      ],
    },
  ],

  navigation: [
    { group: 'Textile Manufacturing Pack', label: 'Yarn & Fiber Master', path: '/textile/yarn', permission: 'textile_yarn:read' },
    { group: 'Textile Manufacturing Pack', label: 'Fabric Specification', path: '/textile/fabric-spec', permission: 'textile_fabric_spec:read' },
    { group: 'Textile Manufacturing Pack', label: 'Dyeing Batch & Recipe', path: '/textile/dye-lot', permission: 'textile_dye_lot:read' },
    { group: 'Textile Manufacturing Pack', label: 'Fabric Inspection & Grading', path: '/textile/grading', permission: 'textile_grading:read' },
  ],

  tables: ['textile_yarn_spec', 'textile_fabric_spec', 'textile_dye_lot', 'textile_grading'],
}

export default textilePack
