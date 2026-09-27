import type { Query, QueryClient } from '@tanstack/query-core'
import type { AccountChange, AccountEventPayload } from '../types/account-event'
import {
  checklistTemplateKeys, gamificationKeys, goalKeys, habitKeys,
  notificationKeys, profileKeys, tagKeys,
} from './keys'

type QueryKey = readonly unknown[]

const TODAY_KEYS: QueryKey[] = [
  habitKeys.all, goalKeys.all, tagKeys.all, checklistTemplateKeys.all,
  profileKeys.all, gamificationKeys.all, notificationKeys.all,
]

export function accountChangeQueryKeys(change: AccountChange): QueryKey[] {
  switch (change.kind) {
    case 'habit':
    case 'habitLog':
      return [habitKeys.all, goalKeys.all, gamificationKeys.all]
    case 'goal':
    case 'goalProgress':
      return [goalKeys.all, habitKeys.all, gamificationKeys.all]
    case 'tag':
      return [tagKeys.all, habitKeys.all]
    case 'checklistTemplate':
      return [checklistTemplateKeys.all]
    case 'notification':
      return [notificationKeys.all]
    case 'profile':
      return [profileKeys.all, habitKeys.all, gamificationKeys.all]
    default:
      return TODAY_KEYS
  }
}

export function invalidateAccountEvent(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  event: { type: 'changes' | 'resync'; payload: AccountEventPayload },
  connectionId: string | null,
): void {
  if (event.type === 'changes' && event.payload.origin === connectionId && connectionId) return
  const keys = event.type === 'resync'
    ? TODAY_KEYS
    : event.payload.changes.flatMap(accountChangeQueryKeys)
  const unique = new Map(keys.map((key) => [JSON.stringify(key), key]))
  for (const queryKey of unique.values()) {
    void queryClient.invalidateQueries({ queryKey })
  }
}

export function invalidateAccountQueriesBefore(
  queryClient: Pick<QueryClient, 'getQueryCache' | 'invalidateQueries'>,
  mountedAt: number,
): void {
  const predicate = (query: Query) =>
    query.state.dataUpdatedAt > 0
      && query.state.dataUpdatedAt < mountedAt
      && query.state.fetchStatus === 'idle'
  for (const queryKey of TODAY_KEYS) {
    if (queryClient.getQueryCache().findAll({ queryKey, predicate }).length > 0) {
      void queryClient.invalidateQueries({ queryKey, predicate })
    }
  }
}
