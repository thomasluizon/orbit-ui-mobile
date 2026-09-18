'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2 } from '@/components/ui/icons'
import { Toast } from '@/components/ui/toast'
import {
  cancelPendingNotificationDelete,
  getFailedNotificationDeleteIdsSnapshot,
  getPendingNotificationDeleteIdsSnapshot,
  retryFailedNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

export function NotificationDeleteNotice() {
  const t = useTranslations()
  const pendingIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getPendingNotificationDeleteIdsSnapshot,
    getPendingNotificationDeleteIdsSnapshot,
  )
  const failedIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getFailedNotificationDeleteIdsSnapshot,
    getFailedNotificationDeleteIdsSnapshot,
  )
  return <>{pendingIds.map((id) => (
    <Toast key={id} kind="neutral" icon={<Trash2 size={20} aria-hidden="true" />} message={t('notifications.deleteQueued')}
      actionLabel={t('notifications.deleteUndo')}
      onAction={() => cancelPendingNotificationDelete(id)} />
  ))}{failedIds.map((id) => (
    <Toast key={`failed-${id}`} kind="neutral" message={t('notifications.deleteError')}
      actionLabel={t('common.retry')} onAction={() => retryFailedNotificationDelete(id)} />
  ))}</>
}
