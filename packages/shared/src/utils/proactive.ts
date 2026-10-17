export function proactiveActionLabelKey(trigger: string) {
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
