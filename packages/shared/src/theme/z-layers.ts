/**
 * The semantic z-index scale (DESIGN.md, Stacking): overlays stack on a named tier, never a
 * hand-picked number. Values spaced by 100 so they sit far above local stacking.
 */
export const zLayers = {
  dropdown: 1000,
  sticky: 1100,
  modalBackdrop: 1200,
  modal: 1300,
  celebration: 1500,
  toast: 1600,
  tooltip: 1700,
} as const

export type ZLayer = keyof typeof zLayers
