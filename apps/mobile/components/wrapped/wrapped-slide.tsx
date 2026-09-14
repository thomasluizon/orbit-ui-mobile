import type { Ref } from 'react'
import { View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  formatCompletionRate,
  getWeeklyConsistencyReading,
  type RecapSharePeriod,
  type WrappedSlide as WrappedSlideModel,
} from '@orbit/shared/utils'
import { ShareCard } from '@/components/share/share-card'
import { Columns } from '@/components/ui/columns'
import { styles, type Tokens } from '@/app/wrapped-styles'

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

function enter(step: number) {
  return FadeInDown.duration(280)
    .delay(step * 60)
    .reduceMotion(ReduceMotion.System)
}

interface WrappedSlideProps {
  slide: WrappedSlideModel
  recap: Recap
  period: RecapSharePeriod
  tokens: Tokens
  displayName?: string
  shareRef: Ref<View>
  shareError: boolean
}

export function WrappedSlide({ slide, recap, period, tokens, displayName, shareRef, shareError }: Readonly<WrappedSlideProps>) {
  const { t } = useTranslation()

  switch (slide.id) {
    case 'intro':
      return (
        <View style={styles.slide} testID="wrapped-slide-intro">
          <Animated.Text entering={enter(0)} style={[styles.eyebrow, { color: tokens.fg3 }]}>
            {t('wrapped.slides.intro.eyebrow')}
          </Animated.Text>
          <Animated.Text testID="wrapped-figure" entering={enter(1)} style={[styles.title, { color: tokens.fg1 }]}>
            {t(`wrapped.slides.intro.${period}`)}
          </Animated.Text>
          <Animated.Text entering={enter(2)} style={[styles.caption, { color: tokens.fg2 }]}>
            {t('wrapped.slides.intro.caption')}
          </Animated.Text>
        </View>
      )
    case 'completions':
      return (
        <HeroStatSlide
          tokens={tokens}
          testID="wrapped-slide-completions"
          eyebrow={t('wrapped.slides.completions.eyebrow')}
          value={slide.totalCompletions}
          label={t('wrapped.slides.completions.label')}
          caption={t('wrapped.slides.completions.caption')}
        />
      )
    case 'activeDays':
      return (
        <HeroStatSlide
          tokens={tokens}
          testID="wrapped-slide-activeDays"
          eyebrow={t('wrapped.slides.activeDays.eyebrow')}
          value={slide.activeDays}
          label={t('wrapped.slides.activeDays.label')}
          caption={t('wrapped.slides.activeDays.caption', {
            rate: formatCompletionRate(slide.completionRate),
          })}
        />
      )
    case 'consistency':
      return (
        <View style={styles.slide} testID="wrapped-slide-consistency">
          <Animated.Text entering={enter(0)} style={[styles.eyebrow, { color: tokens.fg3 }]}>
            {t('wrapped.slides.consistency.eyebrow')}
          </Animated.Text>
          <Animated.Text entering={enter(1)} style={[styles.title, { color: tokens.fg1 }]}>
            {t('wrapped.slides.consistency.title')}
          </Animated.Text>
          <WeekdayColumns values={slide.weeklyConsistency} />
          <WeekdayInterpretation values={slide.weeklyConsistency} tokens={tokens} />
        </View>
      )
    case 'streak':
      return (
        <HeroStatSlide
          tokens={tokens}
          testID="wrapped-slide-streak"
          eyebrow={t('wrapped.slides.streak.eyebrow')}
          value={slide.bestStreak}
          label={t('wrapped.slides.streak.label')}
          caption={t('wrapped.slides.streak.caption', { count: slide.currentStreak })}
        />
      )
    case 'topHabit':
      return (
        <View style={styles.slide} testID="wrapped-slide-topHabit">
          <Animated.Text entering={enter(0)} style={[styles.eyebrow, { color: tokens.fg3 }]}>
            {t('wrapped.slides.topHabit.eyebrow')}
          </Animated.Text>
          <Animated.Text testID="wrapped-figure" entering={enter(1)} style={styles.bigEmoji}>
            {slide.habit.emoji ?? '⭐'}
          </Animated.Text>
          <Animated.Text
            entering={enter(2)}
            numberOfLines={2}
            style={[styles.title, { color: tokens.fg1 }]}
          >
            {slide.habit.name}
          </Animated.Text>
          <Animated.Text entering={enter(3)} style={[styles.caption, { color: tokens.fg2 }]}>
            {t('wrapped.slides.topHabit.caption', {
              rate: formatCompletionRate(slide.habit.completionRate),
            })}
          </Animated.Text>
        </View>
      )
    case 'goals':
      return (
        <View style={styles.slide} testID="wrapped-slide-goals">
          <Animated.Text testID="wrapped-figure" entering={enter(0)} style={[styles.heroNumeral, { color: tokens.fg1 }]}>
            {slide.closedGoals}
          </Animated.Text>
          <Animated.Text entering={enter(1)} style={[styles.label, { color: tokens.fg2 }]}>
            {t('shareCard.stats.goalsClosed')}
          </Animated.Text>
          <Animated.Text entering={enter(2)} style={[styles.caption, { color: tokens.fg2 }]}>
            {slide.closedGoals > 0
              ? t('wrapped.slides.goals.some', { count: slide.closedGoals })
              : t('wrapped.slides.goals.zero')}
          </Animated.Text>
        </View>
      )
    case 'share':
      return <WrappedShareSlide recap={recap} tokens={tokens} displayName={displayName} shareRef={shareRef} hasError={shareError} />
  }
}

