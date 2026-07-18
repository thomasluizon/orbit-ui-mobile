import type { TextStyle, ViewStyle } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

type AppTokens = ReturnType<typeof createTokensV2>

/** The field-well shell: a 54px `--bg-field` surface at radius 14 behind a
 *  hairline ring. Use it for a well that is a container (a picker trigger, a
 *  row that wraps its own control); pair `fieldWellStyle` with it when the well
 *  IS the text control.
 *  https://github.com/thomasluizon/orbit-ui-mobile/issues/539 */
export function fieldWellShellStyle(tokens: AppTokens): ViewStyle {
  return {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: tokens.bgField,
    borderWidth: 1,
    borderColor: tokens.hairline,
  }
}

/** The field-well body: the shell plus Rubik 16 `--fg-1` text. Pair it with
 *  `fieldRingStyle` for the focus ring and the padding. Sole owner of the
 *  recipe on mobile, mirroring the one web owner
 *  `apps/web/components/ui/field-input.tsx`.
 *  https://github.com/thomasluizon/orbit-ui-mobile/issues/539 */
export function fieldWellStyle(tokens: AppTokens): TextStyle {
  return {
    ...fieldWellShellStyle(tokens),
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: tokens.fg1,
  }
}

/** Vertical padding every field well uses, so a single-line control lands on the
 *  54px well height and a multiline one keeps the same inset. */
export const FIELD_WELL_PADDING = { horizontal: 16, vertical: 14 } as const

interface FieldRingOptions {
  focused: boolean
  invalid?: boolean
  paddingHorizontal: number
  paddingVertical?: number
}

/** The single field focus-ring contract: a 1px hairline well that thickens to a
 *  2px `--primary` ring while focused (`--status-bad` when invalid), with the
 *  padding compensated so the content does not shift as the ring grows.
 *  Mirrors the `.field-ring` class in `apps/web/app/globals.css`. */
export function fieldRingStyle(
  tokens: AppTokens,
  { focused, invalid = false, paddingHorizontal, paddingVertical }: Readonly<FieldRingOptions>,
): ViewStyle {
  const active = focused || invalid
  const inset = active ? 1 : 0
  const style: ViewStyle = {
    borderWidth: active ? 2 : 1,
    borderColor: invalid ? tokens.statusBad : focused ? tokens.primary : tokens.hairline,
    paddingHorizontal: paddingHorizontal - inset,
  }

  if (paddingVertical !== undefined) {
    style.paddingVertical = paddingVertical - inset
  }

  return style
}
