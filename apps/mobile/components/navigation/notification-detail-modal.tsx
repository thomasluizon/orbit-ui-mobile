import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  isViewableNotificationUrl,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { useSheetExitAction } from '@/hooks/use-sheet-exit-action'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface NotificationDetailModalProps {
  open: boolean
  onClose: () => void
  notification: NotificationItem
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
}

/** Sheet chrome with a mono timestamp eyebrow, body copy, and a PillButton action row. */
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
            <PillButton size="sm" variant="primary" onPress={handleView}>
              {t('notifications.view')}
            </PillButton>
          ) : null}
          {canMarkAsRead ? (
            <PillButton
              size="sm"
              variant="ghost"
              onPress={() => onMarkAsRead(notification.id)}
            >
              {t('notifications.markAsRead')}
            </PillButton>
          ) : null}
          <PillButton size="sm" variant="destructive" onPress={handleDelete}>
            {t('notifications.delete')}
          </PillButton>
        </View>
      </View>
    </BottomSheetModal>
  )
}

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
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 4,
    },
  })
}
