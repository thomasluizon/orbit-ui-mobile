
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Toast } from '@/components/ui/app-toast'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

export function NotificationDeleteNotice() {
  const { t } = useTranslation()
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
