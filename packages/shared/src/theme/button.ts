/** Canonical pill-button taxonomy shared by the web (Tailwind) and mobile
 *  (StyleSheet) mirrors. Colors resolve per-scheme at each primitive; only the
 *  scheme-independent geometry lives here so the two mirrors cannot drift.
 *  See DESIGN.md "Buttons" for the rule. */
import { SPACING } from './spacing'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'caution'

export type ButtonSize = 'sm' | 'md'

/** Matched empty-state actions share this width and stay within the content column. */
export const MATCHED_PILL_WIDTH = '100%'
export const MATCHED_PILL_MAX_WIDTH = 360

export interface ButtonSizeSpec {
  /** Fixed pill height in px. */
  height: number
  /** Horizontal padding in px. */
  paddingX: number
  /** Label font size in px. */
  fontSize: number
  /** Leading-icon size in px. */
  iconSize: 16 | 20 | 24
  /** Gap between the leading slot and the label in px. */
  gap: number
}

/** `md` is the standard action and `sm` is the compact rail or toolbar action. */
export const BUTTON_SIZES: Record<ButtonSize, ButtonSizeSpec> = {
  sm: { height: 40, paddingX: 18, fontSize: 14, iconSize: 16, gap: 7 },
  md: { height: 50, paddingX: 26, fontSize: 16, iconSize: 20, gap: 9 },
}

/** The diameter of the round floating action button: the create habit button and the Astra button. */
export const FAB_SIZE = 60

/** A start-edge icon action moves its 44px paint back by the 20px glyph's side inset, so the glyph starts on the text column. */
export const ICON_ACTION_START_HANG = -SPACING.s12

export const GOOGLE_SIGN_IN_BUTTON = { paddingX: 12, gap: 10 } as const
