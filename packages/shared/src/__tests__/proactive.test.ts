import { describe, expect, it } from 'vitest'
import { getProactiveActionReason, getTodayAstraLine, proactiveActionLabelKey } from '../utils/proactive'
import { createMockProactiveItem } from './factories'

describe('today Astra line', () => {
  const item = createMockProactiveItem()
  const available = { isTodaySelected: true, inDrillOrSurface: false, item: null, returning: null }
  const translate = (key: string, values?: { days: number }) => values ? `${key}:${values.days}` : key

  it('prefers the proactive item over a returning line', () => {
    expect(getTodayAstraLine({ ...available, item, returning: { kind: 'elapsed', days: 5 } }, translate))
      .toEqual({ text: item.text, destination: 'todayAstra.openConversation', item })
  })

  it.each([
    [{ isTodaySelected: false }, null],
    [{ inDrillOrSurface: true }, null],
  ])('suppresses a proactive item when %j', (state, expected) => {
    expect(getTodayAstraLine({ ...available, item, ...state }, translate)).toBe(expected)
  })

  it('falls back to each returning interval or no line', () => {
    expect(getTodayAstraLine({ ...available, returning: { kind: 'elapsed', days: 5 } }, translate))
      .toEqual({ text: 'todayAstra.returningElapsed:5', destination: 'todayAstra.viewProgress', item: null })
    expect(getTodayAstraLine({ ...available, returning: { kind: 'bounded' } }, translate))
      .toEqual({ text: 'todayAstra.returningBounded', destination: 'todayAstra.viewProgress', item: null })
    expect(getTodayAstraLine(available, translate)).toBeNull()
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

  const available = { ended: false, online: true, atLimit: false, busy: false, failed: false, ready: true }

  it.each([
    [{ ended: true, online: false, atLimit: true, busy: true, failed: true, ready: false }, 'proactive.ended'],
    [{ online: false, atLimit: true, busy: true, failed: true, ready: false }, 'shell.composer.offline.reason'],
    [{ atLimit: true, busy: true, failed: true, ready: false }, 'shell.composer.limit.reason'],
    [{ busy: true, failed: true, ready: false }, 'shell.composer.busy.reason'],
    [{ failed: true, ready: false }, 'chat.sendError'],
    [{ ready: false }, 'common.loading'],
    [{}, null],
  ])('explains the first blocking condition for %j', (state, reason) => {
    expect(getProactiveActionReason({ ...available, ...state })).toBe(reason)
  })
})
