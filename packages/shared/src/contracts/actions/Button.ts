import type { ReactNode } from 'react'

/** Pill button. The primary fill is one of the four accent roles: exactly one filled action per view.
 *
 * AN ICON-ONLY BUTTON CANNOT RENDER WITHOUT ITS NAME, discriminated in the type the same way Fab's
 * `label` is. A control whose only child is a glyph has no text node to name it, so `iconOnly` pairs
 * with a REQUIRED `label` and neither can be passed without the other. A button with visible text is
 * named by that text and takes no `label`, so assistive technology never hears the name twice.
 *
 * There is no `style` prop. The variants and sizes below are the whole surface. */
interface ButtonBase {
  /** primary carries the accent fill; ghost is hairline; secondary is the neutral fill; destructive and caution carry status hues */
  variant?: 'primary' | 'ghost' | 'secondary' | 'destructive' | 'caution'
  size?: 'md' | 'sm'
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  /** Associates a web submit button with a form outside its DOM subtree. Native ignores this adapter hint. */
  formId?: string
}

/** The ordinary button: its visible text is its accessible name. */
export interface LabelledButtonProps extends ButtonBase {
  children: string
  iconOnly?: never
  label?: never
}

/** Icon-only: a glyph and nothing readable, so the name is required and comes from the caller. */
export interface IconOnlyButtonProps extends ButtonBase {
  children: ReactNode
  iconOnly: true
  label: string
}

/** Discriminated on `iconOnly`: a nameless icon-only button does not compile. */
export type ButtonProps = LabelledButtonProps | IconOnlyButtonProps
