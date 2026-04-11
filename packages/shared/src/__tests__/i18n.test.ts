import { describe, expect, it } from 'vitest'
import {
  defaultLocale,
  loadLocale,
  supportedLocales,
} from '../i18n'

describe('shared i18n exports', () => {
  it('exposes the default locale and supported locales', () => {
    expect(defaultLocale).toBe('en')
    expect(supportedLocales).toEqual(['en', 'pt-BR'])
  })

  it('loads the english locale bundle', async () => {
    const locale = await loadLocale('en')

    expect(locale).toHaveProperty('default')
  })

  it('loads the portuguese locale bundle', async () => {
    const locale = await loadLocale('pt-BR')

    expect(locale).toHaveProperty('default')
  })
})
