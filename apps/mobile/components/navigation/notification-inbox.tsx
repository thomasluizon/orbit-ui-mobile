import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification, useDeleteAllNotifications } from '@/hooks/use-notifications'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { cancelPendingNotificationDelete, queuePendingNotificationDelete } from '@/lib/pending-notification-deletes'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ArrowLeft } from '@/components/ui/icons'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { NotificationBellDisplay } from './notification-bell'
import { NotificationDetailModal } from './notification-detail-modal'
import { NotificationList } from './notification-list'

export function NotificationInbox() {
  const { t } = useTranslation()
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
    queuePendingNotificationDelete(item.id, () => deleteNotification.mutate(item.id))
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <View style={[styles.header, { borderBottomColor: tokens.hairline }]}>
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => goBack('/')}
            style={({ pressed }) => [styles.back, pressed && { backgroundColor: tokens.bgHover }]}>
            <ArrowLeft size={20} color={tokens.fg2} />
          </Pressable>
          <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t('notifications.title')}</Text>
          <NotificationBellDisplay count={inbox.visibleUnreadCount} />
        </View>
        <View style={styles.actions}>
          {inbox.visibleUnreadCount > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.markAllRead')} onPress={() => markAllAsRead.mutate()}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: tokens.bgHover }]}>
            <Text style={[styles.actionText, { color: tokens.fg1 }]}>{t('notifications.markAllRead')}</Text>
          </Pressable> : null}
          {inbox.visibleNotifications.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.deleteAll')} onPress={() => setConfirmOpen(true)}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: tokens.bgHover }]}>
            <Text style={[styles.actionText, { color: tokens.fg1 }]}>{t('notifications.deleteAll')}</Text>
          </Pressable> : null}
        </View>
      </View>
      <ScrollView style={styles.scroller}>
        <NotificationList items={inbox.visibleNotifications} isLoading={inbox.isLoading} isError={inbox.isError}
          onRetry={() => void inbox.refetch()} onDelete={requestDeleteNotification}
          onOpen={(item) => { setSelected(item); setDetailOpen(true) }} />
      </ScrollView>
      {selected ? <NotificationDetailModal open={detailOpen} onClose={() => setDetailOpen(false)}
        notification={inbox.notifications.find((item) => item.id === selected.id) ?? selected}
        onMarkAsRead={(id) => markAsRead.mutate(id)}
        onDelete={() => requestDeleteNotification(selected)} /> : null}
      <ConfirmSheet open={confirmOpen} title={t('notifications.deleteAllConfirmTitle')}
        message={t('notifications.deleteAllConfirmDescription')}
        confirmLabel={t('notifications.delete')} destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          inbox.pendingDeleteIds.forEach(cancelPendingNotificationDelete)
          deleteAll.mutate()
        }} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { borderBottomWidth: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  back: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontFamily: 'Geist_500Medium', fontSize: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  action: { minHeight: 44, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center' },
  actionText: { fontFamily: 'Geist_400Regular', fontSize: 14 },
  scroller: { flex: 1 },
})
