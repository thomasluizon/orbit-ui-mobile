import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

const locales = { en, 'pt-BR': ptBR } as const

describe.each(Object.keys(locales) as (keyof typeof locales)[])('the Perfil sheet titles in %s', (locale) => {
  const copy = locales[locale]
  const titles = { notion: copy.profile.connections.notionQuestion, guide: copy.onboarding.featureGuide.question }

  it.each(Object.keys(titles) as (keyof typeof titles)[])('asks the %s sheet title as a question in the words of the person', (sheet) => {
    expect(titles[sheet]).toMatch(/^\p{Lu}.+\?$/u)
    expect(titles[sheet].split(' ').length, 'a bare noun is one or two words').toBeGreaterThan(3)
    expect(titles[sheet], 'Orbit is never translated').toContain('Orbit')
  })

  it('keeps the short labels for the rows that open the sheets', () => {
    expect(titles.notion).not.toBe(copy.profile.connections.notion)
    expect(titles.guide).not.toBe(copy.onboarding.featureGuide.title)
  })
})
