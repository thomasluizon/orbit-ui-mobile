import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  getNotificationTargetKey,
  isViewableNotificationUrl,
  resolveNotificationUrl,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { Button } from '@/components/ui/pill-button'
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
  const targetKey = getNotificationTargetKey(notification.url)
  const router = useRouter()
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
    const url = notification.url
    if (!isViewableNotificationUrl(url)) return
    closeSheet(() => {
      onClose()
      router.push(resolveNotificationUrl(url))
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
          {targetKey ? ` · ${t(targetKey)}` : null}
        </Text>
        <Text style={styles.bodyText}>{notification.body}</Text>

        <View style={styles.actions}>
          {canView ? (
            <Button variant={width >= 1024 ? 'secondary' : 'primary'} size="sm" onClick={handleView}>
              {targetKey ? t('notifications.openIn', { target: t(targetKey) }) : t('notifications.view')}
            </Button>
          ) : null}
          {canMarkAsRead ? (
            <QuietAction
              label={t('notifications.markAsRead')}
              color={tokens.fg2}
              onPress={() => onMarkAsRead(notification.id)}
            />
          ) : null}
          <QuietAction
            label={t('notifications.delete')}
            color={tokens.statusBad}
            onPress={handleDelete}
          />
        </View>
      </View>
    </Sheet>) : null
  )
}

function QuietAction({
  label,
  color,
  onPress,
}: Readonly<{ label: string; color: string; onPress: () => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        quietActionStyles.chip,
        {
          backgroundColor: pressed ? tokens.bgHover : 'transparent',
        },
        pressed && quietActionStyles.pressed,
      ]}
    >
      <Text style={[quietActionStyles.label, { color }]}>{label}</Text>
    </Pressable>
  )
}

const quietActionStyles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
})

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
