'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Toast } from '@/components/ui/toast'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

export function NotificationDeleteNotice() {
  const t = useTranslations()
  const pendingIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getPendingNotificationDeleteIdsSnapshot,
    getPendingNotificationDeleteIdsSnapshot,
  )
  return <>{pendingIds.map((id) => (
    <Toast key={id} kind="neutral" message={t('notifications.deleteQueued')}
      actionLabel={t('notifications.deleteUndo')}
      onAction={() => cancelPendingNotificationDelete(id)} />
  ))}</>
}
