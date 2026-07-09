/** Canonical pill-button taxonomy shared by the web (Tailwind) and mobile
 *  (StyleSheet) mirrors. Colors resolve per-scheme at each primitive; only the
 *  scheme-independent geometry lives here so the two mirrors cannot drift.
 *  See DESIGN.md "Buttons" for the rule. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'

export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonSizeSpec {
  /** Fixed pill height in px. */
  height: number
  /** Horizontal padding in px. */
  paddingX: number
  /** Label font size in px. */
  fontSize: number
  /** Leading-icon / busy-spinner size in px. */
  iconSize: number
  /** Gap between the leading slot and the label in px. */
  gap: number
}

/** `md` reproduces the historical pill look (height ~50, paddingX 26, 16px
 *  label, 18px icon, 9px gap); `sm` is the compact rail/toolbar size and `lg`
 *  the hero CTA size. */
export const BUTTON_SIZES: Record<ButtonSize, ButtonSizeSpec> = {
  sm: { height: 40, paddingX: 18, fontSize: 14, iconSize: 16, gap: 7 },
  md: { height: 50, paddingX: 26, fontSize: 16, iconSize: 18, gap: 9 },
  lg: { height: 56, paddingX: 30, fontSize: 17, iconSize: 20, gap: 10 },
}
