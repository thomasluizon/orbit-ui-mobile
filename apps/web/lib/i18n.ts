import type { useTranslations } from 'next-intl'

type Translator = ReturnType<typeof useTranslations>
type IntlKey = Parameters<Translator>[0]

export function safeT(t: Translator, keyOrLiteral: string): string {
  try {
    return t(keyOrLiteral)
  } catch {
    return keyOrLiteral
  }
}
