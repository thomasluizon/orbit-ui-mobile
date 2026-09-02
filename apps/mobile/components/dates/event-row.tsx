import type { EventRowProps } from '@orbit/shared/contracts/dates'
import { StyleSheet, Text, View } from 'react-native'
import { CalendarDays } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function EventRow(props: Readonly<EventRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const timeLabel = props.time ?? props.allDayLabel
  const accessibleLabel = [timeLabel, props.title, props.source].filter(Boolean).join(', ')
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibleLabel}
      accessibilityState={{ disabled: true }}
      testID={props.time ? 'event-row-timed' : 'event-row-all-day'}
      style={[styles.row, { backgroundColor: tokens.bgWell }]}
    >
      <CalendarDays size={20} strokeWidth={1.5} color={tokens.fg3} />
      <Text style={[styles.time, { color: tokens.fg2 }]}>{timeLabel}</Text>
      <View style={styles.content}>
        <Text style={[styles.title, { color: tokens.fg2 }]} numberOfLines={1}>{props.title}</Text>
        {props.source ? <Text style={[styles.source, { color: tokens.fg3 }]} numberOfLines={1}>{props.source}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  time: { flexShrink: 0, fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
  content: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Rubik_400Regular', fontSize: 16 },
  source: { fontFamily: 'Rubik_400Regular', fontSize: 12 },
})
