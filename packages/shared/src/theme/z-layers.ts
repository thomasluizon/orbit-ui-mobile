/**
 * The semantic z-index scale (DESIGN.md, Stacking): overlays stack on a named
 * tier, never a hand-picked number. Values spaced by 100 so they sit far above
 * local stacking. Two deliberate Orbit inversions: celebration sits just below
 * toast (a toast may need to surface over a celebration), and tourSpotlight
 * sits above modal (a tour points AT modals). Web mirrors these as the
 * --z-index-* tokens in globals.css; mobile consumes this export directly.
 * Local sibling stacking (1..9) has no tier here on purpose.
 */
export const zLayers = {
  dropdown: 1000,
  sticky: 1100,
  modalBackdrop: 1200,
  modal: 1300,
  tourSpotlight: 1400,
  celebration: 1500,
  toast: 1600,
  tooltip: 1700,
} as const

export type ZLayer = keyof typeof zLayers
