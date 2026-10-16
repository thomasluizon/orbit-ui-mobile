
import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Trash2 } from '@/components/ui/icons'
import { Toast } from '@/components/ui/app-toast'
import {
  cancelPendingNotificationDelete,
  dismissFailedNotificationDelete,
  FAILED_DELETE_NOTICE_LIFE_MS,
  getFailedNotificationDeleteIdsSnapshot,
  getVisiblePendingNotificationDeleteIdsSnapshot,
  dismissPendingNotificationDeleteNotice,
  retryFailedNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

function FailedDeleteToast({ notificationId }: Readonly<{ notificationId: string }>) {
  const { t } = useTranslation()
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
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const pendingIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getVisiblePendingNotificationDeleteIdsSnapshot,
    getVisiblePendingNotificationDeleteIdsSnapshot,
  )
  const failedIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getFailedNotificationDeleteIdsSnapshot,
    getFailedNotificationDeleteIdsSnapshot,
  )
  return <>{pendingIds.map((id) => (
    <Toast key={id} kind="neutral" icon={<Trash2 size={20} color={tokens.fg2} />} message={t('notifications.deleteQueued')}
      actionLabel={t('notifications.deleteUndo')}
      onAction={() => cancelPendingNotificationDelete(id)} onDismiss={() => dismissPendingNotificationDeleteNotice(id)} />
  ))}{failedIds.map((id) => (
    <FailedDeleteToast key={`failed-${id}`} notificationId={id} />
  ))}</>
}
