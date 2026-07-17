/**
 * Semantic z-index stacking scale, shared across web (mirrored as Tailwind
 * `--z-index-*` theme tokens in `apps/web/app/globals.css`) and mobile
 * (`zLayers` consumed via `apps/mobile/lib/theme.ts`). Six named tiers ascend
 * `dropdown < sticky < modalBackdrop < modal < toast < tooltip`, plus two Orbit
 * carve-outs: `celebration` sits just below `toast` (modal-ish but transient, a
 * toast may still surface over it), and `tourSpotlight` sits above `modal`
 * because a tour points AT modals. See DESIGN.md "Stacking". Values are spaced
 * by 100 to leave room without inviting off-scale literals.
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
