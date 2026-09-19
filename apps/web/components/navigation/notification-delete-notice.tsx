'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2 } from '@/components/ui/icons'
import { Toast } from '@/components/ui/toast'
import {
  cancelPendingNotificationDelete,
  dismissFailedNotificationDelete,
  FAILED_DELETE_NOTICE_LIFE_MS,
  getFailedNotificationDeleteIdsSnapshot,
  getPendingNotificationDeleteIdsSnapshot,
  retryFailedNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

/**
 * One failed delete, with its own component so the toast reads one stable pair of callbacks. The
 * toast restarts its life whenever `onDone` changes identity, so a callback rebuilt inside a map
 * would leave the notice on screen for as long as the tab runs.
 */
function FailedDeleteToast({ notificationId }: Readonly<{ notificationId: string }>) {
  const t = useTranslations()
  const retry = useCallback(() => {
    retryFailedNotificationDelete(notificationId)
  }, [notificationId])
  const dismiss = useCallback(() => {
    dismissFailedNotificationDelete(notificationId)
  }, [notificationId])

  return (
    <Toast kind="neutral" message={t('notifications.deleteError')}
      actionLabel={t('common.retry')} onAction={retry}
      doneAfterMs={FAILED_DELETE_NOTICE_LIFE_MS} onDone={dismiss} />
  )
}

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
    <FailedDeleteToast key={`failed-${id}`} notificationId={id} />
  ))}</>
}
