import { describe, expect, it } from 'vitest'
import { readHabitPhrase } from '../utils/habit-phrase-parser'
import { describeEditDetailsError, guardHabitReadPatch, habitFlowFieldStep, habitFlowNamesAnswer, habitFlowOptionalQuestions, habitFlowSelectionAnswer, readHabitPhraseDate, readHabitPhraseValues, readHabitWhenWords, resolveEditDetails, summaryValueStep } from '../utils/habit-flow-details'

const base = { mode: 'create' as const, isGeneral: false, canSplit: true, hasParent: false, canEnd: true }
const context = { referenceDate: '2026-11-13', locale: 'pt-BR', timeZone: 'UTC', language: 'pt-BR' as const, allowPast: false }

describe('habitFlowOptionalQuestions', () => {
  it('gives every field of the full form a row on a dated create', () => {
    expect(habitFlowOptionalQuestions(base)).toEqual(['description', 'checklist', 'subHabits', 'avoid', 'tags', 'goals', 'endDate'])
  })

  it('hides the avoidance row for an undated item and the split row for a sub-item', () => {
    expect(habitFlowOptionalQuestions({ ...base, isGeneral: true, canSplit: false, canEnd: false })).toEqual(['description', 'checklist', 'tags', 'goals'])
  })

  it('adds the parent row in edit only', () => {
    expect(habitFlowOptionalQuestions({ ...base, mode: 'edit', canSplit: false, hasParent: true })).toContain('parent')
    expect(habitFlowOptionalQuestions({ ...base, hasParent: true })).not.toContain('parent')
  })
})

describe('the answers of the optional list', () => {
  const tags = [{ id: 'tag-1', name: 'Saúde' }, { id: 'tag-2', name: 'Casa' }, { id: 'tag-3', name: 'Trabalho' }]

  it('names the selected items in the order the person selected them, in the language of the person', () => {
    expect(habitFlowSelectionAnswer(['tag-2', 'tag-1'], tags, (tag) => tag.name, 'pt-BR')).toBe('Casa e Saúde')
    expect(habitFlowSelectionAnswer(['tag-1', 'tag-2', 'tag-3'], tags, (tag) => tag.name, 'en')).toBe('Saúde, Casa, and Trabalho')
  })

  it('shows no answer with no selection, and the count of the selection when a selected id has no name yet', () => {
    expect(habitFlowSelectionAnswer([], tags, (tag) => tag.name, 'en')).toBeUndefined()
    expect(habitFlowSelectionAnswer(['tag-9'], tags, (tag) => tag.name, 'en')).toBe('1')
    expect(habitFlowSelectionAnswer(['tag-1'], undefined, (tag: { id: string; name: string }) => tag.name, 'en')).toBe('1')
    expect(habitFlowSelectionAnswer(['tag-9', 'tag-3'], tags, (tag) => tag.name, 'en')).toBe('2')
  })

  it('takes a name from the first source that holds the id: the links the record carries, then the list', () => {
    const linked = [{ id: 'goal-77', title: 'Ler 12 livros' }]
    const list = [{ id: 'goal-1', title: 'Correr 5 km' }, { id: 'goal-77', title: 'Old title' }]
    expect(habitFlowSelectionAnswer(['goal-77', 'goal-1'], [...linked, ...list], (goal) => goal.title, 'pt-BR')).toBe('Ler 12 livros e Correr 5 km')
    expect(habitFlowSelectionAnswer(['goal-77'], linked, (goal) => goal.title, 'en')).toBe('Ler 12 livros')
  })

  it('leaves out a sub-item row the person left empty', () => {
    expect(habitFlowNamesAnswer(['Alongar', '  ', 'Beber água'], 'pt-BR')).toBe('Alongar e Beber água')
    expect(habitFlowNamesAnswer(['', ' '], 'pt-BR')).toBeUndefined()
  })
})

