/** Canonical pill-button taxonomy shared by the web (Tailwind) and mobile
 *  (StyleSheet) mirrors. Colors resolve per-scheme at each primitive; only the
 *  scheme-independent geometry lives here so the two mirrors cannot drift.
 *  See DESIGN.md "Buttons" for the rule. */
import { SMALL_PILL_VISIBLE_MIN } from './breakpoints'
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

/**
 * A sign-in provider pill rests at the small pill's visible height. Large text wraps its title inside a
 * taller pill, which keeps this height's capsule radius, so a corner never cuts the title.
 */
export const SIGN_IN_BUTTON_HEIGHT = Math.max(BUTTON_SIZES.sm.height, SMALL_PILL_VISIBLE_MIN)

export const GOOGLE_SIGN_IN_BUTTON = { paddingX: 12, paddingY: SPACING.s4, gap: 10 } as const

/**
 * Apple's rules for a custom Sign in with Apple button (Human Interface Guidelines, Sign in with Apple):
 * the title is 43% of the button height, the logo file is as tall as the button (no vertical padding)
 * and holds the margin before the title, and the button, logo and title are only black or white: a
 * white button on a dark background and a black button on a light one.
 */
export const APPLE_SIGN_IN_BUTTON = {
  /**
   * Apple's minimum margin between the title and the trailing edge is 8% of the button width. The leading
   * edge gets the same inset, which Apple permits, so the logo and title stay centred.
   */
  paddingX: '8%',
  paddingY: 0,
  gap: 0,
  titleToHeight: 0.43,
  colors: { dark: { fill: '#FFFFFF', ink: '#000000' }, light: { fill: '#000000', ink: '#FFFFFF' } },
} as const

export type SignInButtonSpec = typeof GOOGLE_SIGN_IN_BUTTON | typeof APPLE_SIGN_IN_BUTTON

/** The provider pill geometry of a `brand` pill, or null for any other pill. */
export function signInButtonSpec(brand: 'google' | 'apple' | undefined): SignInButtonSpec | null {
  if (brand === 'google') return GOOGLE_SIGN_IN_BUTTON
  return brand === 'apple' ? APPLE_SIGN_IN_BUTTON : null
}

/** The resting title size in px of an Apple sign-in pill: 43% of its height. */
export const APPLE_SIGN_IN_TITLE_SIZE = Math.round(SIGN_IN_BUTTON_HEIGHT * APPLE_SIGN_IN_BUTTON.titleToHeight)
