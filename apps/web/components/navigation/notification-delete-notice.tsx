'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2 } from '@/components/ui/icons'
import dynamic from 'next/dynamic'
import {
  cancelPendingNotificationDelete,
  dismissFailedNotificationDelete,
  FAILED_DELETE_NOTICE_LIFE_MS,
  getNotificationDeleteNoticeSnapshot,
  dismissPendingNotificationDeleteNotice,
  retryFailedNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

const Toast = dynamic(() => import('@/components/ui/toast').then((module) => module.Toast), { loading: () => null })

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
      actionLabel={t('common.retry')} actionIcon="refresh" onAction={retry}
      doneAfterMs={FAILED_DELETE_NOTICE_LIFE_MS} onDone={dismiss} />
  )
}

export function NotificationDeleteNotice() {
  useEffect(() => {
    void import('@/components/ui/toast').catch((error: unknown) => {
      window.dispatchEvent(new ErrorEvent('error', { error, message: String(error), cancelable: true }))
    })
  }, [])
  const t = useTranslations()
  const notice = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getNotificationDeleteNoticeSnapshot,
    getNotificationDeleteNoticeSnapshot,
  )
  if (!notice) return null
  if (notice.kind === 'failed') return <FailedDeleteToast key={`failed-${notice.id}`} notificationId={notice.id} />
  return (
    <Toast key={notice.id} kind="neutral" icon={<Trash2 size={20} aria-hidden="true" />} message={t('notifications.deleteQueued')}
      actionLabel={t('notifications.deleteUndo')}
      onAction={() => cancelPendingNotificationDelete(notice.id)} onDismiss={() => dismissPendingNotificationDeleteNotice(notice.id)} />
  )
}