describe('resolveEditDetails', () => {
  const read = { guided: true, habitId: 'habit-1', hasDetail: false, pending: false, fetching: false, error: null as Error | null }
  const failure = new Error('offline')

  it('waits with the save off while the first read runs', () => {
    expect(resolveEditDetails({ ...read, pending: true, fetching: true })).toEqual({ loading: true, failureShown: false, shownError: null, toastError: null, blocked: true })
  })

  it('never waits on a read that is not in flight and holds no value, a disabled or a paused read', () => {
    const stalled = resolveEditDetails({ ...read, habitId: 'h1', pending: true, fetching: false })
    expect(stalled).toEqual({ loading: false, failureShown: true, shownError: null, toastError: null, blocked: true })
  })

  it('states a failed read on the summary, not in a toast, and keeps the save off', () => {
    expect(resolveEditDetails({ ...read, error: failure })).toEqual({ loading: false, failureShown: true, shownError: failure, toastError: null, blocked: true })
  })

  it('waits again while the retry of a failed read runs', () => {
    expect(resolveEditDetails({ ...read, error: failure, fetching: true })).toEqual({ loading: true, failureShown: false, shownError: null, toastError: null, blocked: true })
  })

  it('is ready once the details load, and leaves a later refetch error to the toast', () => {
    expect(resolveEditDetails({ ...read, hasDetail: true })).toEqual({ loading: false, failureShown: false, shownError: null, toastError: null, blocked: false })
    expect(resolveEditDetails({ ...read, hasDetail: true, error: failure })).toEqual({ loading: false, failureShown: false, shownError: null, toastError: failure, blocked: false })
  })

  it('never blocks a habit created offline, whose list record is the whole record', () => {
    expect(resolveEditDetails({ ...read, habitId: 'offline-habit-7', error: failure })).toEqual({ loading: false, failureShown: false, shownError: null, toastError: failure, blocked: false })
    expect(resolveEditDetails({ ...read, habitId: 'offline-habit-7', pending: true })).toEqual({ loading: false, failureShown: false, shownError: null, toastError: null, blocked: false })
  })

  it('holds the full form while its first read runs', () => {
    expect(resolveEditDetails({ ...read, guided: false, pending: true, fetching: true })).toEqual({ loading: true, failureShown: false, shownError: null, toastError: null, blocked: true })
  })

  it('states a read that cannot run on the full form, and keeps its fields and its save off', () => {
    expect(resolveEditDetails({ ...read, guided: false, pending: true })).toEqual({ loading: false, failureShown: true, shownError: null, toastError: null, blocked: true })
  })

  it('opens the full form after a failed read and leaves the error to the toast', () => {
    const opened = { loading: false, failureShown: false, shownError: null, toastError: failure, blocked: false }
    expect(resolveEditDetails({ ...read, guided: false, error: failure })).toEqual(opened)
    expect(resolveEditDetails({ ...read, guided: false, error: failure, fetching: true })).toEqual(opened)
  })

  it('never blocks the full form of a habit created offline', () => {
    expect(resolveEditDetails({ ...read, guided: false, habitId: 'offline-habit-7', pending: true })).toEqual({ loading: false, failureShown: false, shownError: null, toastError: null, blocked: false })
  })

  it('leaves a closed edit as it is', () => {
    expect(resolveEditDetails({ ...read, habitId: null, pending: true })).toEqual({ loading: false, failureShown: false, shownError: null, toastError: null, blocked: false })
  })
})

describe('summaryValueStep', () => {
  it('opens the repeat step for a dated habit and the date question for a task', () => {
    expect(summaryValueStep('when', { itemType: 'habit', isGeneral: false })).toBe('repeat')
    expect(summaryValueStep('when', { itemType: 'task', isGeneral: false })).toBe('when')
    expect(summaryValueStep('when', { itemType: 'habit', isGeneral: true })).toBe('when')
  })

  it('opens the reminder kinds from the reminder value and the time question from the time value', () => {
    expect(summaryValueStep('reminder', { itemType: 'task', isGeneral: false })).toBe('reminderKind')
    expect(summaryValueStep('time', { itemType: 'task', isGeneral: false })).toBe('time')
  })
})

