import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import type { createTokensV2 } from '@/lib/theme'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'

type Tokens = ReturnType<typeof createTokensV2>
type TranslationFn = (key: string, params?: Record<string, unknown>) => string

export type StreakDayView = {
  dateStr: string
  dayLabel: string
  dayNum: string
  status: 'active' | 'frozen' | 'missed' | 'today' | 'future'
}

interface StreakWeekTimelineProps {
  weekDays: StreakDayView[]
  tokens: Tokens
}

/** 7-column day grid with inline legend below: dot/glyph by status. */
export function StreakWeekTimeline({
  weekDays,
  tokens,
  legend,
}: Readonly<StreakWeekTimelineProps & { legend?: { active: string; frozen: string; missed: string } }>) {
  return (
    <>
      <View style={styles.weekGrid}>
        {weekDays.map((day) => {
          const isEmphasized = day.status === 'today' || day.status === 'frozen'
          return (
            <View key={day.dateStr} style={styles.weekDayCol}>
              <Text
                style={[
                  styles.weekDayLabel,
                  { color: isEmphasized ? tokens.fg1 : tokens.fg3 },
                ]}
              >
                {`${day.dayLabel} ${day.dayNum}`}
              </Text>
              {day.status === 'active' ? (
                <View style={[styles.dot, { backgroundColor: tokens.fg1 }]} />
              ) : null}
              {day.status === 'today' ? (
                <View
                  style={[styles.dot, { backgroundColor: tokens.primary }]}
                />
              ) : null}
              {day.status === 'frozen' ? (
                <Svg width={9} height={9} viewBox="0 0 10 10" fill="none">
                  <Circle
                    cx={5}
                    cy={5}
                    r={4}
                    stroke={tokens.statusFrozen}
                    strokeWidth={1.2}
                  />
                  <Line
                    x1={5}
                    y1={2}
                    x2={5}
                    y2={8}
                    stroke={tokens.statusFrozen}
                    strokeWidth={1.2}
                  />
                  <Line
                    x1={2}
                    y1={5}
                    x2={8}
                    y2={5}
                    stroke={tokens.statusFrozen}
                    strokeWidth={1.2}
                  />
                </Svg>
              ) : null}
              {day.status === 'missed' ? (
                <View
                  style={[
                    styles.dotHollow,
                    { borderColor: tokens.statusEmpty },
                  ]}
                />
              ) : null}
              {day.status === 'future' ? (
                <View style={styles.dotSpace} />
              ) : null}
            </View>
          )
        })}
      </View>
      {legend ? (
        <View style={styles.legendRow}>
          <LegendItem
            label={legend.active}
            color={tokens.fg2}
            dot={<View style={[styles.legendDot, { backgroundColor: tokens.fg1 }]} />}
          />
          <LegendItem
            label={legend.frozen}
            color={tokens.fg2}
            dot={
              <View
                style={[
                  styles.legendDotHollow,
                  { borderColor: tokens.statusFrozen },
                ]}
              />
            }
          />
          <LegendItem
            label={legend.missed}
            color={tokens.fg2}
            dot={
              <View
                style={[
                  styles.legendDotHollow,
                  { borderColor: tokens.statusEmpty },
                ]}
              />
            }
          />
        </View>
      ) : null}
    </>
  )
}

function LegendItem({
  label,
  color,
  dot,
}: Readonly<{ label: string; color: string; dot: React.ReactNode }>) {
  return (
    <View style={styles.legendItem}>
      {dot}
      <Text style={[styles.legendLabel, { color }]}>{label}</Text>
    </View>
  )
}

interface FreezeSectionProps {
  t: TranslationFn
  tokens: Tokens
  streak: number
  freezesUsedThisMonth: number
  maxFreezesPerMonth: number
  streakFreezesAccumulated: number
  maxStreakFreezesAccumulated: number
  daysUntilNextFreeze: number
  isFrozenToday: boolean
  hasCompletedToday: boolean
  canFreeze: boolean
  canEarnMore: boolean
  hasReachedMonthlyLimit: boolean
  freezeSuccess: boolean
  errorMessage: string | null
  onActivateFreeze: () => void
}

/**
 * Freeze section: hairline rows for Available / This month / progress.
 * - When monthly limit is reached: shows "Available: 0" + italic limit message.
 * - Otherwise: shows count + inline "Use" link (if `canFreeze`) + usage row.
 */
