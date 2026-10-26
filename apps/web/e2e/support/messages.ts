import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { SupportedLocale } from '@orbit/shared/types/profile'

export function formatCatalogMessage(locale: SupportedLocale, key: string, values?: Record<string, string | number>): string {
  let message: unknown = locale === 'en' ? en : ptBR
  for (const part of key.split('.')) message = (message as Record<string, unknown>)[part]
  if (typeof message !== 'string') throw new Error('Missing translation: ' + key)
  return String(new IntlMessageFormat(message, locale).format(values))
}
