import { StyleSheet, Text, View } from 'react-native'
import type { FreezeBankProps } from '@orbit/shared/contracts/display'
import { Snowflake } from '@/components/ui/icons'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatTile } from '@/components/ui/stat-tile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function LegendMark({ state, tokens }: Readonly<{
  state: 'active' | 'frozen' | 'missed'
  tokens: ReturnType<typeof createTokensV2>
}>) {
  if (state === 'frozen') return <Snowflake size={16} strokeWidth={2} color={tokens.statusFrozen} />
  const style = state === 'active'
    ? { backgroundColor: tokens.fg1 }
    : { borderWidth: 1, borderColor: tokens.statusEmpty }
  return <View style={[styles.legendMark, style]} />
}

export function FreezeBank(props: Readonly<FreezeBankProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const atCeiling = props.banked >= props.ceiling

  return (
    <View testID="freeze-bank" style={styles.root}>
      <View accessibilityLabel={props.words.legendLabel} style={styles.legend}>
        {(['active', 'frozen', 'missed'] as const).map((state) => (
          <View key={state} style={styles.legendItem}>
            <LegendMark state={state} tokens={tokens} />
            <Text style={[styles.meta, { color: tokens.fg3 }]}>{props.words[state]}</Text>
          </View>
        ))}
      </View>
      <View style={styles.figureRow}>
        <View style={styles.figureBlock}><StatTile value={props.longestValue} label={props.longestLabel} /></View>
        <View style={styles.figureBlock}><StatTile value={props.tierValue} label={props.tierLabel} /></View>
      </View>
      <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}>
        <View style={styles.figureRow}>
          <View style={styles.figureBlock}>
            <Text style={[styles.figure, { color: tokens.fg1 }]}>{props.banked} <Text style={[styles.denominator, { color: tokens.fg3 }]}>/ {props.ceiling}</Text></Text>
            <Text style={[styles.meta, { color: tokens.fg3 }]}>{props.words.bankedLabel}</Text>
          </View>
          <View style={styles.figureBlock}>
            <Text style={[styles.figure, { color: tokens.fg1 }]}>{props.usedThisMonth}</Text>
            <Text style={[styles.meta, { color: tokens.fg3 }]}>{props.words.usedLabel}</Text>
          </View>
        </View>
        {!atCeiling ? (
          <View style={styles.copy}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: tokens.fg2 }]}>{props.words.nextLabel}</Text>
              <Text style={[styles.meta, { color: tokens.fg3 }]}>{props.words.nextFreezeProgress}</Text>
            </View>
            <ProgressBar value={props.daysTowardNext} max={props.earnRateDays} label={props.words.nextProgressLabel} />
          </View>
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.protectedTitle, { color: tokens.fg2 }]}>{props.words.protectedLabel}</Text>
        {props.protectedDays.length === 0 ? <Text style={[styles.denominator, { color: tokens.fg3 }]}>{props.words.protectedEmpty}</Text> : props.protectedDays.map((day) => (
          <View key={day.id} style={styles.protectedRow}>
            <Snowflake size={16} strokeWidth={2} color={tokens.statusFrozen} />
            <Text style={[styles.protectedDate, { color: tokens.fg2 }]}>{day.dateLabel}</Text>
            <Text style={[styles.meta, { color: tokens.fg3 }]}>{day.isToday ? props.words.protectedToday : props.words.protectedDay}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  legendMark: { borderRadius: 8, height: 12, width: 12 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16 },
  card: { borderRadius: 20, borderWidth: 1, gap: 12, padding: 16 },
  figureRow: { flexDirection: 'row', gap: 12 },
  figureBlock: { flex: 1, minWidth: 0, gap: 4 },
  figure: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, fontVariant: ['tabular-nums'], lineHeight: 28 },
  denominator: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  copy: { gap: 4 },
  progressHeader: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  progressLabel: { flexGrow: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  protectedTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
  protectedRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 28 },
  protectedDate: { flex: 1, fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'], lineHeight: 16 },
})
