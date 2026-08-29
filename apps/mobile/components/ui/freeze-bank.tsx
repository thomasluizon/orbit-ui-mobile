import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { FreezeBankProps } from '@orbit/shared/contracts/display'
import { ChevronDown, Snowflake } from '@/components/ui/icons'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatTile } from '@/components/ui/stat-tile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function LegendMark({
  state,
  tokens,
}: Readonly<{
  state: 'active' | 'frozen' | 'missed' | 'today'
  tokens: ReturnType<typeof createTokensV2>
}>) {
  if (state === 'frozen') {
    return <Snowflake size={16} strokeWidth={2} color={tokens.fg2} />
  }

  return (
    <View
      style={[
        styles.legendMark,
        state === 'active' ? { backgroundColor: tokens.fg1 } : null,
        state === 'missed' ? { borderColor: tokens.hairlineStrong, borderWidth: 1 } : null,
        state === 'today' ? { borderColor: tokens.primary, borderWidth: 2 } : null,
      ]}
    />
  )
}

export function FreezeBank(props: Readonly<FreezeBankProps>) {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const atCeiling = props.banked >= props.ceiling
  const protectedEmpty = props.protectedDays.length === 0

  return (
    <View
      testID="freeze-bank"
      accessibilityLabel={props.words.legendLabel}
      style={styles.root}
    >
      <View style={styles.legend}>
        {(['active', 'frozen', 'missed', 'today'] as const).map((state) => (
          <View key={state} style={styles.legendItem}>
            <LegendMark state={state} tokens={tokens} />
            <Text style={[styles.meta, { color: tokens.fg3 }]}>{props.words[state]}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID="freeze-bank-disclosure"
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.disclosure,
          { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgField, borderColor: tokens.hairline },
        ]}
      >
        <Text style={[styles.disclosureLabel, { color: tokens.fg2 }]}>
          {expanded ? props.words.disclosureExpanded : props.words.disclosureCollapsed}
        </Text>
        <View style={expanded ? styles.chevronExpanded : null}>
          <ChevronDown size={20} strokeWidth={2} color={tokens.fg2} />
        </View>
      </Pressable>

      {expanded ? (
        <View testID="freeze-bank-details" style={styles.details}>
          <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
            <View style={styles.figureRow}>
              <View style={styles.figureBlock}>
                <Text style={[styles.figure, { color: tokens.fg1 }]}>
                  {props.banked} <Text style={[styles.denominator, { color: tokens.fg3 }]}>/ {props.ceiling}</Text>
                </Text>
                <Text style={[styles.meta, { color: tokens.fg3 }]}>{props.words.bankedLabel}</Text>
              </View>
              <View style={styles.figureBlock}>
                <Text style={[styles.figure, { color: tokens.fg1 }]}>
                  {props.usedThisMonth}{' '}
                  <Text style={[styles.denominator, { color: tokens.fg3 }]}>/ {props.monthlyUseCeiling}</Text>
                </Text>
                <Text style={[styles.meta, { color: tokens.fg3 }]}>{props.words.usedLabel}</Text>
              </View>
            </View>
            <View style={styles.progressBlock}>
              <View style={styles.progressHeader}>
                <Text style={[styles.progressLabel, { color: tokens.fg2 }]}>{props.words.nextLabel}</Text>
                <Text style={[styles.meta, { color: tokens.fg3 }]}>
                  {atCeiling ? props.words.capacityMessage : props.words.nextFreezeInDays}
                </Text>
              </View>
              <ProgressBar
                value={atCeiling ? 0 : props.daysTowardNext}
                max={props.earnRateDays}
                label={props.words.nextProgressLabel}
              />
            </View>
          </View>

          <StatTile value={props.tierValue} label={props.tierLabel} />

          <View style={styles.protectedBlock}>
            <Text style={[styles.protectedTitle, { color: tokens.fg2 }]}>{props.words.protectedLabel}</Text>
            {protectedEmpty ? (
              <Text style={[styles.progressLabel, { color: tokens.fg3 }]}>{props.words.protectedEmpty}</Text>
            ) : (
              props.protectedDays.map((day) => (
                <View key={day.id} style={styles.protectedRow}>
                  <Snowflake size={16} strokeWidth={2} color={tokens.fg2} />
                  <Text style={[styles.protectedDate, { color: tokens.fg2 }]}>{day.dateLabel}</Text>
                  <Text style={[styles.meta, { color: tokens.fg3 }]}>
                    {day.isToday ? props.words.protectedToday : props.words.protectedDay}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  legendMark: { borderRadius: 8, height: 16, width: 16 },
  meta: { fontFamily: 'RobotoMono_400Regular', fontSize: 12, lineHeight: 16 },
  disclosure: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  disclosureLabel: { flex: 1, fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  details: { gap: 16 },
  card: { borderRadius: 20, borderWidth: 1, gap: 12, padding: 16 },
  figureRow: { flexDirection: 'row', gap: 12 },
  figureBlock: { flex: 1, gap: 4 },
  figure: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    lineHeight: 28,
  },
  denominator: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  progressBlock: { gap: 4 },
  progressHeader: { alignItems: 'baseline', flexDirection: 'row', gap: 12 },
  progressLabel: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  protectedBlock: { gap: 4 },
  protectedTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
  protectedRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 44 },
  protectedDate: {
    flex: 1,
    fontFamily: 'RobotoMono_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    lineHeight: 16,
  },
})