export function FreezeSection({
  t,
  tokens,
  streak,
  freezesUsedThisMonth,
  maxFreezesPerMonth,
  streakFreezesAccumulated,
  maxStreakFreezesAccumulated,
  daysUntilNextFreeze,
  isFrozenToday,
  hasCompletedToday,
  canFreeze,
  canEarnMore,
  hasReachedMonthlyLimit,
  freezeSuccess,
  errorMessage,
  onActivateFreeze,
}: Readonly<FreezeSectionProps>) {
  const showActiveToday = isFrozenToday
  const progressLabel =
    daysUntilNextFreeze === 0
      ? t('streakDisplay.freeze.progressReady')
      : t('streakDisplay.freeze.progressSubtitle', {
          days: daysUntilNextFreeze,
          count: daysUntilNextFreeze,
        })

  const helperText = (() => {
    if (hasReachedMonthlyLimit) {
      return t('streakDisplay.freeze.monthlyLimit', { max: maxFreezesPerMonth })
    }
    if (!canEarnMore) {
      return t('streakDisplay.freeze.maxAccumulated', {
        max: maxStreakFreezesAccumulated,
      })
    }
    return progressLabel
  })()

  return (
    <>
      <View style={styles.groupWrap}>
        <SettingsGroup>
          {hasReachedMonthlyLimit ? (
            <SettingsGroupRow
              label={t('streakDisplay.freeze.accumulatedLabel')}
              accessory="none"
              trailing={
                <Text style={[styles.freezeCount, { color: tokens.fg3 }]}>0</Text>
              }
            />
          ) : (
            <>
              <SettingsGroupRow
                label={t('streakDisplay.freeze.accumulatedLabel')}
                accessory="none"
                trailing={
                  <>
                    <Text
                      style={[styles.freezeCount, { color: tokens.fg1 }]}
                    >
                      {streakFreezesAccumulated}
                    </Text>
                    {streak > 0 && !isFrozenToday && canFreeze ? (
                      <Pressable
                        onPress={onActivateFreeze}
                        accessibilityRole="button"
                        accessibilityLabel={t('streakDisplay.freeze.activate')}
                        style={styles.useLinkPress}
                      >
                        <Text style={[styles.useLink, { color: tokens.fg1 }]}>
                          {t('streakDisplay.freeze.activate')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                }
              />
              <SettingsGroupRow
                label={t('streakDisplay.freeze.monthlyUsageLabel')}
                accessory="none"
                trailing={
                  <Text style={[styles.freezeCount, { color: tokens.fg3 }]}>
                    {t('streakDisplay.freeze.monthlyUsage', {
                      used: freezesUsedThisMonth,
                      max: maxFreezesPerMonth,
                    })}
                  </Text>
                }
              />
            </>
          )}
        </SettingsGroup>
      </View>

      <View style={styles.helperBlock}>
        <Text style={[styles.italicText, { color: tokens.fg3 }]}>
          {helperText}
        </Text>
        {showActiveToday ? (
          <Text style={[styles.italicText, { color: tokens.statusFrozen }]}>
            {t('streakDisplay.freeze.activeToday')}
          </Text>
        ) : null}
        {hasCompletedToday && !isFrozenToday && streak > 0 ? (
          <Text style={[styles.italicText, { color: tokens.statusDone }]}>
            {t('streakDisplay.freeze.completedToday')}
          </Text>
        ) : null}
        {freezeSuccess ? (
          <Text style={[styles.italicText, { color: tokens.statusFrozen }]}>
            {t('streakDisplay.freeze.success')}
          </Text>
        ) : null}
        {errorMessage ? (
          <Text style={[styles.italicText, { color: tokens.statusBad }]}>
            {errorMessage}
          </Text>
        ) : null}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  weekGrid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 6,
  },
  weekDayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  weekDayLabel: {
    fontFamily: 'GeistMono',
    fontSize: 11,
    fontWeight: '500',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  dotHollow: {
    width: 7,
    height: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  dotSpace: {
    width: 7,
    height: 7,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  legendDotHollow: {
    width: 6,
    height: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  legendLabel: {
    fontFamily: 'Geist',
    fontSize: 12,
  },
  groupWrap: {
    paddingHorizontal: 20,
  },
  helperBlock: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 6,
  },
  italicText: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontStyle: 'italic',
  },
  freezeCount: {
    fontFamily: 'GeistMono',
    fontSize: 14,
    fontWeight: '600',
  },
  useLinkPress: {
    marginLeft: 4,
  },
  useLink: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
})
