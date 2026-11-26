import { describe, expect, it } from 'vitest'
import { getProactiveActionReason, getTodayOrbitLine, getTodayOrbitSlot, proactiveActionLabelKey } from '../utils/proactive'
import { createMockProactiveItem } from './factories'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

describe('today Orbit line', () => {
  const item = createMockProactiveItem()
  const available = { isTodaySelected: true, inDrillOrSurface: false, item: null, returning: null }
  const translate = (key: string, values?: { days: number }) => values ? `${key}:${values.days}` : key

  it('prefers the proactive item over a returning line', () => {
    expect(getTodayOrbitLine({ ...available, item, returning: { kind: 'elapsed', days: 5 } }, translate))
      .toEqual({ text: item.text, destination: 'todayOrbit.openConversation', item })
  })

  it.each([
    [{ isTodaySelected: false }, null],
    [{ inDrillOrSurface: true }, null],
  ])('suppresses a proactive item when %j', (state, expected) => {
    expect(getTodayOrbitLine({ ...available, item, ...state }, translate)).toBe(expected)
  })

  it('falls back to the returning sentence or no line', () => {
    expect(getTodayOrbitLine(available, translate)).toBeNull()
  })

  it('shows the sentence with no count of days for a gap inside or beyond the window', () => {
    const expected = { text: 'todayOrbit.guided.returning', destination: 'todayOrbit.viewProgress', item: null }
    expect(getTodayOrbitLine({ ...available, returning: { kind: 'bounded' } }, translate)).toEqual(expected)
    expect(getTodayOrbitSlot({ ...available, returning: { kind: 'bounded' } }, translate)).toEqual(expected)
    expect(getTodayOrbitLine({ ...available, returning: { kind: 'elapsed', days: 5 } }, translate)).toEqual(expected)
  })

  it('uses the summary only after the proactive and returning lines', () => {
    expect(getTodayOrbitSlot({ ...available, item, returning: { kind: 'elapsed', days: 5 } }, translate))
      .toEqual({ text: item.text, destination: 'todayOrbit.openConversation', item })
    expect(getTodayOrbitSlot({ ...available, returning: { kind: 'elapsed', days: 5 } }, translate))
      .toEqual({ text: 'todayOrbit.guided.returning', destination: 'todayOrbit.viewProgress', item: null })
    expect(getTodayOrbitSlot(available, translate)).toBe('summary')
  })

  it.each([
    { isTodaySelected: false },
    { inDrillOrSurface: true },
  ])('suppresses every slot candidate when %j', (state) => {
    expect(getTodayOrbitSlot({ ...available, ...state }, translate)).toBeNull()
    expect(getTodayOrbitSlot({ ...available, item, ...state }, translate)).toBeNull()
    expect(getTodayOrbitSlot({ ...available, returning: { kind: 'elapsed', days: 5 }, ...state }, translate)).toBeNull()
  })
})

describe('the sentences of the Orbit line while it rests', () => {
  it.each([
    ['en offline', en.todayOrbit.guided.offline], ['pt-BR offline', ptBR.todayOrbit.guided.offline],
    ['en limit', en.conversation.restLimit], ['pt-BR limit', ptBR.conversation.restLimit],
  ])('writes the %s reason as one sentence', (_name, sentence) => {
    expect(sentence.match(/[.!?]/gu)).toEqual(['.'])
    expect(sentence.endsWith('.')).toBe(true)
  })
})

describe('the reason words of a resting AI', () => {
  it.each([['en', en], ['pt-BR', ptBR]] as const)('holds every reason key in the %s file', (_locale, words) => {
    expect(words.todayOrbit.guided.offline).toBeTruthy()
    expect(words.conversation.restLimit).toBeTruthy()
  })
})

describe('proactive action', () => {
  it.each([
    ['MorningPlan', 'proactive.actions.morningPlan'],
    ['EveningCheckin', 'proactive.actions.eveningCheckin'],
    ['RestartAfterMiss', 'proactive.actions.restartAfterMiss'],
    ['BusyCalendarDay', 'proactive.actions.busyCalendarDay'],
    ['GoalBehind', 'proactive.actions.goalBehind'],
    ['WeeklyReview', 'proactive.actions.weeklyReview'],
    ['unknown', 'shell.composer.send'],
  ])('provides a fallback action label for %s', (trigger, key) => {
    expect(proactiveActionLabelKey(trigger)).toBe(key)
  })

  const available = { ended: false, online: true, atLimit: false, busy: false, failed: false }

  it.each([
    [{ ended: true, online: false, atLimit: true, busy: true, failed: true }, 'proactive.ended'],
    [{ online: false, atLimit: true, busy: true, failed: true }, 'shell.composer.offline.reason'],
    [{ atLimit: true, busy: true, failed: true }, 'shell.composer.limit.reason'],
    [{ busy: true, failed: true }, 'shell.composer.busy.reason'],
    [{ failed: true }, 'chat.sendError'],
    [{}, null],
  ])('explains the first blocking condition for %j', (state, reason) => {
    expect(getProactiveActionReason({ ...available, ...state })).toBe(reason)
  })
})
