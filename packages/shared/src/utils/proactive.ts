import type { ProactiveItem } from '../types/proactive'
import { shouldShowTodayOrbitSurface } from './notification-actions'
import type { ReturningInterval } from './returning-interval'

type TodayOrbitLine = { text: string; destination: string } & ({ item: ProactiveItem } | { item: null })
type ProactiveActionLabelKey = `proactive.actions.${'morningPlan' | 'eveningCheckin' | 'restartAfterMiss' | 'busyCalendarDay' | 'goalBehind' | 'weeklyReview'}` | 'shell.composer.send'

interface TodayOrbitState {
  isTodaySelected: boolean
  inDrillOrSurface: boolean
  item: ProactiveItem | null
  returning: ReturningInterval | null
}

type TodayOrbitTranslate = (key: 'todayOrbit.openConversation' | 'todayOrbit.viewProgress' | 'todayOrbit.guided.returning') => string

export function getTodayOrbitSlot(state: TodayOrbitState, translate: TodayOrbitTranslate): TodayOrbitLine | 'summary' | null {
  return getTodayOrbitLine(state, translate) ?? (shouldShowTodayOrbitSurface(state) ? 'summary' : null)
}

/** The line after a gap never counts days: a gap beyond the window shows the same sentence as a gap inside it. */
export function getTodayOrbitLine(state: TodayOrbitState, translate: TodayOrbitTranslate): TodayOrbitLine | null {
  if (!shouldShowTodayOrbitSurface(state)) return null
  if (state.item) return { text: state.item.text, destination: translate('todayOrbit.openConversation'), item: state.item }
  if (!state.returning) return null
  return {
    text: translate('todayOrbit.guided.returning'),
    destination: translate('todayOrbit.viewProgress'),
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
}): 'proactive.ended' | 'shell.composer.offline.reason' | 'shell.composer.limit.reason' | 'shell.composer.busy.reason' | 'chat.sendError' | null {
  if (state.ended) return 'proactive.ended'
  if (!state.online) return 'shell.composer.offline.reason'
  if (state.atLimit) return 'shell.composer.limit.reason'
  if (state.busy) return 'shell.composer.busy.reason'
  return state.failed ? 'chat.sendError' : null
}
