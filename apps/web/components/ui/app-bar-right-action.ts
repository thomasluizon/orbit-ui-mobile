export type AppBarRightVariant = 'help' | 'close' | 'share'

/** Resolves the accessible label for the app-bar trailing action: an explicit
 *  rightLabel wins, else the per-variant default (help / close / share). */
export function resolveAppBarRightActionLabel(
  right: AppBarRightVariant | undefined,
  rightLabel: string | undefined,
  t: (key: string) => string,
): string | undefined {
  if (!right) return undefined
  if (rightLabel) return rightLabel
  if (right === 'help') return t('help')
  if (right === 'close') return t('close')
  return t('share')
}
