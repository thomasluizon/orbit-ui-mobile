import type { PersistedQueuedMutation } from '@orbit/shared/types/sync'
import { getMutationScope, hasPendingOfflineDependencies, isAutomaticReplayBlocked } from './offline-mutations'

export function getRecoveryDate(mutation: PersistedQueuedMutation): string | null {
  const payload = mutation.payload
  if (payload && typeof payload === 'object' && 'date' in payload && typeof payload.date === 'string') {
    return payload.date
  }
  return mutation.dedupeKey?.match(/\d{4}-\d{2}-\d{2}$/)?.[0] ?? null
}

export function needsHabitCreation(mutation: PersistedQueuedMutation): boolean {
  return (mutation.scope ?? getMutationScope(mutation.type)) === 'habits' && (
    mutation.type === 'createHabit' ||
    Boolean(mutation.targetEntityId?.startsWith('offline-habit-')) ||
    (mutation.type === 'logHabit' && mutation.endpoint.includes('offline-habit-'))
  )
}

export function canRetryDroppedMutation(mutation: PersistedQueuedMutation): boolean {
  return Boolean(getMutationScope(mutation.type)) && !isAutomaticReplayBlocked(mutation.type) &&
    !hasPendingOfflineDependencies(mutation)
}

export function getDroppedItemName(mutation: PersistedQueuedMutation): string | null {
  const payload = mutation.payload
  if (payload && typeof payload === 'object') {
    if ('title' in payload && typeof payload.title === 'string') return payload.title
    if ('name' in payload && typeof payload.name === 'string') return payload.name
  }
  return null
}

export function getRecoveryMessage(
  mutation: PersistedQueuedMutation,
  item: string,
  translate: (key: string, values?: Record<string, unknown>) => string,
): string {
  if (needsHabitCreation(mutation)) {
    if (mutation.type === 'logHabit') {
      return translate('common.syncOrphaned', { date: getRecoveryDate(mutation) ?? translate('common.syncUnknownDate') })
    }
    return translate('common.syncHabitNotCreated', { item })
  }
  return translate(mutation.type === 'logHabit' ? 'common.syncDropped' : 'common.syncChangeDropped', { item })
}
