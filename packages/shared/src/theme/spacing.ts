/**
 * The enumerated base-4 spacing scale, shared across web (Tailwind's `p-*` /
 * `gap-*` steps) and mobile (`StyleSheet` px values). These thirteen values are
 * the ONLY legal `margin` / `padding` / `gap` / inset values in Orbit — see
 * DESIGN.md "Spacing (base 4)", which enumerates the set rather than describing
 * it as "a multiple of 4" precisely so a machine can check it. `width` and
 * `height` are component dimensions and are deliberately NOT governed here.
 * The `local/spacing-scale` ESLint rule reads the same list; this module is the
 * right answer that rule points at.
 */
export const spacingScale = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64] as const

/**
 * A legal spacing value. Typing a spacing prop as `Spacing` makes an off-scale
 * number a COMPILE error at the callsite, which is strictly stronger than the
 * lint rule — the rule catches literals it can parse, the type catches every
 * path into the prop.
 */
export type Spacing = (typeof spacingScale)[number]

/**
 * The scale keyed by DESIGN.md's `space-N` token names, where N is the step
 * index and the value is `N * 4` px — so `spacing[4]` is `space-4` is 16px is
 * Tailwind's `p-4`. Prefer this over a bare literal so a callsite reads as a
 * step on the scale rather than a magic number.
 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
} as const satisfies Record<number, Spacing>

/** A `space-N` step index — the keys of {@link spacing}. */
export type SpacingStep = keyof typeof spacing
