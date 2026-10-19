import type { ProactiveItem } from '../types/proactive'
import { shouldShowTodayAstraSurface } from './notification-actions'
import type { ReturningInterval } from './returning-interval'

type TodayAstraLine = { text: string; destination: string } & ({ item: ProactiveItem } | { item: null })
type ProactiveActionLabelKey = `proactive.actions.${'morningPlan' | 'eveningCheckin' | 'restartAfterMiss' | 'busyCalendarDay' | 'goalBehind' | 'weeklyReview'}` | 'shell.composer.send'

export function getTodayAstraLine(state: {
  isTodaySelected: boolean
  inDrillOrSurface: boolean
  item: ProactiveItem | null
  returning: ReturningInterval | null
}, translate: (key: 'todayAstra.openConversation' | 'todayAstra.viewProgress' | 'todayAstra.returningElapsed' | 'todayAstra.returningBounded', values?: { days: number }) => string): TodayAstraLine | null {
  if (!shouldShowTodayAstraSurface(state)) return null
  if (state.item) return { text: state.item.text, destination: translate('todayAstra.openConversation'), item: state.item }
  if (!state.returning) return null
  return {
    text: state.returning.kind === 'elapsed'
      ? translate('todayAstra.returningElapsed', { days: state.returning.days })
      : translate('todayAstra.returningBounded'),
    destination: translate('todayAstra.viewProgress'),
    item: null,
  }
}

export function proactiveActionLabelKey(trigger: string): ProactiveActionLabelKey {
  switch (trigger) {
    case 'MorningPlan': return 'proactive.actions.morningPlan'
    case 'EveningCheckin': return 'proactive.actions.eveningCheckin'
    case 'RestartAfterMiss': return 'proactive.actions.restartAfterMiss'
    case 'BusyCalendarDay': return 'proactive.actions.busyCalendarDay'
    case 'GoalBehind': return 'proactive.actions.goalBehind'
    case 'WeeklyReview': return 'proactive.actions.weeklyReview'
    default: return 'shell.composer.send'
  }
}

export function getProactiveActionReason(state: {
  ended: boolean
  online: boolean
  atLimit: boolean
  busy: boolean
  failed: boolean
  ready: boolean
}): 'proactive.ended' | 'shell.composer.offline.reason' | 'shell.composer.limit.reason' | 'shell.composer.busy.reason' | 'chat.sendError' | 'common.loading' | null {
  if (state.ended) return 'proactive.ended'
  if (!state.online) return 'shell.composer.offline.reason'
  if (state.atLimit) return 'shell.composer.limit.reason'
  if (state.busy) return 'shell.composer.busy.reason'
  if (state.failed) return 'chat.sendError'
  return state.ready ? null : 'common.loading'
}