describe('readHabitWhenWords', () => {
  it('reads a repeat before a date', () => {
    expect(readHabitWhenWords('toda segunda', context).kind).toBe('repeat')
  })

  it('resolves a day in the words of the person', () => {
    expect(readHabitWhenWords('dia 20', context)).toEqual({ kind: 'date', date: '2026-11-20' })
  })

  it('refuses a past day for a new task and keeps it for an edit', () => {
    expect(readHabitWhenWords('2026-11-01', context)).toEqual({ kind: 'past' })
    expect(readHabitWhenWords('2026-11-01', { ...context, allowPast: true })).toEqual({ kind: 'date', date: '2026-11-01' })
  })

  it('keeps words it cannot read unresolved', () => {
    expect(readHabitWhenWords('quando der vontade', context)).toEqual({ kind: 'unresolved' })
  })
})

describe('readHabitWhenWords: a bare weekday', () => {
  const wednesday = { ...context, referenceDate: '2026-11-25' }
  const english = { ...wednesday, locale: 'en', language: 'en' as const }

  it.each(['sexta', 'próxima sexta', 'sexta-feira'])('reads "%s" as the next Friday for a task', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
  })

  it.each([['seg.', '2026-11-30'], ['qui.', '2026-11-26'], ['sex.', '2026-11-27'], ['sáb.', '2026-11-28'], ['dom.', '2026-11-29'], ['na qua.', '2026-12-02']])('reads the short day "%s" with its dot as the next date for a task', (words, date) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' })).toEqual({ kind: 'date', date })
  })

  it.each([['mon.', '2026-11-30'], ['fri.', '2026-11-27'], ['on thu.', '2026-11-26']])('reads the short day "%s" with its dot as the next date for a task', (words, date) => {
    expect(readHabitWhenWords(words, { ...english, itemType: 'task' })).toEqual({ kind: 'date', date })
  })

  it.each(['friday', 'next friday'])('reads "%s" as the next Friday for a task', (words) => {
    expect(readHabitWhenWords(words, { ...english, itemType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
  })

  it('reads a bare weekday as a date when the type is not set', () => {
    expect(readHabitWhenWords('sexta', wednesday)).toEqual({ kind: 'date', date: '2026-11-27' })
    expect(readHabitWhenWords('sexta', { ...wednesday, itemType: null, deliberateType: null })).toEqual({ kind: 'date', date: '2026-11-27' })
  })

  it('reads a bare weekday as the weekly repeat when the type is a habit', () => {
    const habit = readHabitWhenWords('sexta', { ...wednesday, itemType: 'habit' })
    expect(habit).toMatchObject({ kind: 'repeat', read: { cadence: 'fixed', days: ['Friday'] } })
    expect(readHabitWhenWords('friday', { ...english, itemType: 'habit' })).toMatchObject({ kind: 'repeat', read: { days: ['Friday'] } })
  })

  it('lets the type the person set win over the type the form holds', () => {
    expect(readHabitWhenWords('sexta', { ...wednesday, itemType: 'habit', deliberateType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
    expect(readHabitWhenWords('sexta', { ...wednesday, itemType: 'task', deliberateType: 'habit' }).kind).toBe('repeat')
  })

  it.each(['na sexta', 'nesta sexta', 'pra sexta', 'sexta às 9', 'sexta que vem', 'sexta, às 9h', 'sexta às 9 da manhã', 'sexta às 3 da tarde', 'sexta às 8 da noite', 'sexta-feira às 10 da manhã', 'sexta às 9 horas', 'sexta ao meio-dia', 'sexta pela manhã'])('reads "%s" as the next Friday for a task', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
  })

  it.each(['this friday', 'on friday', 'by friday', 'friday at 9', 'friday morning', 'friday at 9 in the morning', 'friday at 3 in the afternoon', 'friday at noon'])('reads "%s" as the next Friday for a task', (words) => {
    expect(readHabitWhenWords(words, { ...english, itemType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
  })

  it.each(['sexta, toda semana', 'sexta semanalmente'])('reads "%s" as a repeat for a task', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' }).kind).toBe('repeat')
  })

  it('reads "friday weekly" as a repeat for a task', () => {
    expect(readHabitWhenWords('friday weekly', { ...english, itemType: 'task' }).kind).toBe('repeat')
  })

  it.each(['toda sexta', 'todas as sextas', 'às sextas', 'sextas', 'sexta toda semana', 'segunda e sexta', 'todo dia', 'a cada 2 semanas'])('reads "%s" as a repeat for a task', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' }).kind).toBe('repeat')
  })

  it.each(['every friday', 'each friday', 'fridays', 'friday every week', 'every friday and monday', 'every day'])('reads "%s" as a repeat for a task', (words) => {
    expect(readHabitWhenWords(words, { ...english, itemType: 'task' }).kind).toBe('repeat')
  })
})

describe('readHabitWhenWords: words that are not one bare weekday', () => {
  const wednesday = { ...context, referenceDate: '2026-11-25' }
  const english = { ...wednesday, locale: 'en', language: 'en' as const }
  const portuguese = ['primeira sexta do mês', 'última sexta do mês', 'sexta quinzenal', 'sexta alternada', 'sexta mensalmente', 'depois de ter tempo', 'antes de ter aula', 'sexta, 4 de dezembro', 'sexta dia 4', 'dia 4, sexta']
  const englishWords = ['first friday of the month', 'biweekly friday', 'friday fortnightly', 'not friday', 'friday december 4', 'december 4, friday', 'monthly on friday']

  it.each(portuguese)('never reads "%s" as the next weekday', (words) => {
    for (const itemType of ['task', null, 'habit'] as const) {
      const read = readHabitWhenWords(words, { ...wednesday, itemType })
      expect(read).not.toEqual({ kind: 'date', date: '2026-11-27' })
      expect(read).not.toEqual({ kind: 'date', date: '2026-12-01' })
    }
  })

  it.each(englishWords)('never reads "%s" as the next weekday', (words) => {
    for (const itemType of ['task', null, 'habit'] as const) {
      expect(readHabitWhenWords(words, { ...english, itemType })).not.toEqual({ kind: 'date', date: '2026-11-27' })
    }
  })

  it('keeps the repeat that the habit parser reads for a repeat word', () => {
    expect(readHabitWhenWords('sexta quinzenal', { ...wednesday, itemType: 'habit' }).kind).not.toBe('date')
    expect(readHabitWhenWords('biweekly friday', { ...english, itemType: 'habit' }).kind).not.toBe('date')
  })

  it('refuses the words with no repeat as unresolved', () => {
    expect(readHabitWhenWords('depois de ter tempo', { ...wednesday, itemType: 'task' })).toEqual({ kind: 'unresolved' })
    expect(readHabitWhenWords('not friday', { ...english, itemType: 'task' })).toEqual({ kind: 'unresolved' })
  })

  it.each(['nesta sexta', 'nesta sexta às 9', 'sexta de manhã', 'sexta à tarde', 'sexta que vem'])('still reads "%s" as the next Friday', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
  })

  it.each(['this friday', 'this friday at 9', 'friday afternoon', 'friday evening'])('still reads "%s" as the next Friday', (words) => {
    expect(readHabitWhenWords(words, { ...english, itemType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
  })
})

describe('readHabitWhenWords: a weekday full name and its qualifiers', () => {
  const wednesday = { ...context, referenceDate: '2026-11-25' }
  const english = { ...wednesday, locale: 'en', language: 'en' as const }
  const friday = { kind: 'date', date: '2026-11-27' }

  it.each(['sexta feira', 'na sexta feira', 'sexta feira que vem', 'próxima sexta feira', 'proxima sexta-feira', 'até sexta', 'ate sexta feira'])('reads "%s" as the next Friday for a task and with no type', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' })).toEqual(friday)
    expect(readHabitWhenWords(words, wednesday)).toEqual(friday)
    expect(readHabitWhenWords(words, { ...wednesday, itemType: null, deliberateType: 'task' })).toEqual(friday)
  })

  it.each([['terça feira', '2026-12-01'], ['segunda feira', '2026-11-30'], ['quarta feira', '2026-12-02']])('reads "%s" as one date', (words, date) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' })).toEqual({ kind: 'date', date })
  })

  it.each(['sexta feira', 'na sexta feira', 'até sexta'])('reads "%s" as the weekly repeat for a habit', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'habit' })).toMatchObject({ kind: 'repeat', read: { days: ['Friday'] } })
  })

  it.each(['toda sexta feira', 'todas as sextas feiras', 'sextas feiras', 'sexta feira toda semana', 'segunda e sexta feira', 'sexta feira quinzenal'])('keeps "%s" a repeat for a task', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' }).kind).toBe('repeat')
  })

  it.each(['primeira sexta do mês', 'sexta quinzenal'])('keeps "%s" out of one date', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' })).not.toEqual(friday)
  })

  it('reads the English twin of "até sexta" and keeps the unmodeled words', () => {
    expect(readHabitWhenWords('by friday', { ...english, itemType: 'task' })).toEqual(friday)
    expect(readHabitWhenWords('on friday', { ...english, itemType: 'task' })).toEqual(friday)
    expect(readHabitWhenWords('biweekly friday', { ...english, itemType: 'task' })).not.toEqual(friday)
    expect(readHabitWhenWords('not friday', { ...english, itemType: 'task' })).toEqual({ kind: 'unresolved' })
  })

  it('never reads a weekday out of a word that is not a weekday', () => {
    expect(readHabitWhenWords('depois de ter tempo', { ...wednesday, itemType: 'task' })).toEqual({ kind: 'unresolved' })
    expect(readHabitWhenWords('feira', { ...wednesday, itemType: 'task' })).toEqual({ kind: 'unresolved' })
  })
})

