import type { useTranslations } from 'next-intl'

type Translator = ReturnType<typeof useTranslations>
type IntlKey = Parameters<Translator>[0]

/**
 * Translate a server-provided string. Falls back to the literal when the key isn't
 * in the catalog. Defends against next-intl provider configs with `onError: 'throw'`
 * — without this, an unknown backend key would crash the render. Mirrors the
 * `defaultValue` pattern that i18next uses on the mobile side.
 *
 * The catch is intentionally broad: next-intl only throws here for missing-message
 * cases, so swallowing the error and rendering the literal is the right behavior.
 */
export function safeT(t: Translator, keyOrLiteral: string): string {
  try {
    return t(keyOrLiteral as IntlKey)
  } catch {
    return keyOrLiteral
  }
}
