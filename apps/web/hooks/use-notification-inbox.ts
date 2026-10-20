'use client'

import { useSyncExternalStore } from 'react'
import { getNotificationInboxState } from '@orbit/shared/utils'
import { useNotifications } from './use-notifications'
import {
  getPendingNotificationDeleteIdsSnapshot,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

export function useNotificationInbox() {
  const query = useNotifications()
  const pendingDeleteIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getPendingNotificationDeleteIdsSnapshot,
    getPendingNotificationDeleteIdsSnapshot,
  )
  return {
    ...query,
    ...getNotificationInboxState(query.notifications, query.unreadCount, pendingDeleteIds),
    pendingDeleteIds,
  }
}