describe('readHabitWhenWords: a weekday with a time or a part of the day', () => {
  const wednesday = { ...context, referenceDate: '2026-11-25' }
  const english = { ...wednesday, locale: 'en', language: 'en' as const }
  const portuguese = ['sexta às 9 da manhã', 'sexta às 3 da tarde', 'sexta às 8 da noite', 'sexta-feira às 10 da manhã', 'sexta às 9 horas', 'sexta ao meio-dia', 'sexta pela manhã']
  const englishWords = ['friday at 9 in the morning', 'friday at 3 in the afternoon', 'friday at noon']

  it.each(portuguese)('reads "%s" as one date for a task and with no type, and as the weekly repeat for a habit', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
    expect(readHabitWhenWords(words, wednesday)).toEqual({ kind: 'date', date: '2026-11-27' })
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'habit' })).toMatchObject({ kind: 'repeat', read: { days: ['Friday'] } })
  })

  it.each(englishWords)('reads "%s" as one date for a task and with no type, and as the weekly repeat for a habit', (words) => {
    expect(readHabitWhenWords(words, { ...english, itemType: 'task' })).toEqual({ kind: 'date', date: '2026-11-27' })
    expect(readHabitWhenWords(words, english)).toEqual({ kind: 'date', date: '2026-11-27' })
    expect(readHabitWhenWords(words, { ...english, itemType: 'habit' })).toMatchObject({ kind: 'repeat', read: { days: ['Friday'] } })
  })

  it.each(['toda sexta às 9 da manhã', 'sextas às 9 da manhã'])('keeps "%s" a repeat for a task', (words) => {
    expect(readHabitWhenWords(words, { ...wednesday, itemType: 'task' }).kind).toBe('repeat')
  })

  it('keeps "every friday at noon" a repeat for a task', () => {
    expect(readHabitWhenWords('every friday at noon', { ...english, itemType: 'task' }).kind).toBe('repeat')
  })

  it('keeps "sexta da semana que vem" a repeat for a task', () => {
    expect(readHabitWhenWords('sexta da semana que vem', { ...wednesday, itemType: 'task' }).kind).toBe('repeat')
  })

  it.each(['friday the 27th', 'friday in two weeks'])('keeps "%s" a repeat for a task', (words) => {
    expect(readHabitWhenWords(words, { ...english, itemType: 'task' }).kind).toBe('repeat')
  })

  it('keeps "primeira sexta do mês" unresolved', () => {
    expect(readHabitWhenWords('primeira sexta do mês', { ...wednesday, itemType: 'task' })).toEqual({ kind: 'unresolved' })
  })
})

