import { useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export interface CalendarStat {
  key: string;
  value: string | number;
  label: string;
}

interface CalendarStatsProps {
  stats: readonly [CalendarStat, CalendarStat, CalendarStat];
  state?: 'default' | 'loading' | 'empty';
  loadingLabel?: string;
  emptyLabel?: string;
}

export function CalendarStats({ stats, state = 'default', loadingLabel, emptyLabel }: Readonly<CalendarStatsProps>) {
  const theme = useAppTheme()
  const tokens = createTokensV2(theme.currentScheme, theme.currentTheme)
  const { width, fontScale } = useWindowDimensions()
  const [groupWidth, setGroupWidth] = useState(width)
  const stacked = groupWidth - 32 < 20 * 14 * fontScale || fontScale > 1.3
  const isLoading = state === 'loading'
  return (
    <View testID="calendar-stats" accessibilityElementsHidden={isLoading || undefined}
      importantForAccessibility={isLoading ? 'no-hide-descendants' : undefined}
      onLayout={(event) => setGroupWidth(event.nativeEvent.layout.width)}
      style={[styles.row, stacked ? styles.stacked : undefined]}>
      {stats.map((stat) => (
        <View key={stat.key} testID={`calendar-figure-${state}`} style={styles.figure}>
          {isLoading ? <View accessibilityRole="progressbar" accessibilityLabel={loadingLabel} style={styles.loadingValue}>
            <Text accessibilityElementsHidden style={[styles.value, { opacity: 0 }]}>0</Text><View style={[styles.skeleton, { position: 'absolute', backgroundColor: tokens.bgElev2 }]} />
          </View>
            : <Text style={[state === 'empty' ? styles.empty : styles.value, { color: state === 'empty' ? tokens.fg3 : tokens.fg1 }]}>{state === 'empty' ? emptyLabel : stat.value}</Text>}
          <Text style={[styles.label, { color: tokens.fg2 }]}>{stat.label}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  loadingValue: { minWidth: 64, alignItems: 'flex-start', justifyContent: 'center' },
  skeleton: { width: 64, height: 24, borderRadius: 8 },
  row: { flexDirection: 'row', gap: 16, paddingHorizontal: 16 },
  stacked: { flexDirection: 'column' },
  figure: { flex: 1, minWidth: 0, gap: 8, alignItems: 'flex-start' },
  value: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 22, lineHeight: 22 * 1.4, textAlign: 'left', fontVariant: ['tabular-nums'] },
  empty: { fontFamily: 'GeistMono_500Medium', fontSize: 12, lineHeight: 22 * 1.4, textAlign: 'left' },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'left' },
})