interface HeroStatSlideProps {
  tokens: Tokens
  testID: string
  eyebrow: string
  value: number
  label: string
  caption: string
}

function HeroStatSlide({ tokens, testID, eyebrow, value, label, caption }: Readonly<HeroStatSlideProps>) {
  return (
    <View style={styles.slide} testID={testID}>
      <Animated.Text entering={enter(0)} style={[styles.eyebrow, { color: tokens.fg3 }]}>
        {eyebrow}
      </Animated.Text>
      <Animated.Text testID="wrapped-figure" entering={enter(1)} style={[styles.heroNumeral, { color: tokens.fg1 }]}>
        {value}
      </Animated.Text>
      <Animated.Text entering={enter(2)} style={[styles.label, { color: tokens.fg2 }]}>
        {label}
      </Animated.Text>
      <Animated.Text entering={enter(3)} style={[styles.caption, { color: tokens.fg2 }]}>
        {caption}
      </Animated.Text>
    </View>
  )
}

function WeekdayColumns({ values }: Readonly<{ values: number[] }>) {
  const { t } = useTranslation()
  return (
    <Animated.View testID="wrapped-figure" style={styles.figureWidth} entering={enter(2)}>
      <Columns
        columns={values.slice(0, 7).map((value, index) => {
          const weekday = WEEKDAY_KEYS[index]!
          return { id: weekday, label: t(`dates.daysShort.${weekday}`), value }
        })}
        height={160}
        showValues
        label={t('wrapped.slides.consistency.title')}
        emptyLabel={t('calendar.emptyStat')}
      />
    </Animated.View>
  )
}

function WeekdayInterpretation({ values, tokens }: Readonly<{ values: number[]; tokens: Tokens }>) {
  const { t } = useTranslation()
  const reading = getWeeklyConsistencyReading(values)
  switch (reading.kind) {
    case 'thin':
      return (
        <Animated.Text entering={enter(3)} style={[styles.caption, { color: tokens.fg2 }]}>
          {t('wrapped.slides.consistency.thin')}
        </Animated.Text>
      )
    case 'even':
      return (
        <>
          <Animated.Text entering={enter(3)} style={[styles.caption, { color: tokens.fg2 }]}>
            {t('wrapped.slides.consistency.even')}
          </Animated.Text>
          <Animated.Text entering={enter(4)} style={[styles.caption, { color: tokens.fg2 }]}>
            {t('wrapped.slides.consistency.note')}
          </Animated.Text>
        </>
      )
    case 'compared': {
      const strongestWeekday = WEEKDAY_KEYS[reading.strongestIndex]!
      return (
        <>
          <Animated.Text entering={enter(3)} style={[styles.caption, { color: tokens.fg2 }]}>
            {t('wrapped.slides.consistency.summary', {
              strong: t(`dates.daysShort.${strongestWeekday}`),
            })}
          </Animated.Text>
          <Animated.Text entering={enter(4)} style={[styles.caption, { color: tokens.fg2 }]}>
            {t('wrapped.slides.consistency.note')}
          </Animated.Text>
        </>
      )
    }
  }
}

interface WrappedShareSlideProps {
  recap: Recap
  tokens: Tokens
  displayName?: string
  shareRef: Ref<View>
  hasError: boolean
}

function WrappedShareSlide({ recap, tokens, displayName, shareRef, hasError }: Readonly<WrappedShareSlideProps>) {
  const { t } = useTranslation()

  return (
    <View style={styles.shareSlide} testID="wrapped-slide-share">
      <Animated.Text entering={enter(0)} style={[styles.eyebrow, { color: tokens.fg3 }]}>
        {t('wrapped.slides.share.eyebrow')}
      </Animated.Text>
      <Animated.View testID="wrapped-figure" entering={enter(1)}>
        <ShareCard ref={shareRef} recap={recap} displayName={displayName} />
      </Animated.View>

      {hasError ? (
        <Animated.Text
          entering={enter(2)}
          accessibilityRole="alert"
          style={[styles.shareError, { color: tokens.statusBadText }]}
        >
          {t('shareCard.shareError')}
        </Animated.Text>
      ) : null}

    </View>
  )
}