describe('habitFlowFieldStep', () => {
  it('opens the step that owns a server field error', () => {
    expect(habitFlowFieldStep('title')).toBe('what')
    expect(habitFlowFieldStep('description')).toBe('optional:description')
    expect(habitFlowFieldStep('dueEndTime')).toBe('duration')
    expect(habitFlowFieldStep('slipAlertEnabled')).toBe('slipAlert')
  })

  it('stays on the summary for an unknown field', () => {
    expect(habitFlowFieldStep('somethingElse')).toBe('summary')
    expect(habitFlowFieldStep(undefined)).toBe('summary')
  })
})

describe('guardHabitReadPatch', () => {
  const patch = { mode: 'recurring' as const, emoji: '💊', frequencyUnit: 'Day' as const, frequencyQuantity: 1, days: ['Monday'], dueTime: '08:00', subHabitTitles: [], checklistItems: [] }
  const nothingTyped = { repeat: false, date: false, time: false, emoji: false }
  const nothingSet = { deliberateType: null, whenSet: false, timeSet: false, emojiSet: false, typed: nothingTyped, undated: false }
  const noSchedule = { mode: 'oneTime', frequencyUnit: null, frequencyQuantity: null, days: [] }

  it('keeps every proposal when the person set nothing yet', () => {
    expect(guardHabitReadPatch(patch, nothingSet)).toEqual(patch)
  })

  it('keeps the proposed repeat when the person chose Habit on the type step', () => {
    const guarded = guardHabitReadPatch(patch, { ...nothingSet, deliberateType: 'habit' })
    expect(guarded).toEqual(patch)
    expect(guarded).toMatchObject({ mode: 'recurring', frequencyUnit: 'Day', days: ['Monday'] })
  })

  it.each([
    ['a deliberate task', { deliberateType: 'task' as const }, noSchedule],
    ['a When the person set', { whenSet: true }, noSchedule],
    ['a time the person set', { timeSet: true }, { dueTime: null }],
    ['an emoji the person chose', { emojiSet: true }, { emoji: null }],
    ['an undated item, with no repeat and no time', { undated: true }, { ...noSchedule, dueTime: null }],
    ['a repeat or a day the person typed in the phrase', { typed: { ...nothingTyped, repeat: true } }, noSchedule],
    ['a date the person typed in the phrase', { typed: { ...nothingTyped, date: true } }, noSchedule],
    ['a time the person typed in the phrase', { typed: { ...nothingTyped, time: true } }, { dueTime: null }],
    ['an emoji the person typed in the phrase', { typed: { ...nothingTyped, emoji: true } }, { emoji: null }],
  ])('drops only the proposals that %s holds', (_name, held, dropped) => {
    expect(guardHabitReadPatch(patch, { ...nothingSet, ...held })).toEqual({ ...patch, ...dropped })
  })
})

