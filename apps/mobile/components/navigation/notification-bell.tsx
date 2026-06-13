import { useMemo, useState, useCallback, useSyncExternalStore } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  FlatList,
  StyleSheet,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { Bell, BellOff, CheckCheck, Flame, Sparkles, Trash2, Trophy, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import {
  formatNotificationRelativeTime,
  getNotificationGlyph,
  type NotificationGlyph,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteAllNotifications,
} from '@/hooks/use-notifications'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'
import { NotificationDetailModal } from './notification-detail-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAppToast } from '@/hooks/use-app-toast'
import { plural } from '@/lib/plural'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

type AppTokens = ReturnType<typeof createTokensV2>

const glyphIconMap = {
  streak: Flame,
  celebration: Trophy,
  astra: Sparkles,
  reminder: Bell,
} as const

function glyphColor(glyph: NotificationGlyph, tokens: AppTokens): string {
  if (glyph === 'streak') return tokens.statusOverdue
  if (glyph === 'reminder') return tokens.fg3
  return tokens.primarySoft
}

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

interface NotificationRowContext {
  tokens: AppTokens
  styles: ReturnType<typeof createStyles>
  t: (key: string, values?: Record<string, unknown>) => string
  onPress: (notification: NotificationItem) => void
  onRequestDelete: (notification: NotificationItem) => void
}

function renderNotificationRow(
  item: NotificationItem,
  index: number,
  context: NotificationRowContext,
) {
  const { tokens, styles, t, onPress, onRequestDelete } = context
  const glyph = getNotificationGlyph(item)
  const GlyphIcon = glyphIconMap[glyph]
  return (
    <Animated.View entering={rowEntrance(index)}>
      <TouchableOpacity
        style={[styles.notifRow, !item.isRead && styles.notifUnread]}
        activeOpacity={0.7}
        onPress={() => onPress(item)}
        accessibilityLabel={item.title}
      >
        <View style={styles.notifGlyphCircle}>
          <GlyphIcon size={20} color={glyphColor(glyph, tokens)} strokeWidth={1.8} />
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifTopRow}>
            <Text style={styles.notifTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.notifTime}>
              {formatNotificationRelativeTime(item.createdAtUtc, (key, values) =>
                t(`notifications.${key}`, values),
              )}
            </Text>
          </View>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed ? styles.deleteBtnPressed : null,
          ]}
          onPress={() => onRequestDelete(item)}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.deleteNotification')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {({ pressed }) => (
            <X
              size={18}
              color={pressed ? tokens.statusBad : tokens.fg4}
              strokeWidth={1.8}
            />
          )}
        </Pressable>
      </TouchableOpacity>
    </Animated.View>
  )
}

type NotificationBellStyles = ReturnType<typeof createStyles>

interface NotificationListActionsProps {
  tokens: AppTokens
  styles: NotificationBellStyles
  showMarkAllRead: boolean
  showDeleteAll: boolean
  onMarkAllRead: () => void
  onDeleteAll: () => void
}

function NotificationListActions({
  tokens,
  styles,
  showMarkAllRead,
  showDeleteAll,
  onMarkAllRead,
  onDeleteAll,
}: Readonly<NotificationListActionsProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.actionsRow}>
      {showMarkAllRead && (
        <Pressable
          style={({ pressed }) => [
            styles.sheetActionBtn,
            pressed ? styles.deleteBtnPressed : null,
          ]}
          onPress={onMarkAllRead}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.markAllRead')}
        >
          {({ pressed }) => (
            <CheckCheck
              size={18}
              color={pressed ? tokens.primarySoft : tokens.fg3}
              strokeWidth={1.8}
            />
          )}
        </Pressable>
      )}
      {showDeleteAll && (
        <Pressable
          style={({ pressed }) => [
            styles.sheetActionBtn,
            pressed ? styles.deleteBtnPressed : null,
          ]}
          onPress={onDeleteAll}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.deleteAll')}
        >
          {({ pressed }) => (
            <Trash2
              size={18}
              color={pressed ? tokens.statusBad : tokens.fg3}
              strokeWidth={1.8}
            />
          )}
        </Pressable>
      )}
    </View>
  )
}

interface NotificationListEmptyProps {
  tokens: AppTokens
  styles: NotificationBellStyles
  isLoading: boolean
}

function NotificationListEmpty({
  tokens,
  styles,
  isLoading,
}: Readonly<NotificationListEmptyProps>) {
  const { t } = useTranslation()
  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator color={tokens.primary} />
      </View>
    )
  }
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.notifGlyphCircle}>
        <BellOff size={20} color={tokens.fg3} strokeWidth={1.8} />
      </View>
      <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
    </View>
  )
}

export function NotificationBell() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
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

  const styles = useMemo(() => createStyles(tokens), [tokens])
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

  function renderNotification({ item, index }: { item: NotificationItem; index: number }) {
    return renderNotificationRow(item, index, {
      tokens,
      styles,
      t,
      onPress: handlePress,
      onRequestDelete: requestDeleteNotification,
    })
  }

  return (
    <View>
      <Pressable
        style={({ pressed }) => [
          styles.bellButton,
          { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
          pressed ? styles.bellPressed : null,
        ]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={
          visibleUnreadCount > 0
            ? plural(t('notifications.bellWithCount', { count: visibleUnreadCount }), visibleUnreadCount)
            : t('notifications.bell')
        }
      >
        <Bell size={22} color={tokens.fg1} strokeWidth={1.8} />
        {visibleUnreadCount > 0 && <View style={styles.bellUnreadDot} />}
      </Pressable>

      <BottomSheetModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('notifications.title')}
        snapPoints={['88%', '96%']}
      >
        <FlatList
          style={styles.listScroll}
          data={visibleNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <NotificationListActions
              tokens={tokens}
              styles={styles}
              showMarkAllRead={visibleUnreadCount > 0}
              showDeleteAll={visibleNotifications.length > 0}
              onMarkAllRead={() => markAllAsRead.mutate()}
              onDeleteAll={() => setShowDeleteAllConfirm(true)}
            />
          }
          ListEmptyComponent={
            <NotificationListEmpty
              tokens={tokens}
              styles={styles}
              isLoading={isLoading}
            />
          }
          contentContainerStyle={[
            withDrawerContentInset(styles.listContent),
            visibleNotifications.length === 0 && styles.emptyListContainer,
          ]}
        />
      </BottomSheetModal>

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

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    bellButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: tokens.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellPressed: {
      transform: [{ scale: 0.92 }],
    },
    bellUnreadDot: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: tokens.primary,
      borderWidth: 2,
      borderColor: tokens.bg,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      marginBottom: 4,
    },
    sheetActionBtn: {
      width: 40,
      height: 40,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    notifUnread: {
      backgroundColor: tintFromPrimary(tokens, 0.06),
    },
    notifGlyphCircle: {
      width: 42,
      height: 42,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    notifContent: {
      flex: 1,
      minWidth: 0,
    },
    notifTopRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    },
    notifTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
      color: tokens.fg1,
    },
    notifTime: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      flexShrink: 0,
    },
    notifBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 19.6,
      color: tokens.fg3,
      marginTop: 3,
    },
    deleteBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnPressed: {
      transform: [{ scale: 0.92 }],
      backgroundColor: tokens.bgElev2,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 8,
    },
    emptyText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
    },
    listScroll: {
      flex: 1,
    },
    listContent: {
      paddingBottom: 8,
    },
    emptyListContainer: {
      flexGrow: 1,
      justifyContent: 'center',
    },
  })
}
