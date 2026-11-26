import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { escapeRegExp } from '../test-support/escape-reg-exp'

const META = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']

describe('escapeRegExp', () => {
  it.each(META)('matches the character %s as itself and nothing else', (character) => {
    const label = `a${character}b`
    const pattern = new RegExp(`^${escapeRegExp(label)}$`)
    expect(pattern.test(label)).toBe(true)
    expect(pattern.test('ab')).toBe(false)
    expect(pattern.test('aXb')).toBe(false)
  })

  it('escapes every regex character of a label, not only the first one', () => {
    const label = 'What? (really)? [yes] a+b a.b $5 ^up {x} a|b \\'
    const pattern = new RegExp(`^${escapeRegExp(label)}$`)
    expect(pattern.test(label)).toBe(true)
    expect(pattern.test(label.replace('What?', 'Wha'))).toBe(false)
  })

  it.each([['en', en], ['pt-BR', ptBR]] as const)('anchors each optional question of %s on its own text', (_locale, messages) => {
    for (const label of Object.values(messages.habits.flow.optional)) {
      const pattern = new RegExp(`^${escapeRegExp(label)}`)
      expect(pattern.test(label)).toBe(true)
      if (label.includes('?')) expect(pattern.test(label.replace(/[?]/g, ''))).toBe(false)
    }
  })
})
