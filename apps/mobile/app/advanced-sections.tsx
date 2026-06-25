import { View, Text, Pressable } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { CheckCircle, Clock, List, RotateCcw } from 'lucide-react-native'
import type { ApiKey } from '@orbit/shared/types'
import type { WidgetFeatureIconKey } from '@orbit/shared/utils/advanced-settings'
import { styles, type Tokens } from './advanced-styles'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

export function WidgetFeatureIcon({
  iconKey,
  color,
}: Readonly<{ iconKey: WidgetFeatureIconKey; color: string }>) {
  const iconProps = { size: 16, strokeWidth: 1.8, color }
  if (iconKey === 'checkCircle') return <CheckCircle {...iconProps} />
  if (iconKey === 'clock') return <Clock {...iconProps} />
  if (iconKey === 'list') return <List {...iconProps} />
  return <RotateCcw {...iconProps} />
}

/** Single-line message block (loading-empty / error / max-reached) used across
 *  the Orbit MCP developers section. */
export function QueryStateMessage({
  text,
  color,
}: Readonly<{ text: string; color: string }>) {
  return (
    <View style={styles.messageBlock}>
      <Text style={[styles.messageText, { color }]}>{text}</Text>
    </View>
  )
}

interface ApiKeyCardProps {
  apiKey: ApiKey
  index: number
  tokens: Tokens
  t: TranslationFn
  formatKeyDate: (dateStr: string) => string
  onRevoke: (id: string) => void
}

export function ApiKeyCard({
  apiKey,
  index,
  tokens,
  t,
  formatKeyDate,
  onRevoke,
}: Readonly<ApiKeyCardProps>) {
  const lastUsed = apiKey.lastUsedAtUtc
    ? `${t('orbitMcp.lastUsed')} ${formatKeyDate(apiKey.lastUsedAtUtc)}`
    : t('orbitMcp.never')
  const perm = apiKey.isReadOnly
    ? t('orbitMcp.permReadOnly')
    : t('orbitMcp.permReadWrite')
  const meta = `${perm} · ${lastUsed} · ${t('orbitMcp.created')} ${formatKeyDate(apiKey.createdAtUtc)}`
  return (
    <Animated.View
      entering={rowEntrance(index)}
      style={[
        styles.keyCard,
        {
          backgroundColor: tokens.bgCard,
          borderColor: tokens.hairline,
        },
      ]}
    >
      <View style={styles.keyTopRow}>
        <Text
          style={[styles.keyName, { color: tokens.fg1 }]}
          numberOfLines={1}
        >
          {apiKey.name}
        </Text>
        <Pressable
          onPress={() => onRevoke(apiKey.id)}
          accessibilityRole="button"
          accessibilityLabel={t('orbitMcp.revoke')}
          style={({ pressed }) => [
            styles.actionChip,
            {
              backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
              borderColor: tokens.hairline,
            },
            pressed ? styles.actionChipPressed : null,
          ]}
          hitSlop={8}
        >
          <Text
            style={[styles.revokeLink, { color: tokens.statusBad }]}
          >
            {t('orbitMcp.revoke')}
          </Text>
        </Pressable>
      </View>
      <Text
        style={[styles.keyPrefix, { color: tokens.fg2 }]}
      >
        {`${apiKey.keyPrefix}…`}
      </Text>
      <Text
        style={[styles.keyMeta, { color: tokens.fg3 }]}
        numberOfLines={2}
      >
        {meta}
      </Text>
    </Animated.View>
  )
}
