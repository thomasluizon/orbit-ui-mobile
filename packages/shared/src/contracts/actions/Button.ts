
interface ButtonBase {
  variant?: 'primary' | 'ghost' | 'secondary' | 'destructive' | 'caution'
  size?: 'md' | 'sm'
  loading?: boolean
  focusableWhenLoading?: boolean
  minimumHeight?: number
  elevated?: boolean
  disabled?: boolean
  matchedWidth?: boolean
  onClick?: () => void
  formId?: string
  hint?: string
  descriptionId?: string
}

/** The ordinary button: its visible text is its accessible name. */
export interface LabelledButtonProps extends ButtonBase {
  children: string
  brand?: 'google' | 'apple'
  /** Decorative leading glyph; the visible label remains the accessible name. */
  leadingIcon?: React.ReactNode
  /** Optional fuller name when nearby context is not part of the control's accessible name. */
  accessibleName?: string
  iconOnly?: never
  label?: never
  edge?: never
}

/** Icon-only: a glyph and nothing readable, so the name is required and comes from the caller. */
export interface IconOnlyButtonProps extends ButtonBase {
  children: React.ReactNode
  iconOnly: true
  label: string
  /** Starts the glyph on the text column of a start-aligned stack; the paint and hit extension sit in the column's gutter. */
  edge?: 'start'
  accessibleName?: never
  leadingIcon?: never
  brand?: never
}

/** Discriminated on `iconOnly`: a nameless icon-only button does not compile. */
export type ButtonProps = LabelledButtonProps | IconOnlyButtonProps
