import { describe, expect, it } from 'vitest'
import { readHabitPhrase, segmentHabitPhrase } from '../utils/habit-phrase-parser'

describe('readHabitPhrase', () => {
  it('gives fixed weekdays precedence over a weekly count', () => {
    const read = readHabitPhrase('Run 3 times a week on Monday and Thursday at 08:00', 'en')
    expect(read).toMatchObject({
      cadence: 'fixed',
      days: ['Monday', 'Thursday'],
      frequencyQuantity: null,
      dueTime: '08:00',
      emoji: '🏃',
    })
    expect(read.consumed.map((token) => token.kind)).toEqual(['weekday', 'weekday', 'time'])
  })

  it('gives a weekly count precedence over a daily phrase', () => {
    const read = readHabitPhrase('Read every day, 3 times a week', 'en')
    expect(read.cadence).toBe('flexible')
    expect(read.frequencyQuantity).toBe(3)
    expect(read.consumed.map((token) => token.kind)).toEqual(['count'])
  })

  it('does not read the count in three times a week as an hour', () => {
    expect(readHabitPhrase('Run 3 times a week', 'en')).toMatchObject({
      cadence: 'flexible',
      frequencyQuantity: 3,
      dueTime: null,
    })
  })

  it('reads a bare daily phrase and a separated clock time', () => {
    expect(readHabitPhrase('Stretch every morning 7:05', 'en')).toMatchObject({
      cadence: 'daily',
      dueTime: '07:05',
      emoji: '🧘',
    })
  })

  it('reads Portuguese weekdays, daily phrases, counts and times', () => {
    expect(readHabitPhrase('Ler toda segunda e quinta às 8h30', 'pt-BR')).toMatchObject({
      cadence: 'fixed',
      days: ['Monday', 'Thursday'],
      dueTime: '08:30',
      emoji: '📖',
    })
    expect(readHabitPhrase('Beber água 2 vezes por semana', 'pt-BR')).toMatchObject({
      cadence: 'flexible',
      frequencyQuantity: 2,
      emoji: '💧',
    })
    expect(readHabitPhrase('Alongar todos os dias', 'pt-BR').cadence).toBe('daily')
  })

  it('reads the complete Portuguese colon clock after at', () => {
    expect(readHabitPhrase('às 8:30', 'pt-BR')).toEqual({
      cadence: null,
      days: [],
      frequencyQuantity: null,
      dueTime: '08:30',
      emoji: null,
      consumed: [{ start: 0, end: 7, kind: 'time' }],
    })
  })

  it.each(['toda manhã', 'toda manha'])('reads the complete Portuguese daily phrase %s', (phrase) => {
    expect(readHabitPhrase(phrase, 'pt-BR')).toEqual({
      cadence: 'daily',
      days: [],
      frequencyQuantity: null,
      dueTime: null,
      emoji: null,
      consumed: [{ start: 0, end: 10, kind: 'daily' }],
    })
  })

  it('leaves unsupported cadence and invalid times unresolved', () => {
    expect(readHabitPhrase('Drink more water when I can at 27:80', 'en')).toEqual({
      cadence: null,
      days: [],
      frequencyQuantity: null,
      dueTime: null,
      emoji: '💧',
      consumed: [],
    })
    expect(readHabitPhrase('Run 9 times a week', 'en').cadence).toBeNull()
  })

  it('reads a time only with a separator or after at', () => {
    expect(readHabitPhrase('Read daily at 8', 'en').dueTime).toBe('08:00')
    expect(readHabitPhrase('Read daily 8', 'en').dueTime).toBeNull()
    expect(readHabitPhrase('Ler diariamente as 9', 'pt-BR').dueTime).toBe('09:00')
  })

  it('segments consumed words without changing the original text', () => {
    const text = 'Run Monday at 08:00'
    const segments = segmentHabitPhrase(text, readHabitPhrase(text, 'en').consumed)
    expect(segments.map((segment) => segment.text).join('')).toBe(text)
    expect(segments.filter((segment) => segment.consumed).map((segment) => segment.text)).toEqual([
      'Monday',
      'at 08:00',
    ])
    expect(segmentHabitPhrase('', [])).toEqual([])
  })

  it('segments adjacent tokens and preserves unresolved trailing text', () => {
    expect(segmentHabitPhrase('daily later', [
      { start: 0, end: 5, kind: 'daily' },
      { start: 5, end: 6, kind: 'daily' },
    ])).toEqual([
      { text: 'daily', consumed: true },
      { text: ' ', consumed: true },
      { text: 'later', consumed: false },
    ])
    expect(segmentHabitPhrase('unresolved', [])).toEqual([
      { text: 'unresolved', consumed: false },
    ])
  })
})
