import { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import type { createTokensV2 } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { StatusDot } from '@/components/ui/status-dot'

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

const STREAK_DAYS_PER_FREEZE = 7

interface FreezeSectionProps {
  t: TranslationFn
  tokens: Tokens
  isPro: boolean
  streak: number
  freezesUsedThisMonth: number
  maxFreezesPerMonth: number
  streakFreezesAccumulated: number
  maxStreakFreezesAccumulated: number
  isFrozenToday: boolean
  protectedDates: string[]
  onUpgrade: () => void
  displayDate: (value: string, options?: Intl.DateTimeFormatOptions) => string
}

/**
 * Auto-freeze status section: explainer, a charge gauge of banked freezes,
 * monthly usage, next-freeze countdown, and the auto-protected days list.
 * Free users see a quiet Pro gate instead of the gauge.
 */
export function FreezeSection({
  t,
  tokens,
  isPro,
  streak,
  freezesUsedThisMonth,
  maxFreezesPerMonth,
  streakFreezesAccumulated,
  maxStreakFreezesAccumulated,
  isFrozenToday,
  protectedDates,
  onUpgrade,
  displayDate,
}: Readonly<FreezeSectionProps>) {
  if (!isPro) {
    return (
      <View style={styles.groupWrap}>
        <SettingsGroup>
          <SettingsGroupRow
            label={t('streakDisplay.freeze.pro.gate')}
            accessory="none"
            trailing={
              <Pressable
                onPress={onUpgrade}
                accessibilityRole="button"
                accessibilityLabel={t('common.upgrade')}
              >
                <Text style={[styles.upgradeLink, { color: tokens.primary }]}>
                  {t('common.upgrade')}
                </Text>
              </Pressable>
            }
          />
        </SettingsGroup>
      </View>
    )
  }

  const isBankedFull = streakFreezesAccumulated >= maxStreakFreezesAccumulated
  const nextFreezeDays = STREAK_DAYS_PER_FREEZE - (streak % STREAK_DAYS_PER_FREEZE)
  const dates = protectedDates.slice(0, 5)

  return (
    <>
      <View style={styles.groupWrap}>
        <Text style={[styles.explainer, { color: tokens.fg2 }]}>
          {t('streakDisplay.freeze.auto.explainer')}
        </Text>
        <SettingsGroup>
          <SettingsGroupRow
            label={t('streakDisplay.freeze.banked.label')}
            accessory="none"
            trailing={
              <View style={styles.gaugeTrailing}>
                <ChargeGauge
                  banked={streakFreezesAccumulated}
                  max={maxStreakFreezesAccumulated}
                  tokens={tokens}
                />
                <Text style={[styles.freezeCount, { color: tokens.fg3 }]}>
                  {`${streakFreezesAccumulated}/${maxStreakFreezesAccumulated}`}
                </Text>
              </View>
            }
          />
          <SettingsGroupRow
            label={t('streakDisplay.freeze.usedThisMonth.label')}
            accessory="none"
            trailing={
              <Text style={[styles.freezeCount, { color: tokens.fg3 }]}>
                {`${freezesUsedThisMonth}/${maxFreezesPerMonth}`}
              </Text>
            }
          />
          <SettingsGroupRow
            label={t('streakDisplay.freeze.nextFreeze.label')}
            accessory="none"
            trailing={
              <Text style={[styles.freezeCount, { color: tokens.fg3 }]}>
                {isBankedFull
                  ? t('streakDisplay.freeze.nextFreeze.full')
                  : t('streakDisplay.freeze.nextFreeze.inDays', {
                      days: nextFreezeDays,
                    })}
              </Text>
            }
          />
        </SettingsGroup>
      </View>

      <SectionLabel>{t('streakDisplay.freeze.protected.label')}</SectionLabel>
      <View style={styles.groupWrap}>
        {isFrozenToday || dates.length > 0 ? (
          <SettingsGroup>
            {isFrozenToday ? (
              <SettingsGroupRow
                label={t('streakDisplay.freeze.protected.today')}
                accessory="none"
                icon={<StatusDot state="frozen" size={8} />}
                trailing={
                  <Text style={[styles.freezeCount, { color: tokens.fg3 }]}>
                    {t('streakDisplay.freeze.protected.todayValue')}
                  </Text>
                }
              />
            ) : null}
            {dates.map((date) => (
              <SettingsGroupRow
                key={date}
                label={displayDate(date, { month: 'short', day: 'numeric' })}
                accessory="none"
                icon={<StatusDot state="frozen" size={8} />}
              />
            ))}
          </SettingsGroup>
        ) : (
          <Text style={[styles.emptyText, { color: tokens.fg2 }]}>
            {t('streakDisplay.freeze.protected.empty')}
          </Text>
        )}
      </View>
    </>
  )
}

interface ChargeGaugeProps {
  banked: number
  max: number
  tokens: Tokens
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
  tokens: Tokens
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
  explainer: {
    fontFamily: 'Geist',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  freezeCount: {
    fontFamily: 'GeistMono',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
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
  upgradeLink: {
    fontFamily: 'Geist',
    fontSize: 14,
  },
  emptyText: {
    fontFamily: 'Geist',
    fontSize: 14,
    lineHeight: 21,
  },
})
