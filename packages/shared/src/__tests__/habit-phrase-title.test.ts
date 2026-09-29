import { describe, expect, it } from 'vitest'
import { getHabitPhraseTitle } from '../utils/habit-phrase-title'

describe('getHabitPhraseTitle', () => {
  it.each([
    ['Alongar 3 vezes por semana', 'pt-BR', 'Alongar'],
    ['Read every day at 8am', 'en', 'Read'],
  ] as const)('removes applied schedule words from %s', (phrase, locale, title) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(title)
  })

  it('keeps a cadence that the person released', () => {
    expect(getHabitPhraseTitle('Read every day at 8am', 'en', {
      cadence: false,
      dueTime: true,
    })).toBe('Read every day')
    expect(getHabitPhraseTitle('Alongar 3 vezes por semana', 'pt-BR', {
      cadence: false,
      dueTime: false,
    })).toBe('Alongar 3 vezes por semana')
  })

  it('keeps a time that the person released', () => {
    expect(getHabitPhraseTitle('Read every day at 8am', 'en', {
      cadence: true,
      dueTime: false,
    })).toBe('Read at 8am')
  })

  it.each([
    ['3 vezes por semana', 'pt-BR'],
    ['every day at 8am', 'en'],
  ] as const)('keeps a phrase made only of schedule words: %s', (phrase, locale) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(phrase)
  })
})
