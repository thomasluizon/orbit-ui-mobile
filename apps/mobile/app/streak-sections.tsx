import React, { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { CalendarDays, Snowflake } from 'lucide-react-native'
import { getStreakTierLabelKey } from '@orbit/shared/utils'
import { createTokensV2, primaryGlow, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { SectionLabel } from '@/components/ui/section-label'
import { StatTile } from '@/components/ui/stat-tile'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatusDot } from '@/components/ui/status-dot'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

export type StreakDayView = {
  dateStr: string
  dayLabel: string
  dayNum: string
  status: 'active' | 'frozen' | 'missed' | 'today' | 'future'
}

function useTokens(): AppTokensV2 {
  const { currentScheme, currentTheme } = useAppTheme()
  return useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
}

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function isInRun(status: StreakDayView['status']): boolean {
  return status === 'active' || status === 'frozen'
}

interface StreakStatsRowProps {
  t: TranslationFn
  streak: number
  longestStreak: number
}

/** Kit StatTile row for the streak detail: current, longest, and tier. */
export function StreakStatsRow({
  t,
  streak,
  longestStreak,
}: Readonly<StreakStatsRowProps>) {
  return (
    <View>
      <SectionLabel>{t('streakDisplay.detail.stats')}</SectionLabel>
      <View style={styles.statsRow}>
        <StatTile
          emoji="🔥"
          value={streak}
          label={t('streakDisplay.detail.currentStreak')}
        />
        <StatTile
          emoji="🏆"
          value={longestStreak}
          label={t('streakDisplay.detail.longestStreak')}
        />
        <StatTile
          emoji="🎖️"
          value={t(getStreakTierLabelKey(streak))}
          label={t('streakDisplay.detail.tierTileLabel')}
          phraseValue
        />
      </View>
    </View>
  )
}

interface StreakTimelineCardProps {
  t: TranslationFn
  weekDays: StreakDayView[]
}

/** Week strip in the streak-calendar language: weekday header, amber run band,
 *  cyan freeze teardrops, primary today ring, and the status legend. */
export function StreakTimelineCard({
  t,
  weekDays,
}: Readonly<StreakTimelineCardProps>) {
  const tokens = useTokens()

  return (
    <View>
      <SectionLabel>{t('streakDisplay.detail.thisWeek')}</SectionLabel>
      <View style={styles.groupWrap}>
        <View
          style={[
            styles.weekCard,
            { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
          ]}
        >
          <View style={styles.weekHeaderRow}>
            {weekDays.map((day) => (
              <Text
                key={day.dateStr}
                style={[styles.weekHeaderLabel, { color: tokens.fg4 }]}
              >
                {day.dayLabel.toUpperCase()}
              </Text>
            ))}
          </View>
          <View style={styles.weekCellsRow}>
            {weekDays.map((day, index) => (
              <StreakDayCell
                key={day.dateStr}
                day={day}
                tokens={tokens}
                runStart={isInRun(day.status) && (index === 0 || !isInRun(weekDays[index - 1]!.status))}
                runEnd={isInRun(day.status) && (index === weekDays.length - 1 || !isInRun(weekDays[index + 1]!.status))}
              />
            ))}
          </View>
          <View style={styles.legendRow}>
            <LegendItem
              tokens={tokens}
              label={t('streakDisplay.detail.dayActive')}
              swatch={
                <View
                  style={[styles.legendDot, { backgroundColor: tokens.statusOverdue }]}
                />
              }
            />
            <LegendItem
              tokens={tokens}
              label={t('streakDisplay.detail.dayFrozen')}
              swatch={
                <View
                  style={[styles.legendDot, { backgroundColor: tokens.statusFrozen }]}
                />
              }
            />
            <LegendItem
              tokens={tokens}
              label={t('streakDisplay.detail.dayMissed')}
              swatch={
                <View
                  style={[styles.legendDotHollow, { borderColor: tokens.statusEmpty }]}
                />
              }
            />
          </View>
        </View>
      </View>
    </View>
  )
}

interface StreakDayCellProps {
  day: StreakDayView
  tokens: AppTokensV2
  runStart: boolean
  runEnd: boolean
}

function StreakDayCell({
  day,
  tokens,
  runStart,
  runEnd,
}: Readonly<StreakDayCellProps>) {
  const inRun = isInRun(day.status)

  let numeralColor = tokens.fg4
  if (day.status === 'active' || day.status === 'frozen' || day.status === 'today') {
    numeralColor = tokens.fg1
  }

  return (
    <View style={styles.dayCell}>
      {inRun ? (
        <View
          style={[
            styles.runBand,
            {
              backgroundColor: rgbaFromHex(tokens.statusOverdue, 0.16),
              left: runStart ? 5 : 0,
              right: runEnd ? 5 : 0,
              borderTopLeftRadius: runStart ? 999 : 0,
              borderBottomLeftRadius: runStart ? 999 : 0,
              borderTopRightRadius: runEnd ? 999 : 0,
              borderBottomRightRadius: runEnd ? 999 : 0,
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.dayDisc,
          day.status === 'today'
            ? { borderWidth: 1.5, borderColor: tokens.primary }
            : null,
        ]}
      >
        <Text
          style={[
            day.status === 'today' ? styles.dayNumeralToday : styles.dayNumeral,
            { color: numeralColor },
          ]}
        >
          {day.dayNum}
        </Text>
      </View>
      {day.status === 'frozen' ? (
        <View
          style={[styles.freezeDrop, { backgroundColor: tokens.statusFrozen }]}
        >
          <View style={styles.freezeDropIcon}>
            <Snowflake size={10} strokeWidth={2.2} color={tokens.bg} />
          </View>
        </View>
      ) : null}
    </View>
  )
}

function LegendItem({
  tokens,
  label,
  swatch,
}: Readonly<{ tokens: AppTokensV2; label: string; swatch: ReactNode }>) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={[styles.legendLabel, { color: tokens.fg3 }]}>{label}</Text>
    </View>
  )
}

function CardGroup({ children }: Readonly<{ children: ReactNode }>) {
  const tokens = useTokens()
  const rows = React.Children.toArray(children).filter(Boolean)

  return (
    <View
      style={[
        styles.cardGroup,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
      ]}
    >
      {rows.map((row, index) => (
        <View key={index} collapsable={false}>
          {index > 0 ? (
            <View style={[styles.cardDivider, { backgroundColor: tokens.hairline }]} />
          ) : null}
          {row}
        </View>
      ))}
    </View>
  )
}

function CardRow({
  icon,
  label,
  trailing,
}: Readonly<{ icon?: ReactNode; label: string; trailing?: ReactNode }>) {
  const tokens = useTokens()

  return (
    <View style={styles.cardRow}>
      <View style={styles.cardRowLead}>
        {icon ? <View style={styles.cardRowIcon}>{icon}</View> : null}
        <Text
          style={[styles.cardRowLabel, { color: tokens.fg1 }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <View style={styles.cardRowTrailing}>{trailing}</View>
    </View>
  )
}

function StatValue({ value }: Readonly<{ value: number | string }>) {
  const tokens = useTokens()
  return (
    <Text style={[styles.statValue, { color: tokens.fg2 }]}>{value}</Text>
  )
}

const STREAK_DAYS_PER_FREEZE = 7

interface FreezeProgressCardProps {
  t: TranslationFn
  isPro: boolean
  streak: number
  streakFreezesAccumulated: number
  maxStreakFreezesAccumulated: number
  freezesUsedThisMonth: number
  maxFreezesPerMonth: number
  isFrozenToday: boolean
  protectedDates: string[]
  onUpgrade: () => void
  displayDate: (value: string, options?: Intl.DateTimeFormatOptions) => string
}

/**
 * Auto-freeze status in the artboard card language: one card with the banked
 * gauge, monthly usage, and progress toward the next freeze, then the
 * protected-days list. Free users see a violet-tinted Pro gate card instead.
 */
export function FreezeProgressCard({
  t,
  isPro,
  streak,
  streakFreezesAccumulated,
  maxStreakFreezesAccumulated,
  freezesUsedThisMonth,
  maxFreezesPerMonth,
  isFrozenToday,
  protectedDates,
  onUpgrade,
  displayDate,
}: Readonly<FreezeProgressCardProps>) {
  const tokens = useTokens()
  const isBankedFull = streakFreezesAccumulated >= maxStreakFreezesAccumulated
  const nextFreezeDays = STREAK_DAYS_PER_FREEZE - (streak % STREAK_DAYS_PER_FREEZE)
  const nextFreezeProgress = isBankedFull
    ? 1
    : (STREAK_DAYS_PER_FREEZE - nextFreezeDays) / STREAK_DAYS_PER_FREEZE
  const dates = protectedDates.slice(0, 5)

  return (
    <View>
      <SectionLabel>{t('streakDisplay.freeze.title')}</SectionLabel>

      {isPro ? (
        <>
          <View style={styles.groupWrap}>
            <Text style={[styles.explainer, { color: tokens.fg3 }]}>
              {t('streakDisplay.freeze.auto.explainer')}
            </Text>
            <View
              style={[
                styles.freezeCard,
                { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
              ]}
            >
              <View style={styles.freezeRow}>
                <View style={styles.cardRowLead}>
                  <View style={styles.cardRowIcon}>
                    <Snowflake size={20} strokeWidth={1.8} color={tokens.statusFrozen} />
                  </View>
                  <Text
                    style={[styles.cardRowLabel, { color: tokens.fg1 }]}
                    numberOfLines={1}
                  >
                    {t('streakDisplay.freeze.banked.label')}
                  </Text>
                </View>
                <View style={styles.gaugeTrailing}>
                  <ChargeGauge
                    banked={streakFreezesAccumulated}
                    max={maxStreakFreezesAccumulated}
                    tokens={tokens}
                  />
                  <StatValue
                    value={`${streakFreezesAccumulated}/${maxStreakFreezesAccumulated}`}
                  />
                </View>
              </View>

              <View style={styles.freezeRow}>
                <View style={styles.cardRowLead}>
                  <View style={styles.cardRowIcon}>
                    <CalendarDays size={20} strokeWidth={1.8} color={tokens.fg3} />
                  </View>
                  <Text
                    style={[styles.cardRowLabel, { color: tokens.fg1 }]}
                    numberOfLines={1}
                  >
                    {t('streakDisplay.freeze.usedThisMonth.label')}
                  </Text>
                </View>
                <StatValue value={`${freezesUsedThisMonth}/${maxFreezesPerMonth}`} />
              </View>

              <View style={styles.nextFreezeBlock}>
                <View style={styles.freezeRow}>
                  <Text
                    style={[styles.cardRowLabel, { color: tokens.fg1 }]}
                    numberOfLines={1}
                  >
                    {t('streakDisplay.freeze.nextFreeze.label')}
                  </Text>
                  <StatValue
                    value={
                      isBankedFull
                        ? t('streakDisplay.freeze.nextFreeze.full')
                        : t('streakDisplay.freeze.nextFreeze.inDays', {
                            days: nextFreezeDays,
                          })
                    }
                  />
                </View>
                <ProgressBar
                  progress={nextFreezeProgress}
                  label={t('streakDisplay.freeze.nextFreeze.label')}
                  color={tokens.statusFrozen}
                />
              </View>
            </View>
          </View>

          <SectionLabel>{t('streakDisplay.freeze.protected.label')}</SectionLabel>
          <View style={[styles.groupWrap, styles.sectionBottomPad]}>
            {isFrozenToday || dates.length > 0 ? (
              <CardGroup>
                {isFrozenToday ? (
                  <CardRow
                    icon={<StatusDot state="frozen" size={8} />}
                    label={t('streakDisplay.freeze.protected.today')}
                    trailing={
                      <StatValue
                        value={t('streakDisplay.freeze.protected.todayValue')}
                      />
                    }
                  />
                ) : null}
                {dates.map((date) => (
                  <CardRow
                    key={date}
                    icon={<StatusDot state="frozen" size={8} />}
                    label={displayDate(date, { month: 'short', day: 'numeric' })}
                  />
                ))}
              </CardGroup>
            ) : (
              <Text style={[styles.emptyText, { color: tokens.fg3 }]}>
                {t('streakDisplay.freeze.protected.empty')}
              </Text>
            )}
          </View>
        </>
      ) : (
        <View style={[styles.groupWrap, styles.sectionBottomPad]}>
          <View
            style={[
              styles.proGateCard,
              {
                backgroundColor: `rgba(${tokens.primaryRgb}, 0.08)`,
                borderColor: `rgba(${tokens.primaryRgb}, 0.28)`,
              },
            ]}
          >
            <Snowflake size={24} strokeWidth={1.9} color={tokens.statusFrozen} />
            <Text style={[styles.proGateCopy, { color: tokens.fg1 }]}>
              {t('streakDisplay.freeze.pro.gate')}
            </Text>
            <Pressable
              onPress={onUpgrade}
              accessibilityRole="button"
              accessibilityLabel={t('common.upgrade')}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.proGatePill,
                primaryGlow(tokens),
                {
                  backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Text style={[styles.proGatePillLabel, { color: tokens.fgOnPrimary }]}>
                {t('common.upgrade')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

interface ChargeGaugeProps {
  banked: number
  max: number
  tokens: AppTokensV2
}

function ChargeGauge({ banked, max, tokens }: Readonly<ChargeGaugeProps>) {
  return (
    <View style={styles.gauge}>
      {Array.from({ length: max }, (_, index) => (
        <ChargePip
          key={index}
          filled={index < banked}
          delay={index * 40}
          tokens={tokens}
        />
      ))}
    </View>
  )
}

interface ChargePipProps {
  filled: boolean
  delay: number
  tokens: AppTokensV2
}

function ChargePip({ filled, delay, tokens }: Readonly<ChargePipProps>) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      delay,
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [progress, delay])

  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: filled ? tokens.statusFrozen : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: filled ? 'transparent' : tokens.hairline,
        opacity: progress,
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.6, 1],
            }),
          },
        ],
      }}
    />
  )
}

const styles = StyleSheet.create({
  groupWrap: {
    paddingHorizontal: 20,
  },
  sectionBottomPad: {
    paddingBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
  },
  weekCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekHeaderLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Roboto_500Medium',
    fontSize: 11,
    letterSpacing: 0.44,
    fontVariant: ['tabular-nums'],
  },
  weekCellsRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runBand: {
    position: 'absolute',
    top: 7,
    bottom: 7,
  },
  dayDisc: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumeral: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  dayNumeralToday: {
    fontFamily: 'Roboto_700Bold',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  freezeDrop: {
    position: 'absolute',
    top: 1,
    width: 17,
    height: 17,
    borderTopLeftRadius: 8.5,
    borderTopRightRadius: 8.5,
    borderBottomRightRadius: 8.5,
    borderBottomLeftRadius: 0,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  freezeDropIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    paddingTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendDotHollow: {
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  legendLabel: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    letterSpacing: 0.44,
  },
  cardGroup: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    minHeight: 52,
  },
  cardRowLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  cardRowIcon: {
    width: 22,
    alignItems: 'center',
    flexShrink: 0,
  },
  cardRowLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    flexShrink: 1,
  },
  cardRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  statValue: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  explainer: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  freezeCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 16,
  },
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nextFreezeBlock: {
    gap: 10,
  },
  gaugeTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gauge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  proGateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  proGateCopy: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    lineHeight: 22,
  },
  proGatePill: {
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    flexShrink: 0,
  },
  proGatePillLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  emptyText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
})
