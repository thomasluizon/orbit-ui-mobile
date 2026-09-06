import { useMemo } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  getNotificationTargetKey,
  getNotificationDestination,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { Button } from '@/components/ui/pill-button'
import { useUIStore } from '@/stores/ui-store'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface NotificationDetailModalProps {
  open: boolean
  onClose: () => void
  notification: NotificationItem
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
}

export function NotificationDetailModal({
  open,
  onClose,
  notification,
  onMarkAsRead,
  onDelete,
}: Readonly<NotificationDetailModalProps>) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const targetKey = getNotificationTargetKey(notification.url, notification.habitId)
  const router = useRouter()
  const setAstraConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { sheetRef, closeSheet } = useSheetHost()
  const { canView, canMarkAsRead } = getNotificationDetailActionVisibility(
    notification,
  )

  function handleView() {
    const destination = getNotificationDestination(notification.url, notification.habitId)
    if (!destination) return
    closeSheet(() => {
      onClose()
      router.push(destination.url)
      if (destination.opensAstra) setAstraConversationOpen(true)
    })
  }

  function handleDelete() {
    onDelete(notification.id)
    closeSheet()
  }

  return (
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={onClose}
      title={notification.title}
    >
      <View style={styles.container}>
        <Text style={styles.timestamp}>
          {formatNotificationRelativeTime(
            notification.createdAtUtc,
            (key, values) => t(`notifications.${key}`, values),
          )}
          {targetKey ? ` Â· ${t(targetKey)}` : null}
        </Text>
        <Text style={styles.bodyText}>{notification.body}</Text>

        <View style={styles.actions}>
          {canView ? (
            <Button variant={width >= 1024 ? 'secondary' : 'primary'} size="sm" onClick={handleView}>
              {targetKey ? t('notifications.openIn', { target: t(targetKey) }) : t('notifications.view')}
            </Button>
          ) : null}
          {canMarkAsRead ? (
            <Button variant="ghost" size="sm" onClick={() => onMarkAsRead(notification.id)}>
              {t('notifications.markAsRead')}
            </Button>
          ) : null}
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            {t('notifications.delete')}
          </Button>
        </View>
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingBottom: 8,
      gap: 12,
    },
    timestamp: {
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      color: tokens.fg4,
      fontVariant: ['tabular-nums'],
    },
    bodyText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 17,
      color: tokens.fg2,
      lineHeight: 26.35,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
    },
  })
}
