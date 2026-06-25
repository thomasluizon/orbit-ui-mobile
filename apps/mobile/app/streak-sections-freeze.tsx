import React, { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { CalendarDays, Snowflake } from 'lucide-react-native'
import { primaryGlow } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatusDot } from '@/components/ui/status-dot'
import {
  STREAK_DAYS_PER_FREEZE,
  styles,
  useTokens,
  type Tokens,
  type TranslationFn,
} from './streak-sections-styles'

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
export function FreezeProgressCard(props: Readonly<FreezeProgressCardProps>) {
  const { t, isPro } = props

  return (
    <View>
      <SectionLabel>{t('streakDisplay.freeze.title')}</SectionLabel>
      {isPro ? (
        <FreezeAutoCard {...props} />
      ) : (
        <FreezeProGate t={t} onUpgrade={props.onUpgrade} />
      )}
    </View>
  )
}

function FreezeAutoCard(props: Readonly<FreezeProgressCardProps>) {
  const { t, isFrozenToday, protectedDates, displayDate } = props
  const tokens = useTokens()
  const dates = protectedDates.slice(0, 5)

  return (
    <>
      <FreezeBankCard {...props} />

      <SectionLabel>{t('streakDisplay.freeze.protected.label')}</SectionLabel>
      <View style={[styles.groupWrap, styles.sectionBottomPad]}>
        {isFrozenToday || dates.length > 0 ? (
          <CardGroup>
            {isFrozenToday ? (
              <CardRow
                icon={<StatusDot state="frozen" size={8} accessibilityLabel={t('habits.statusDot.frozen')} />}
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
                icon={<StatusDot state="frozen" size={8} accessibilityLabel={t('habits.statusDot.frozen')} />}
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
  )
}

function FreezeBankCard({
  t,
  streak,
  streakFreezesAccumulated,
  maxStreakFreezesAccumulated,
  freezesUsedThisMonth,
  maxFreezesPerMonth,
}: Readonly<FreezeProgressCardProps>) {
  const tokens = useTokens()
  const isBankedFull = streakFreezesAccumulated >= maxStreakFreezesAccumulated
  const nextFreezeDays = STREAK_DAYS_PER_FREEZE - (streak % STREAK_DAYS_PER_FREEZE)
  const nextFreezeProgress = isBankedFull
    ? 1
    : (STREAK_DAYS_PER_FREEZE - nextFreezeDays) / STREAK_DAYS_PER_FREEZE

  return (
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
        <FreezeStatRow
          icon={
            <View style={styles.cardRowIcon}>
              <Snowflake size={20} strokeWidth={1.8} color={tokens.statusFrozen} />
            </View>
          }
          label={t('streakDisplay.freeze.banked.label')}
          trailing={
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
          }
        />

        <FreezeStatRow
          icon={
            <View style={styles.cardRowIcon}>
              <CalendarDays size={20} strokeWidth={1.8} color={tokens.fg3} />
            </View>
          }
          label={t('streakDisplay.freeze.usedThisMonth.label')}
          trailing={<StatValue value={`${freezesUsedThisMonth}/${maxFreezesPerMonth}`} />}
        />

        <NextFreezeRow
          t={t}
          isBankedFull={isBankedFull}
          nextFreezeDays={nextFreezeDays}
          nextFreezeProgress={nextFreezeProgress}
        />
      </View>
    </View>
  )
}

function FreezeStatRow({
  icon,
  label,
  trailing,
}: Readonly<{ icon: ReactNode; label: string; trailing: ReactNode }>) {
  const tokens = useTokens()

  return (
    <View style={styles.freezeRow}>
      <View style={styles.cardRowLead}>
        {icon}
        <Text
          style={[styles.cardRowLabel, { color: tokens.fg1 }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {trailing}
    </View>
  )
}

function NextFreezeRow({
  t,
  isBankedFull,
  nextFreezeDays,
  nextFreezeProgress,
}: Readonly<{
  t: TranslationFn
  isBankedFull: boolean
  nextFreezeDays: number
  nextFreezeProgress: number
}>) {
  const tokens = useTokens()

  return (
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
  )
}

function FreezeProGate({
  t,
  onUpgrade,
}: Readonly<{ t: TranslationFn; onUpgrade: () => void }>) {
  const tokens = useTokens()

  return (
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
