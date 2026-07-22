import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  isViewableNotificationUrl,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { useSheetExitAction } from '@/hooks/use-sheet-exit-action'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface NotificationDetailModalProps {
  open: boolean
  onClose: () => void
  notification: NotificationItem
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
}

/** Sheet chrome with a mono timestamp eyebrow, body copy, and quiet text-button actions. */
export function NotificationDetailModal({
  open,
  onClose,
  notification,
  onMarkAsRead,
  onDelete,
}: Readonly<NotificationDetailModalProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { scheduleExitAction, runExitAction } = useSheetExitAction()
  const { canView, canMarkAsRead } = getNotificationDetailActionVisibility(
    notification,
  )

  function handleView() {
    const url = notification.url
    if (isViewableNotificationUrl(url)) {
      scheduleExitAction(() => router.push(url))
      onClose()
    }
  }

  function handleDelete() {
    onDelete(notification.id)
    onClose()
  }

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      onDidDismiss={runExitAction}
      title={notification.title}
      snapPoints={['50%', '92%']}
    >
      <View style={styles.container}>
        <Text style={styles.timestamp}>
          {formatNotificationRelativeTime(
            notification.createdAtUtc,
            (key, values) => t(`notifications.${key}`, values),
          )}
        </Text>
        <Text style={styles.bodyText}>{notification.body}</Text>

        <View style={styles.actions}>
          {canView ? (
            <QuietAction
              label={t('notifications.view')}
              color={tokens.primary}
              onPress={handleView}
              primary
            />
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
    </BottomSheetModal>
  )
}

function QuietAction({
  label,
  color,
  onPress,
  primary = false,
}: Readonly<{ label: string; color: string; onPress: () => void; primary?: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const surface = {
    rest: primary ? tintFromPrimary(tokens, 0.1) : tokens.bgElev,
    pressed: primary ? tintFromPrimary(tokens, 0.16) : tokens.bgElev2,
    border: primary ? tintFromPrimary(tokens, 0.28) : tokens.hairline,
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        quietActionStyles.chip,
        {
          backgroundColor: pressed ? surface.pressed : surface.rest,
          borderColor: surface.border,
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
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
})

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingBottom: 24,
    },
    timestamp: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 10,
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      letterSpacing: 0.24,
      fontVariant: ['tabular-nums'],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    bodyText: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 16,
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg2,
      lineHeight: 23,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 4,
    },
  })
}
