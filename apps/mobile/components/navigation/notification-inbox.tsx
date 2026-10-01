import { useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification, useDeleteAllNotifications } from '@/hooks/use-notifications'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { cancelPendingNotificationDelete, clearFailedNotificationDeletes, queuePendingNotificationDelete } from '@/lib/pending-notification-deletes'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/pill-button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { NotificationBellDisplay } from './notification-bell'
import { NotificationDetailModal } from './notification-detail-modal'
import { NotificationList } from './notification-list'

export function NotificationInbox() {
  const { t } = useTranslation()
  const clearance = useShellScrollerClearance()
  const goBack = useGoBackOrFallback()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const inbox = useNotificationInbox()
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const deleteAll = useDeleteAllNotifications()
  const [selected, setSelected] = useState<NotificationItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function requestDeleteNotification(item: NotificationItem) {
    queuePendingNotificationDelete(item.id, () => deleteNotification.mutateAsync(item.id))
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <PageHeader title={t('notifications.title')} backLabel={t('common.back')}
        onBack={() => goBack('/')} action={<NotificationBellDisplay count={inbox.visibleUnreadCount} />}
        footer={inbox.visibleUnreadCount > 0 || inbox.visibleNotifications.length > 0 ? <View style={styles.actions}>
          {inbox.visibleUnreadCount > 0 ? (
            /* eslint-disable-next-line local/max-button-words -- granted canvas label, Orbit Avisos.dc.html:206 (D42) */
            <Button variant="ghost" size="sm" accessibleName={t('notifications.markAllRead')}
              onClick={() => markAllAsRead.mutate()}>{t('notifications.markAllRead')}</Button>
          ) : null}
          {inbox.visibleNotifications.length > 0 ? <Button variant="ghost" size="sm" accessibleName={t('notifications.deleteAll')}
            onClick={() => setConfirmOpen(true)}>{t('notifications.deleteAll')}</Button> : null}
        </View> : undefined}
      />
      <ScrollView style={styles.scroller} contentContainerStyle={{ paddingBottom: clearance }}>
        <NotificationList items={inbox.visibleNotifications} isLoading={inbox.isLoading} isError={inbox.isError}
          onRetry={() => void inbox.refetch()} onDelete={requestDeleteNotification}
          onOpen={(item) => { setSelected(item); setDetailOpen(true) }} />
      </ScrollView>
      {selected ? <NotificationDetailModal open={detailOpen} onClose={() => setDetailOpen(false)}
        notification={inbox.notifications.find((item) => item.id === selected.id) ?? selected}
        onMarkAsRead={(id) => markAsRead.mutate(id)}
        onDelete={() => requestDeleteNotification(selected)} /> : null}
      <ConfirmSheet open={confirmOpen} title={t('notifications.deleteAllConfirmTitle')}
        message={t('notifications.deleteAllConfirmDescription', { count: inbox.visibleNotifications.length })}
        confirmLabel={t('notifications.deleteAllAction')} destructive inlineActions
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          inbox.pendingDeleteIds.forEach(cancelPendingNotificationDelete)
          clearFailedNotificationDeletes()
          deleteAll.mutate()
        }} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  scroller: { flex: 1 },
})