describe('readHabitPhraseValues', () => {
  const values = (phrase: string, locale: 'en' | 'pt-BR' = 'en') => readHabitPhraseValues(phrase, readHabitPhrase(phrase, locale))

  it('names the repeat, the time and the emoji that the person typed in the phrase', () => {
    expect(values('water the plants')).toEqual({ repeat: false, date: false, time: false, emoji: false })
    expect(values('water the plants every monday at 9am')).toEqual({ repeat: true, date: false, time: true, emoji: false })
    expect(values('💧 regar as plantas 3 vezes por semana', 'pt-BR')).toEqual({ repeat: true, date: false, time: false, emoji: true })
  })

  it.each([
    ['every 2 weeks', 'water the plants every 2 weeks', 'en'],
    ['a cada 2 semanas', 'regar as plantas a cada 2 semanas', 'pt-BR'],
    ['every other monday', 'run every other monday', 'en'],
    ['todo dia 5 do mês', 'pagar o aluguel todo dia 5 do mês', 'pt-BR'],
  ] as const)('counts %s as a repeat the person typed, by the one rule onboarding also reads', (_words, phrase, locale) => {
    expect(values(phrase, locale).repeat).toBe(true)
  })

  it.each([
    ['💧', true],
    ['❤️', true],
    ['🇧🇷', true],
    ['👍🏽', true],
    ['©️', true],
    ['❤', false],
    ['©', false],
    ['®', false],
    ['™', false],
    ['‼', false],
    ['Coca-Cola® zero', false],
    ['10 km', false],
  ])('reads %s as an emoji the person typed: %s', (phrase, emoji) => {
    expect(values(phrase).emoji).toBe(emoji)
  })

  it('names a date the person typed in the phrase', () => {
    const date = readHabitPhraseDate('call mom tomorrow', readHabitPhrase('call mom tomorrow', 'en'), { referenceDate: '2026-11-13', locale: 'en', timeZone: 'UTC' })
    expect(readHabitPhraseValues('call mom tomorrow', readHabitPhrase('call mom tomorrow', 'en'), date).date).toBe(true)
  })
})

