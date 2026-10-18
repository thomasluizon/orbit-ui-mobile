import { describe, expect, it } from 'vitest'
import { getProactiveActionReason, proactiveActionLabelKey } from '../utils/proactive'

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
