import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import type { createTokensV2 } from '@/lib/theme'
import { SettingsRow } from '@/components/ui/settings-row'

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

/** 7-column day grid: mono day label · dot/glyph by status. */
export function StreakWeekTimeline({
  weekDays,
  tokens,
}: Readonly<StreakWeekTimelineProps>) {
  return (
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
  )
}

interface FreezeSectionProps {
  t: TranslationFn
  tokens: Tokens
  streak: number
  freezesAvailable: number
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

  return (
    <>
      {hasReachedMonthlyLimit ? (
        <>
          <SettingsRow
            label={t('streakDisplay.freeze.accumulatedLabel')}
            value="0"
            accessory="none"
            mono
          />
          <View
            style={[
              styles.italicBlock,
              { borderBottomColor: tokens.hairline },
            ]}
          >
            <Text style={[styles.italicText, { color: tokens.fg3 }]}>
              {t('streakDisplay.freeze.monthlyLimit', {
                max: maxFreezesPerMonth,
              })}
            </Text>
          </View>
        </>
      ) : (
        <>
          <SettingsRow
            label={t('streakDisplay.freeze.accumulatedLabel')}
            accessory="none"
          >
            <Text
              style={[
                styles.freezeCount,
                { color: tokens.fg1 },
              ]}
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
                <Text
                  style={[styles.useLink, { color: tokens.fg1 }]}
                >
                  {t('streakDisplay.freeze.activate')}
                </Text>
              </Pressable>
            ) : null}
          </SettingsRow>
          <SettingsRow
            label={t('streakDisplay.freeze.monthlyUsageLabel')}
            value={t('streakDisplay.freeze.monthlyUsage', {
              used: freezesUsedThisMonth,
              max: maxFreezesPerMonth,
            })}
            accessory="none"
            mono
          />
          {canEarnMore ? (
            <View
              style={[
                styles.italicBlock,
                { borderBottomColor: tokens.hairline },
              ]}
            >
              <Text style={[styles.italicText, { color: tokens.fg3 }]}>
                {progressLabel}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.italicBlock,
                { borderBottomColor: tokens.hairline },
              ]}
            >
              <Text style={[styles.italicText, { color: tokens.fg3 }]}>
                {t('streakDisplay.freeze.maxAccumulated', {
                  max: maxStreakFreezesAccumulated,
                })}
              </Text>
            </View>
          )}
        </>
      )}

      {showActiveToday ? (
        <View
          style={[
            styles.italicBlock,
            { borderBottomColor: tokens.hairline },
          ]}
        >
          <Text style={[styles.italicText, { color: tokens.statusFrozen }]}>
            {t('streakDisplay.freeze.activeToday')}
          </Text>
        </View>
      ) : null}

      {hasCompletedToday && !isFrozenToday && streak > 0 ? (
        <View style={styles.statusBlock}>
          <Text style={[styles.italicText, { color: tokens.statusDone }]}>
            {t('streakDisplay.freeze.completedToday')}
          </Text>
        </View>
      ) : null}

      {freezeSuccess ? (
        <View style={styles.statusBlock}>
          <Text style={[styles.italicText, { color: tokens.statusFrozen }]}>
            {t('streakDisplay.freeze.success')}
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.statusBlock}>
          <Text style={[styles.italicText, { color: tokens.statusBad }]}>
            {errorMessage}
          </Text>
        </View>
      ) : null}
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
  italicBlock: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusBlock: {
    paddingHorizontal: 20,
    paddingVertical: 12,
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
