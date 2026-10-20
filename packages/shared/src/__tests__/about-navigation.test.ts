import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { ABOUT_DESTINATIONS } from '../utils/about-navigation'

describe('About destinations', () => {
  it('keeps the granted order, labels, and actions in both locales', () => {
    expect(ABOUT_DESTINATIONS.map(({ titleKey, route }) => [titleKey, route])).toEqual([
      ['about.featureGuide', null],
      ['about.support', '/support'],
      ['about.terms', '/terms'],
      ['about.privacy', '/privacy'],
    ])

    for (const [messages, labels] of [
      [ptBR, ['Guia do Orbit', 'Falar com o suporte', 'Termos de uso', 'Política de privacidade']],
      [en, ['Orbit guide', 'Contact support', 'Terms of use', 'Privacy policy']],
    ] as const) {
      expect(ABOUT_DESTINATIONS.map(({ titleKey }) => messages.about[titleKey.split('.')[1] as keyof typeof messages.about])).toEqual(labels)
    }
  })
})
