import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet } from 'react-native'
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
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { MoreVertical } from '@/components/ui/icons'
import { Menu, MenuAnchorHost, useAnchoredMenu } from '@/components/ui/menu'
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
  const menu = useAnchoredMenu()

  function requestDeleteNotification(item: NotificationItem) {
    queuePendingNotificationDelete(item.id, () => deleteNotification.mutateAsync(item.id))
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <PageHeader title={t('notifications.title')} backLabel={t('common.back')}
        onBack={() => goBack('/')} action={inbox.visibleNotifications.length > 0 ? <MenuAnchorHost anchorRef={menu.anchorRef}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.options')}
            accessibilityState={{ expanded: menu.visible }} onPress={menu.toggle}
            style={({ pressed }) => [styles.options, pressed && { backgroundColor: tokens.bgHover }]}>
            <MoreVertical size={20} color={tokens.fg2} />
          </Pressable>
        </MenuAnchorHost> : undefined} />
      <Menu open={menu.visible} anchorRef={menu.anchorRef} title={t('notifications.options')} shortTitle={t('common.options')}
        items={[
          ...(inbox.visibleUnreadCount > 0 ? [{ id: 'read', label: t('notifications.markAllReadMenu'), icon: 'check' }] : []),
          ...(inbox.visibleNotifications.length > 0 ? [{ id: 'clear', label: t('notifications.deleteAll'), icon: 'trash', destructive: true }] : []),
        ]}
        onClose={menu.close} onSelect={(id) => {
          if (id === 'read') markAllAsRead.mutate()
          else if (id === 'clear') setConfirmOpen(true)
        }} />
      <ScrollView style={styles.scroller} contentContainerStyle={{ paddingBottom: clearance }}>
        <NotificationList items={inbox.visibleNotifications} isLoading={inbox.isLoading} isError={inbox.isError}
          onRetry={() => void inbox.refetch()} onDelete={requestDeleteNotification}
          onOpen={(item) => { setSelected(item); setDetailOpen(true) }} />
      </ScrollView>
      {selected ? <NotificationDetailModal open={detailOpen} onClose={() => setDetailOpen(false)}
        notification={inbox.notifications.find((item) => item.id === selected.id) ?? selected}
        onMarkAsRead={(id) => markAsRead.mutate(id)}
        onDelete={() => requestDeleteNotification(selected)} /> : null}
      <ConfirmSheet open={confirmOpen} title={t('notifications.deleteAllAction')}
        message={t('notifications.deleteAllConfirmDescription', { count: inbox.visibleNotifications.length })}
        confirmLabel={t('notifications.deleteAllAction')} minimumActionHeight={48} destructive inlineActions
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
  options: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden' },
  scroller: { flex: 1 },
})
