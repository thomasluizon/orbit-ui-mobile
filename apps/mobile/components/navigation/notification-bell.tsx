import { useMemo, useState, useCallback, useSyncExternalStore } from 'react'
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
import { formatNotificationRelativeTime } from '@orbit/shared/utils'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAppToast } from '@/hooks/use-app-toast'
import { plural } from '@/lib/plural'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

// ---------------------------------------------------------------------------
// NotificationBell
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const { t } = useTranslation()
  const { colors, shadows } = useAppTheme()
  const { notifications, isLoading } = useNotifications()
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const deleteAll = useDeleteAllNotifications()
  const { showQueued } = useAppToast()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] =
    useState<NotificationItem | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const pendingDeleteIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getPendingNotificationDeleteIdsSnapshot,
    getPendingNotificationDeleteIdsSnapshot,
  )
  const pendingDeleteIdSet = useMemo(() => new Set(pendingDeleteIds), [pendingDeleteIds])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])
  const visibleNotifications = useMemo(
    () => notifications.filter((item) => !pendingDeleteIdSet.has(item.id)),
    [notifications, pendingDeleteIdSet],
  )
  const visibleUnreadCount = useMemo(
    () => visibleNotifications.filter((item) => !item.isRead).length,
    [visibleNotifications],
  )

  const cancelPendingDelete = useCallback((notificationId: string) => {
    cancelPendingNotificationDelete(notificationId)
  }, [])

  const requestDeleteNotification = useCallback((notification: NotificationItem) => {
    const queued = queuePendingNotificationDelete(notification.id, () => {
      deleteNotification.mutate(notification.id)
    })
    if (!queued) return

    showQueued(t('notifications.deleteQueued'), t('notifications.deleteUndo'), () => {
      cancelPendingDelete(notification.id)
    })
  }, [cancelPendingDelete, deleteNotification, showQueued, t])

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
    const notification = notifications.find((item) => item.id === id)
    if (notification) {
      requestDeleteNotification(notification)
    }
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
          <Text style={styles.notifTime}>
            {formatNotificationRelativeTime(item.createdAtUtc, (key, values) =>
              t(`notifications.${key}`, values),
            )}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          activeOpacity={0.7}
          onPress={() => requestDeleteNotification(item)}
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
          visibleUnreadCount > 0
            ? plural(t('notifications.bellWithCount', { count: visibleUnreadCount }), visibleUnreadCount)
            : t('notifications.bell')
        }
      >
        <Bell size={16} color={colors.textSecondary} />
        {visibleUnreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {visibleUnreadCount > 9 ? '9+' : visibleUnreadCount}
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
          {visibleUnreadCount > 0 && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => markAllAsRead.mutate()}
            >
              <Text style={styles.markAllText}>
                {t('notifications.markAllRead')}
              </Text>
            </TouchableOpacity>
          )}
          {visibleNotifications.length > 0 && (
            <TouchableOpacity
              style={styles.deleteAllBtn}
              activeOpacity={0.7}
              onPress={() => setShowDeleteAllConfirm(true)}
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
            visibleNotifications.length === 0 && styles.emptyListContainer,
          ]}
        >
          {isLoading && visibleNotifications.length === 0 ? (
            renderEmpty()
          ) : visibleNotifications.length === 0 ? (
            renderEmpty()
          ) : (
            visibleNotifications.map((item) => renderNotification({ item }))
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
      <ConfirmDialog
        open={showDeleteAllConfirm}
        onOpenChange={setShowDeleteAllConfirm}
        title={t('notifications.deleteAllConfirmTitle')}
        description={t('notifications.deleteAllConfirmDescription')}
        confirmLabel={t('notifications.deleteAll')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => deleteAll.mutate()}
        variant="danger"
      />
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
