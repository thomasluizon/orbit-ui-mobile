import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { NotificationRow } from './notification-row'

export function NotificationList({ items, isLoading, isError, onRetry, onOpen, onDelete }: Readonly<{
  items: NotificationItem[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View accessibilityLabel={t('notifications.title')} accessibilityState={{ busy: isLoading }} style={styles.list}>
      {items.length > 0 ? items.map((item) => <NotificationRow key={item.id} item={item} onOpen={onOpen} onDelete={onDelete} />)
        : isLoading ? Array.from({ length: 5 }, (_, index) => (
          <View key={index} accessible={false} style={styles.skeletonRow}>
            <View style={styles.dotColumn} />
            <View style={styles.skeletonContent}>
              <View testID="notification-skeleton-line" style={[styles.skeletonTitle, { backgroundColor: tokens.bgElev }]} />
              <View testID="notification-skeleton-line" style={[styles.skeletonBody, { backgroundColor: tokens.bgElev }]} />
              <View testID="notification-skeleton-line" style={[styles.skeletonTarget, { backgroundColor: tokens.bgElev }]} />
            </View>
          </View>
        )) : (
          <View style={styles.empty}>
            {isError ? <>
              <Text style={[styles.copy, { color: tokens.fg3 }]}>{t('notifications.loadError')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')} onPress={onRetry} style={styles.retry}>
                <Text style={[styles.copy, { color: tokens.fg1 }]}>{t('common.retry')}</Text>
              </Pressable>
            </> : <>
              <OrbitMark size={96} />
              <Text style={[styles.copy, { color: tokens.fg3 }]}>{t('notifications.empty')}</Text>
            </>}
          </View>
        )}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  skeletonRow: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 12 },
  dotColumn: { width: 8 },
  skeletonContent: { flex: 1, gap: 8 },
  skeletonTitle: { width: '80%', height: 22, borderRadius: 999 },
  skeletonBody: { width: '100%', height: 21, borderRadius: 999 },
  skeletonTarget: { width: '32%', height: 16, borderRadius: 999 },
  empty: { padding: 32, gap: 16, borderRadius: 20, alignItems: 'center' },
  copy: { fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
})
