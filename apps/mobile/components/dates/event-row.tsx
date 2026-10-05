import { PersonalText } from '@/components/ui/personal-text'
import type { EventRowProps } from '@orbit/shared/contracts/dates'
import { StyleSheet, View } from 'react-native'
import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function EventRow(props: Readonly<EventRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const timeLabel = props.time ?? props.allDayLabel
  const accessibleLabel = [timeLabel, props.title, props.source].filter(Boolean).join(', ')
  const content = <>
    <PersonalText style={[styles.title, { color: tokens.fg1 }]}>{props.title}</PersonalText>
    <PersonalText style={[styles.support, { color: props.onClick ? tokens.fg2 : tokens.fg3 }]}>{[timeLabel, props.source].filter(Boolean).join(' · ')}</PersonalText>
  </>
  return props.onClick ? <Pressable
    accessibilityRole="button" accessibilityLabel={accessibleLabel} onPress={props.onClick}
    testID={props.time ? 'event-row-timed' : 'event-row-all-day'}
    style={({ pressed }) => [styles.row, styles.interactive, pressed ? { backgroundColor: tokens.bgHover } : null]}
  >{content}</Pressable> : <View accessibilityRole="image" accessibilityLabel={accessibleLabel}
    testID={props.time ? 'event-row-timed' : 'event-row-all-day'} style={styles.row}
  >{content}</View>
}

const styles = StyleSheet.create({
  row: { minHeight: 68, minWidth: 0, justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 12, overflow: 'hidden' },
  interactive: { paddingHorizontal: 8, },
  title: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 22.4 },
  support: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, fontVariant: ['tabular-nums'] },
})
