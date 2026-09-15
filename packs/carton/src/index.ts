import type { PackManifest } from '@prodx/pack-sdk'

/**
 * Corrugated carton.
 *
 * Depends on @prodx/pack-sdk and nothing else — not on core, not on the other
 * pack. That constraint is what makes a pack removable (ADR 0009).
 */
export const cartonPack: PackManifest = {
  id: 'carton',
  name: 'Corrugated Carton',
  version: '1.0.0',
  description:
    'Board and flute specifications, FEFCO box styles, dies and tooling, corrugator trim planning and waste analytics.',

  permissions: [
    'carton_board_spec:read',
    'carton_board_spec:write',
    'carton_box_style:read',
    'carton_box_style:write',
    'carton_tool:read',
    'carton_tool:write',
    'carton_trim_plan:read',
    'carton_trim_plan:run',
  ],

  documentTypes: [
    { code: 'CARTON_TRIM_PLAN', name: 'Corrugator Trim Plan', numberFormat: 'TRIM/{FY}/{####}' },
    { code: 'CARTON_BOX_STYLE', name: 'Box Design', numberFormat: 'BOX/{FY}/{####}' },
  ],

  itemCategories: [
    {
      code: 'BOARD',
      name: 'Paper & Board',
      characteristics: [
        { code: 'gsm', name: 'Grammage', type: 'number', unit: 'GSM', required: true },
        { code: 'bf', name: 'Bursting Factor', type: 'number', unit: 'BF' },
        { code: 'deckle', name: 'Deckle Width', type: 'number', unit: 'mm', required: true },
      ],
    },
    {
      code: 'CARTON',
      name: 'Corrugated Box',
      characteristics: [
        {
          code: 'flute', name: 'Flute', type: 'select',
          options: ['A', 'B', 'C', 'E', 'F', 'BC', 'EB'], required: true,
        },
        { code: 'ply', name: 'Ply', type: 'select', options: ['3', '5', '7'], required: true },
        { code: 'fefco', name: 'FEFCO Style', type: 'text' },
        { code: 'inner_mm', name: 'Inner Dimensions', type: 'text', unit: 'L×W×H mm' },
      ],
    },
  ],

  navigation: [
    { group: 'Carton & Corrugated Pack', label: 'Board / Paper Specification', path: '/carton/board-spec', permission: 'carton_board_spec:read' },
    { group: 'Carton & Corrugated Pack', label: 'Box Design & FEFCO Style', path: '/carton/box-style', permission: 'carton_box_style:read' },
    { group: 'Carton & Corrugated Pack', label: 'Die / Plate / Tooling', path: '/carton/tooling', permission: 'carton_tool:read' },
    { group: 'Carton & Corrugated Pack', label: 'Corrugator Trim Plan', path: '/carton/trim-plan', permission: 'carton_trim_plan:read' },
  ],

  tables: ['carton_board_spec', 'carton_box_style', 'carton_tool', 'carton_trim_plan'],
}

export default cartonPack
