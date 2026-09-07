
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Trash2 } from '@/components/ui/icons'
import { Toast } from '@/components/ui/app-toast'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

export function NotificationDeleteNotice() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const pendingIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getPendingNotificationDeleteIdsSnapshot,
    getPendingNotificationDeleteIdsSnapshot,
  )
  return <>{pendingIds.map((id) => (
    <Toast key={id} kind="neutral" icon={<Trash2 size={20} color={tokens.fg2} />} message={t('notifications.deleteQueued')}
      actionLabel={t('notifications.deleteUndo')}
      onAction={() => cancelPendingNotificationDelete(id)} />
  ))}</>
}
