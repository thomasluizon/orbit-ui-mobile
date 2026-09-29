import { describe, expect, it, vi } from 'vitest'
import { getHabitPhraseTitle } from '../utils/habit-phrase-title'
import { applyHabitPhraseRead } from '../utils/habit-form-helpers'
import { readHabitPhrase } from '../utils/habit-phrase-parser'

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

  it('keeps an interval after removing the only weekday from a phrase', () => {
    const setOneTime = vi.fn()
    const target = {
      setOneTime,
      setRecurring: vi.fn(),
      setFlexible: vi.fn(),
      setGeneral: vi.fn(),
      setField: vi.fn(),
    }
    const applied = applyHabitPhraseRead(true, readHabitPhrase('Run Monday every 2 weeks', 'en'), '', false,
      { cadence: false, dueTime: false }, target)
    const finalPhrase = 'Run every 2 weeks'
    const ownership = applyHabitPhraseRead(true, readHabitPhrase(finalPhrase, 'en'), '', false, applied, target)

    expect(setOneTime).toHaveBeenCalledOnce()
    expect(ownership.cadence).toBe(true)
    expect(getHabitPhraseTitle(finalPhrase, 'en', ownership)).toBe(finalPhrase)
  })

  it('removes an applied time while keeping an unapplied interval', () => {
    expect(getHabitPhraseTitle('Run every 2 weeks at 8am', 'en', {
      cadence: true,
      dueTime: true,
    })).toBe('Run every 2 weeks')
  })

  it('keeps onboarding interval title stripping', () => {
    expect(getHabitPhraseTitle('Clean every 2 weeks', 'en')).toBe('Clean')
  })

  it.each([
    ['3 vezes por semana', 'pt-BR'],
    ['every day at 8am', 'en'],
  ] as const)('keeps a phrase made only of schedule words: %s', (phrase, locale) => {
    expect(getHabitPhraseTitle(phrase, locale)).toBe(phrase)
  })
})
