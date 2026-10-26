import { readFileSync } from 'node:fs'
import { createTranslator } from 'use-intl/core'

const catalogs = Object.fromEntries(['en', 'pt-BR'].map((locale) => [locale,
  JSON.parse(readFileSync(new URL(`../../packages/shared/src/i18n/${locale}.json`, import.meta.url), 'utf8')),
]))

export function catalogTranslator(locale) {
  if (!Object.hasOwn(catalogs, locale)) throw new Error('Unsupported visible answer locale.')
  return createTranslator({ locale, messages: catalogs[locale], onError(error) { throw error } })
}