describe('readHabitPhraseDate', () => {
  const context = { referenceDate: '2026-11-13', locale: 'en', timeZone: 'UTC' }
  const dateOf = (phrase: string, locale: 'en' | 'pt-BR' = 'en') => {
    const found = readHabitPhraseDate(phrase, readHabitPhrase(phrase, locale), { ...context, locale })
    return found ? { date: found.date, words: phrase.slice(found.span.start, found.span.end) } : null
  }

  it.each([
    ['call mom tomorrow', 'en', '2026-11-14', 'tomorrow'],
    ['ligar para a mãe amanhã', 'pt-BR', '2026-11-14', 'amanhã'],
    ['ligar para a mãe depois de amanhã', 'pt-BR', '2026-11-15', 'depois de amanhã'],
    ['call mom next monday', 'en', '2026-11-16', 'next monday'],
    ['dentist on december 5', 'en', '2026-12-05', 'december 5'],
    ['dentista dia 5', 'pt-BR', '2026-12-05', 'dia 5'],
    ['pay the bill on the 20th', 'en', '2026-11-20', 'on the 20th'],
    ['renew the passport 12/05/2027', 'pt-BR', '2027-05-12', '12/05/2027'],
    ['call mom tomorrow at 9am', 'en', '2026-11-14', 'tomorrow'],
  ] as const)('reads the date in %s', (phrase, locale, date, words) => {
    expect(dateOf(phrase, locale)).toEqual({ date, words })
  })

  it.each([
    ['a repeat, which holds the When', 'call mom every monday from tomorrow'],
    ['a bare interval', 'water the plants every 2 weeks'],
    ['a fraction', 'drink 1/2 liter'],
    ['an ordinal', 'read the 2nd book'],
    ['a short weekday name that is also a word', 'walk in the sun'],
    ['a past day', 'pay the bill 2026-11-01'],
    ['no date', 'water the plants'],
  ])('reads no date in %s', (_case, phrase) => {
    expect(dateOf(phrase)).toBeNull()
  })

  it('reads no date in the Portuguese words that are also short weekday names', () => {
    expect(dateOf('ter mais paciência', 'pt-BR')).toBeNull()
    expect(dateOf('educação sex', 'pt-BR')).toBeNull()
  })
})

describe('describeEditDetailsError', () => {
  it('states a failed read of one habit with its own message, not the message of the habit list', () => {
    const onRetry = () => {}
    const described = describeEditDetailsError(true, new Error('boom'), (key) => key, onRetry)
    expect(described).toEqual({ message: 'errors.fetchHabitDetails', onRetry })
    expect(describeEditDetailsError(false, null, (key) => key, onRetry)).toBeNull()
  })

  it('states a read that cannot run with the generic message, because it holds no error', () => {
    const onRetry = () => {}
    expect(describeEditDetailsError(true, null, (key) => key, onRetry)).toEqual({ message: 'errors.fetchHabitDetails', onRetry })
  })
})
