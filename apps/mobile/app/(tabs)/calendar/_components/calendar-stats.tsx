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
  const { fontScale } = useWindowDimensions()
  const isLoading = state === 'loading'
  return (
    <View testID="calendar-stats" accessibilityElementsHidden={isLoading || undefined}
      importantForAccessibility={isLoading ? 'no-hide-descendants' : undefined}
      style={[styles.row, fontScale > 1.3 ? styles.stacked : undefined]}>
      {stats.map((stat) => (
        <View key={stat.key} testID={`calendar-figure-${state}`} style={styles.figure}>
          {isLoading ? <View accessibilityRole="progressbar" accessibilityLabel={loadingLabel}><View style={[styles.skeleton, { backgroundColor: tokens.bgElev2 }]} /></View>
            : <Text style={[state === 'empty' ? styles.empty : styles.value, { color: state === 'empty' ? tokens.fg3 : tokens.fg1 }]}>{state === 'empty' ? emptyLabel : stat.value}</Text>}
          <Text style={[styles.label, { color: tokens.fg2 }]}>{stat.label}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: { width: 64, height: 24, borderRadius: 8 },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  stacked: { flexDirection: 'column' },
  figure: { flex: 1, minWidth: 0, minHeight: 88, paddingVertical: 16, gap: 4, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 22, lineHeight: 22 * 1.4, textAlign: 'center', fontVariant: ['tabular-nums'] },
  empty: { fontFamily: 'GeistMono_500Medium', fontSize: 12, lineHeight: 22 * 1.4, textAlign: 'center' },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
})
