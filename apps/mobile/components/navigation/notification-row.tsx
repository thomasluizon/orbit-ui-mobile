import { View, Text, TouchableOpacity, Pressable } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { Bell, Flame, Heart, Sparkles, Trophy, UserPlus, Users, X } from 'lucide-react-native'
import {
  formatNotificationRelativeTime,
  getNotificationGlyph,
  type NotificationGlyph,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import type { createTokensV2 } from '@/lib/theme'
import type { NotificationBellStyles } from './notification-bell.styles'

type AppTokens = ReturnType<typeof createTokensV2>

export const glyphIconMap = {
  streak: Flame,
  celebration: Trophy,
  astra: Sparkles,
  friend: UserPlus,
  cheer: Heart,
  buddy: Users,
  reminder: Bell,
} as const

export function glyphColor(glyph: NotificationGlyph, tokens: AppTokens): string {
  if (glyph === 'streak') return tokens.statusOverdue
  if (glyph === 'reminder') return tokens.fg3
  return tokens.primarySoft
}

export function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

interface NotificationRowProps {
  item: NotificationItem
  index: number
  tokens: AppTokens
  styles: NotificationBellStyles
  t: (key: string, values?: Record<string, unknown>) => string
  onPress: (notification: NotificationItem) => void
  onRequestDelete: (notification: NotificationItem) => void
}

export function NotificationRow({
  item,
  index,
  tokens,
  styles,
  t,
  onPress,
  onRequestDelete,
}: Readonly<NotificationRowProps>) {
  const glyph = getNotificationGlyph(item)
  const GlyphIcon = glyphIconMap[glyph]
  return (
    <Animated.View entering={rowEntrance(index)}>
      <TouchableOpacity
        style={[styles.notifRow, !item.isRead && styles.notifUnread]}
        activeOpacity={0.7}
        onPress={() => onPress(item)}
        accessibilityRole="button"
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
