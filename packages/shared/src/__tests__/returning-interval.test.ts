import { describe, expect, it } from 'vitest'
import { getReturningInterval } from '../utils/returning-interval'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

const noon = new Date('2026-08-29T12:00:00Z')

describe('getReturningInterval', () => {
  it('names the last completion in the bounded sentence in both locales', () => {
    expect(en.todayAstra.returningBounded).toContain('completed a habit')
    expect(ptBR.todayAstra.returningBounded).toContain('concluiu um hábito')
  })
  it.each([['en', en.todayAstra.returningElapsed], ['pt-BR', ptBR.todayAstra.returningElapsed]])('writes the %s sentence after a gap as one sentence with no count of days', (_locale, sentence) => {
    expect(sentence).not.toMatch(/\d|\{|#|plural/u)
    expect(sentence.match(/[.!?]/gu)).toEqual(['.'])
    expect(sentence).not.toMatch(/\b(days?|dias?|ago|há|missed|perdeu|faltou)\b/iu)
  })
  it.each([null, undefined])('hides an unavailable completion date: %s', (lastCompletionDate) => {
    expect(getReturningInterval(lastCompletionDate, 'UTC', noon)).toBeNull()
  })

  it.each([
    ['2026-08-30', null],
    ['2026-08-29', null],
    ['2026-08-27', null],
    ['2026-08-26', { kind: 'elapsed', days: 3 }],
    ['2026-07-30', { kind: 'elapsed', days: 30 }],
    ['2026-07-29', { kind: 'bounded' }],
  ] as const)('classifies %s against the account day', (lastCompletionDate, expected) => {
    expect(getReturningInterval(lastCompletionDate, 'UTC', noon)).toEqual(expected)
  })

  it('uses the account timezone at a day boundary', () => {
    const instant = new Date('2026-08-29T01:00:00Z')

    expect(getReturningInterval('2026-08-25', 'America/Sao_Paulo', instant))
      .toEqual({ kind: 'elapsed', days: 3 })
    expect(getReturningInterval('2026-08-25', 'UTC', instant))
      .toEqual({ kind: 'elapsed', days: 4 })
  })
})
