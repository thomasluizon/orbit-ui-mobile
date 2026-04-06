import { useMemo, useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Bell, BellOff, Trash2, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { NotificationItem } from '@orbit/shared/types/notification'
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteAllNotifications,
} from '@/hooks/use-notifications'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { NotificationDetailModal } from './notification-detail-modal'
import { plural } from '@/lib/plural'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(dateStr: string, t: ReturnType<typeof useTranslation>['t']): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return t('notifications.now')
  if (diffMin < 60) return t('notifications.minutesAgo', { n: diffMin })
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return t('notifications.hoursAgo', { n: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  return t('notifications.daysAgo', { n: diffDays })
}

// ---------------------------------------------------------------------------
// NotificationBell
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const { t } = useTranslation()
  const { colors, shadows } = useAppTheme()
  const { notifications, unreadCount, isLoading } = useNotifications()
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const deleteAll = useDeleteAllNotifications()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] =
    useState<NotificationItem | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])

  function handlePress(notification: NotificationItem) {
    setSelectedNotification(notification)
    setIsDetailOpen(true)
    setIsOpen(false)
    if (!notification.isRead) {
      markAsRead.mutate(notification.id)
    }
  }

  function handleDetailMarkAsRead(id: string) {
    markAsRead.mutate(id)
  }

  function handleDetailDelete(id: string) {
    deleteNotification.mutate(id)
    setSelectedNotification(null)
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderNotification({ item }: { item: NotificationItem }) {
    return (
      <TouchableOpacity
        style={[styles.notifRow, !item.isRead && styles.notifUnread]}
        activeOpacity={0.7}
        onPress={() => handlePress(item)}
      >
        <View
          style={[
            styles.unreadDot,
            { backgroundColor: item.isRead ? 'transparent' : colors.primary },
          ]}
        />
        <View style={styles.notifContent}>
          <Text style={styles.notifTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.notifTime}>{formatTime(item.createdAtUtc, t)}</Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          activeOpacity={0.7}
          onPress={() => deleteNotification.mutate(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  function renderEmpty() {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )
    }
    return (
      <View style={styles.emptyContainer}>
        <BellOff size={32} color={colors.textMuted} />
        <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
      </View>
    )
  }

  return (
    <View>
      {/* Bell button */}
      <TouchableOpacity
        style={styles.bellButton}
        activeOpacity={0.7}
        onPress={toggle}
        accessibilityLabel={
          unreadCount > 0
            ? plural(t('notifications.bellWithCount', { count: unreadCount }), unreadCount)
            : t('notifications.bell')
        }
      >
        <Bell size={16} color={colors.textSecondary} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Notification list sheet */}
      <BottomSheetModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('notifications.title')}
        snapPoints={['88%', '96%']}
      >
        {/* Actions header */}
        <View style={styles.actionsRow}>
          {unreadCount > 0 && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => markAllAsRead.mutate()}
            >
              <Text style={styles.markAllText}>
                {t('notifications.markAllRead')}
              </Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              style={styles.deleteAllBtn}
              activeOpacity={0.7}
              onPress={() => deleteAll.mutate()}
            >
              <Trash2 size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <BottomSheetScrollView
          style={styles.listScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            notifications.length === 0 && styles.emptyListContainer,
          ]}
        >
          {isLoading && notifications.length === 0 ? (
            renderEmpty()
          ) : notifications.length === 0 ? (
            renderEmpty()
          ) : (
            notifications.map((item) => renderNotification({ item }))
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Detail modal */}
      {selectedNotification && (
        <NotificationDetailModal
          open={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          notification={selectedNotification}
          onMarkAsRead={handleDetailMarkAsRead}
          onDelete={handleDetailDelete}
        />
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors'], shadows: ReturnType<typeof useAppTheme>['shadows']) {
  return StyleSheet.create({
    bellButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: {
      color: colors.white,
      fontSize: 10,
      fontWeight: '700',
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 12,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    markAllText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    deleteAllBtn: {
      padding: 6,
      borderRadius: radius.full,
    },
    notifRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderMuted,
    },
    notifUnread: {
      backgroundColor: colors.primary_10,
      borderRadius: radius.md,
      marginHorizontal: -4,
      paddingHorizontal: 8,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 5,
    },
    notifContent: {
      flex: 1,
    },
    notifTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    notifBody: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    notifTime: {
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 4,
    },
    deleteBtn: {
      padding: 6,
      borderRadius: radius.full,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    listScroll: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    emptyListContainer: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    // preserved only for shadow consistency if needed later
    _shadow: shadows.lg,
  })
}
