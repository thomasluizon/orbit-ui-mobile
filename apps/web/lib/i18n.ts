import type { useTranslations } from 'next-intl'

type Translator = ReturnType<typeof useTranslations>

/**
 * Translate a server-provided string. Falls back to the literal when the key isn't in the
 * catalog.
 */
export function safeT(t: Translator, keyOrLiteral: string): string {
  try {
    return t(keyOrLiteral)
  } catch {
    return keyOrLiteral
  }
}
