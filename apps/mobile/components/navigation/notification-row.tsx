import { SMALL_PILL_VISIBLE_MIN, SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { PersonalText } from '@/components/ui/personal-text'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { nestedControlFill, surfaceHighlighted, useRowFeedback } from '@/hooks/use-row-feedback'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { CircleDot, Gift, Trash2 } from '@/components/ui/icons'
import { formatNotificationRelativeTime, getNotificationTargetKey, getDestinationForLabel } from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { selectionSettleTransition } from '@/components/motion/selection-settle'
import { useFlag } from '@/hooks/use-flag'
import { usePrefersReducedMotion } from '@/lib/motion'

function NotificationTargetIcon({ targetKey, color }: Readonly<{
  targetKey: NonNullable<ReturnType<typeof getNotificationTargetKey>>
  color: string
}>) {
  const destination = getDestinationForLabel(targetKey)
  if (destination) return <DestinationIcon destination={destination} size={16} color={color} />
  const Icon = targetKey === 'profile.wrappedTitle' ? Gift : CircleDot
  return <Icon size={16} color={color} accessible={false} />
}

type Tokens = ReturnType<typeof createTokensV2>

/**
 * The unread mark on the Orbit logic: the card fill with its ring, and the dot. Both stay mounted and settle with the
 * selection motion as the row turns read, at once under reduced motion.
 */
function UnreadSurface({ unread, tokens }: Readonly<{ unread: boolean; tokens: Tokens }>) {
  const reducedMotion = usePrefersReducedMotion()
  return <Animated.View testID="notification-unread-surface" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
    style={[styles.fill, { backgroundColor: tokens.bgCard, boxShadow: `inset 0 0 0 1px ${tokens.hairline}`, opacity: unread ? 1 : 0, transition: selectionSettleTransition('opacity', unread, reducedMotion) }]} />
}

function UnreadDot({ unread, guided, tokens }: Readonly<{ unread: boolean; guided: boolean; tokens: Tokens }>) {
  const reducedMotion = usePrefersReducedMotion()
  if (guided) return <Animated.View testID="notification-unread-mark" data-unread={unread}
    style={[styles.dot, { backgroundColor: tokens.fg1, opacity: unread ? 1 : 0, transition: selectionSettleTransition('opacity', unread, reducedMotion) }]} />
  return unread ? <View testID="notification-unread-dot" style={[styles.dot, { backgroundColor: tokens.fg1 }]} /> : null
}

export function NotificationRow({ item, onOpen, onDelete }: Readonly<{
  item: NotificationItem
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}>) {
  const { t } = useTranslation()
  const bodyFeedback = useRowFeedback()
  const deleteFeedback = useRowFeedback()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const targetKey = getNotificationTargetKey(item.url, item.habitId)
  const guided = useFlag('orbit_guided_flows')
  const unread = !item.isRead
  return (
    <View testID={item.isRead ? 'notification-read' : 'notification-unread'}
      style={[styles.wrapper, unread && !guided && { backgroundColor: tokens.bgCard, boxShadow: `inset 0 0 0 1px ${tokens.hairline}` }]}>
      {guided ? <UnreadSurface unread={unread} tokens={tokens} /> : null}
      <View testID="notification-row-feedback" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
        style={[styles.fill, { backgroundColor: surfaceHighlighted(bodyFeedback.highlighted, [deleteFeedback]) ? tokens.bgHover : 'transparent' },
          bodyFeedback.focused && { outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens.primary, outlineOffset: -3,
            borderWidth: 4, borderStyle: 'solid', borderColor: tokens.fg1 }]} />
      <Pressable accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${t(item.isRead ? 'notifications.read' : 'notifications.unread')}${targetKey ? `. ${t(targetKey)}` : ''}`}
        onPress={() => onOpen(item)}
        {...bodyFeedback.handlers}
        style={styles.row}>
        <View testID="notification-dot-column" style={styles.dotColumn}>
          <UnreadDot unread={unread} guided={guided} tokens={tokens} />
        </View>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.titleSlot}><PersonalText testID="notification-title" style={[styles.title, {
              fontFamily: item.isRead ? 'Geist_400Regular' : 'Geist_500Medium',
              color: item.isRead ? tokens.fg2 : tokens.fg1,
            }]}>{item.title}</PersonalText></View>
            <Text style={[styles.meta, { color: tokens.fg2 }]}>
              {formatNotificationRelativeTime(item.createdAtUtc, (key, values) => t(`notifications.${key}`, values))}
            </Text>
          </View>
          <Text style={[styles.body, { color: tokens.fg2 }]}>{item.body}</Text>
          {targetKey ? <View style={styles.target}>
            <NotificationTargetIcon targetKey={targetKey} color={tokens.fg3} />
            <Text style={[styles.meta, { color: tokens.fg2 }]}>{t(targetKey)}</Text>
          </View> : null}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button"
        accessibilityLabel={t('notifications.deleteNotification', { title: item.title })}
        onPress={() => onDelete(item)}
        {...deleteFeedback.handlers}
        style={styles.deleteButton}>
        <View testID="notification-delete-feedback" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          style={[styles.deleteFill, { backgroundColor: nestedControlFill(deleteFeedback, tokens) },
            deleteFeedback.focused && { outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens.primary, outlineOffset: -3,
              borderWidth: 4, borderStyle: 'solid', borderColor: tokens.fg1 }]} />
        <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
          <Trash2 size={20} color={tokens.statusBad} />
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 12 },
  deleteFill: { position: 'absolute', width: SMALL_PILL_VISIBLE_MIN, height: SMALL_PILL_VISIBLE_MIN, borderRadius: 999 },
  wrapper: { position: 'relative', flexDirection: 'row', alignItems: 'stretch', gap: 4, borderRadius: 12 },
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: SPACING.s16, minHeight: TOUCH_TARGET_MIN, borderRadius: 12 },
  deleteButton: { width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, flexShrink: 0, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  dotColumn: { width: 8, flexShrink: 0, alignSelf: 'stretch', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 999 },
  content: { flex: 1, minWidth: 0, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  titleSlot: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, lineHeight: 22.4 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
