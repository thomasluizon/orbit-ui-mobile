import { useEffect, type Ref } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  Keyframe,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import {
  formatCompletionRate,
  getWeeklyConsistencyReading,
  getWrappedWeekdayValues,
  WRAPPED_WEEKDAY_KEYS,
  type RecapSharePeriod,
  type WrappedSlide as WrappedSlideModel,
} from '@orbit/shared/utils'
import { ShareCard } from '@/components/share/share-card'
import { Columns } from '@/components/ui/columns'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { styles, type Tokens } from '@/app/wrapped-styles'

const motionFinalStyle = { opacity: 1, transform: [{ translateY: 0 }] }
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

function enter(step: number, reducedMotion: boolean) {
  if (reducedMotion) return undefined
  return new Keyframe({
    0: { opacity: 1, transform: [{ translateY: 16 }] },
    100: {
      opacity: 1,
      transform: [{ translateY: 0 }],
      easing: Easing.bezier(...motionEasings.enter),
    },
  })
    .duration(motionDurations.slow)
    .delay(step * orbitalMotion.list.staggerMs)
}

interface WrappedSlideProps {
  slide: WrappedSlideModel
  recap: Recap
  period: RecapSharePeriod
  tokens: Tokens
  shareRef: Ref<View>
  shareError: boolean
  savedFileName: string | null
}

export function WrappedSlide({ slide, recap, period, tokens, shareRef, shareError, savedFileName }: Readonly<WrappedSlideProps>) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const { width } = useWindowDimensions()

  switch (slide.id) {
    case 'intro':
      return (
        <View style={[styles.slide, styles.introSlide]} testID="wrapped-slide-intro">
          <Animated.View nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={motionFinalStyle}><OrbitMark size={48} /></Animated.View>
          <Animated.Text testID="wrapped-figure" nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} accessibilityRole="header" style={[styles.introTitle, width >= 1024 && styles.introTitleWide, motionFinalStyle, { color: tokens.fg1 }]}>
            {t(`wrapped.slides.intro.${period}`)}
          </Animated.Text>
          <Animated.Text nativeID="wrapped-motion-part-2" entering={enter(2, reducedMotion)} style={[styles.caption, motionFinalStyle, { color: tokens.fg3 }]}>
            {t('wrapped.slides.intro.caption')}
          </Animated.Text>
        </View>
      )
    case 'completions':
      return (
        <HeroStatSlide
          tokens={tokens}
          testID="wrapped-slide-completions"
          value={slide.totalCompletions}
          label={t('wrapped.slides.completions.label')}
          caption={t('wrapped.slides.completions.caption')}
          reducedMotion={reducedMotion}
        />
      )
    case 'activeDays':
      return (
        <HeroStatSlide
          tokens={tokens}
          testID="wrapped-slide-activeDays"
          value={slide.activeDays}
          label={t('wrapped.slides.activeDays.label')}
          caption={t('wrapped.slides.activeDays.caption', {
            rate: formatCompletionRate(slide.completionRate),
          })}
          reducedMotion={reducedMotion}
        />
      )
    case 'consistency': {
      const values = getWrappedWeekdayValues(slide.weeklyConsistency, period)
      return (
        <View style={[styles.slide, styles.weekdaySlide]} testID="wrapped-slide-consistency">
          <Animated.Text nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} accessibilityRole="header" style={[styles.title, motionFinalStyle, { color: tokens.fg1 }]}>
            {t('wrapped.slides.consistency.title')}
          </Animated.Text>
          <WeekdayColumns values={values} reducedMotion={reducedMotion} />
          <WeekdayInterpretation
            values={values}
            tokens={tokens}
            reducedMotion={reducedMotion}
          />
        </View>
      )
    }
    case 'streak':
      return (
        <StreakSlide
          tokens={tokens}
          value={slide.bestStreak}
          label={t('wrapped.slides.streak.label')}
          caption={t('wrapped.slides.streak.caption', { count: slide.currentStreak })}
          reducedMotion={reducedMotion}
        />
      )
    case 'topHabit':
      return (
        <View style={[styles.slide, styles.topHabitSlide]} testID="wrapped-slide-topHabit">
          <Animated.View testID="wrapped-figure" nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={[styles.habitWell, motionFinalStyle, { backgroundColor: tokens.bgWell }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.Text style={[slide.habit.emoji ? styles.habitEmoji : styles.habitInitial, { color: tokens.fg3 }]}>{slide.habit.emoji || slide.habit.name.charAt(0).toLocaleUpperCase()}</Animated.Text>
          </Animated.View>
          <Animated.Text
            nativeID="wrapped-motion-part-1"
            entering={enter(1, reducedMotion)}
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.topHabitTitle, motionFinalStyle, { color: tokens.fg1 }]}
          >
            {slide.habit.name}
          </Animated.Text>
          <Animated.Text nativeID="wrapped-motion-part-2" entering={enter(2, reducedMotion)} style={[styles.label, motionFinalStyle, { color: tokens.fg2 }]}>{t('wrapped.slides.topHabit.label')}</Animated.Text>
          <Animated.Text nativeID="wrapped-motion-part-3" entering={enter(3, reducedMotion)} style={[styles.caption, motionFinalStyle, { color: tokens.fg3 }]}>
            {t('wrapped.slides.topHabit.caption', {
              rate: formatCompletionRate(slide.habit.completionRate),
            })}
          </Animated.Text>
        </View>
      )
    case 'goals':
      return (
        <View style={styles.slide} testID="wrapped-slide-goals">
          <Animated.Text testID="wrapped-figure" nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={[styles.heroNumeral, motionFinalStyle, { color: tokens.fg1 }]}>
            {slide.closedGoals}
          </Animated.Text>
          <Animated.Text
            nativeID="wrapped-motion-part-1"
            entering={enter(1, reducedMotion)}
            style={[styles.label, motionFinalStyle, { color: tokens.fg2 }]}
          >
            {t('shareCard.stats.goalsClosed')}
          </Animated.Text>
          <Animated.Text
            nativeID="wrapped-motion-part-2"
            entering={enter(2, reducedMotion)}
            style={[styles.caption, motionFinalStyle, { color: tokens.fg3 }]}
          >
            {slide.closedGoals > 0
              ? t('wrapped.slides.goals.some', { count: slide.closedGoals })
              : t('wrapped.slides.goals.zero')}
          </Animated.Text>
        </View>
      )
    case 'share':
      return <WrappedShareSlide recap={recap} tokens={tokens} shareRef={shareRef} hasError={shareError} savedFileName={savedFileName} reducedMotion={reducedMotion} />
  }
}

interface HeroStatSlideProps {
  tokens: Tokens
  testID: string
  value: number
  label: string
  caption: string
  reducedMotion: boolean
}

function HeroStatSlide({ tokens, testID, value, label, caption, reducedMotion }: Readonly<HeroStatSlideProps>) {
  return (
    <View style={styles.slide} testID={testID}>
      <Animated.Text testID="wrapped-figure" nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={[styles.heroNumeral, motionFinalStyle, { color: tokens.fg1 }]}>
        {value}
      </Animated.Text>
      <Animated.Text nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} style={[styles.label, motionFinalStyle, { color: tokens.fg2 }]}>
        {label}
      </Animated.Text>
      <Animated.Text nativeID="wrapped-motion-part-2" entering={enter(2, reducedMotion)} style={[styles.caption, motionFinalStyle, { color: tokens.fg3 }]}>
        {caption}
      </Animated.Text>
    </View>
  )
}

function WeekdayColumns({ values, reducedMotion }: Readonly<{ values: (number | null)[]; reducedMotion: boolean }>) {
  const { t } = useTranslation()
  return (
    <Animated.View testID="wrapped-figure" nativeID="wrapped-motion-part-1" style={[styles.figureWidth, motionFinalStyle]} entering={enter(1, reducedMotion)}>
      <Columns
        columns={values.slice(0, 7).map((value, index) => {
          const weekday = WRAPPED_WEEKDAY_KEYS[index]!
          const label = t(`dates.daysShort.${weekday}`)
          return value === null
            ? { id: weekday, label, value, unavailableLabel: t('calendar.dayCell.future') }
            : { id: weekday, label, value }
        })}
        height={160}
        showValues
        label={t('wrapped.slides.consistency.title')}
        emptyLabel={t('calendar.emptyStat')}
      />
    </Animated.View>
  )
}

function WeekdayInterpretation({
  values,
  tokens,
  reducedMotion,
}: Readonly<{ values: (number | null)[]; tokens: Tokens; reducedMotion: boolean }>) {
  const { t } = useTranslation()
  const reading = getWeeklyConsistencyReading(values)
  switch (reading.kind) {
    case 'thin':
      return (
        <>
          <Animated.Text nativeID="wrapped-motion-part-2" entering={enter(2, reducedMotion)}
            style={[styles.weekdayReading, motionFinalStyle, { color: tokens.fg2 }]}>
            {t('wrapped.slides.consistency.thin')}
          </Animated.Text>
          <Animated.Text nativeID="wrapped-motion-part-3" entering={enter(3, reducedMotion)}
            style={[styles.weekdayNote, motionFinalStyle, { color: tokens.fg3 }]}>
            {t('wrapped.slides.consistency.note')}
          </Animated.Text>
        </>
      )
    case 'even':
      return (
        <>
          <Animated.Text
            nativeID="wrapped-motion-part-2"
            entering={enter(2, reducedMotion)}
            style={[styles.weekdayReading, motionFinalStyle, { color: tokens.fg2 }]}
          >
            {t('wrapped.slides.consistency.even')}
          </Animated.Text>
          <Animated.Text
            nativeID="wrapped-motion-part-3"
            entering={enter(3, reducedMotion)}
            style={[styles.weekdayNote, motionFinalStyle, { color: tokens.fg3 }]}
          >
            {t('wrapped.slides.consistency.note')}
          </Animated.Text>
        </>
      )
    case 'compared': {
      const strongestWeekday = WRAPPED_WEEKDAY_KEYS[reading.strongestIndex]!
      return (
        <>
          <Animated.Text
            nativeID="wrapped-motion-part-2"
            entering={enter(2, reducedMotion)}
            style={[styles.weekdayReading, motionFinalStyle, { color: tokens.fg2 }]}
          >
            {t('wrapped.slides.consistency.summary', {
              strong: t(`dates.daysLong.${strongestWeekday}`),
            })}
          </Animated.Text>
          <Animated.Text
            nativeID="wrapped-motion-part-3"
            entering={enter(3, reducedMotion)}
            style={[styles.weekdayNote, motionFinalStyle, { color: tokens.fg3 }]}
          >
            {t('wrapped.slides.consistency.note')}
          </Animated.Text>
        </>
      )
    }
  }
}

function StreakSlide(props: Readonly<Omit<HeroStatSlideProps, 'testID'>>) {
  return (
    <View style={[styles.slide, styles.streakSlide]} testID="wrapped-slide-streak">
      <StreakRing tokens={props.tokens} reducedMotion={props.reducedMotion} />
      <View style={{ alignItems: 'flex-start', gap: 8 }}>
        <Animated.Text testID="wrapped-figure" nativeID="wrapped-motion-part-1" entering={enter(1, props.reducedMotion)} style={[styles.streakNumeral, motionFinalStyle, { color: props.tokens.fg1 }]}>{props.value}</Animated.Text>
        <Animated.Text nativeID="wrapped-motion-part-2" entering={enter(2, props.reducedMotion)} style={[styles.label, motionFinalStyle, { color: props.tokens.fg2 }]}>{props.label}</Animated.Text>
        <Animated.Text nativeID="wrapped-motion-part-3" entering={enter(3, props.reducedMotion)} style={[styles.caption, motionFinalStyle, { color: props.tokens.fg3 }]}>{props.caption}</Animated.Text>
      </View>
    </View>
  )
}

function StreakRing({ tokens, reducedMotion }: Readonly<{ tokens: Tokens; reducedMotion: boolean }>) {
  const radius = 15.5
  const circumference = 2 * Math.PI * radius
  const dashOffset = useSharedValue(reducedMotion ? 0 : circumference)
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: dashOffset.value }))

  useEffect(() => {
    if (!reducedMotion) {
      dashOffset.value = withDelay(
        orbitalMotion.list.staggerMs,
        withTiming(0, {
          duration: motionDurations.slow,
          easing: Easing.bezier(...motionEasings.enter),
        }),
      )
    }
  }, [dashOffset, reducedMotion])

  return (
    <Animated.View nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={motionFinalStyle}>
      <Svg width={88} height={88} viewBox="0 0 34 34" accessible={false} accessibilityElementsHidden>
        <Circle cx={17} cy={17} r={radius} fill="none" stroke={tokens.statusEmpty} strokeWidth={1.5} />
        <AnimatedCircle
          testID="wrapped-streak-ring"
          cx={17}
          cy={17}
          r={radius}
          fill="none"
          stroke={tokens.fg1}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          rotation={-90}
          origin="17, 17"
          animatedProps={animatedProps}
        />
      </Svg>
    </Animated.View>
  )
}

interface WrappedShareSlideProps {
  recap: Recap
  tokens: Tokens
  shareRef: Ref<View>
  hasError: boolean
  savedFileName: string | null
  reducedMotion: boolean
}

function WrappedShareSlide({ recap, tokens, shareRef, hasError, savedFileName, reducedMotion }: Readonly<WrappedShareSlideProps>) {
  const { t } = useTranslation()

  return (
    <View style={styles.shareSlide} testID="wrapped-slide-share">
      <Animated.Text nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} accessibilityRole="header" style={[styles.title, motionFinalStyle, { color: tokens.fg1 }]}>{t('wrapped.slides.share.title')}</Animated.Text>
      <Animated.View testID="wrapped-figure" nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} style={[styles.sharePreview, motionFinalStyle]}>
        <View style={styles.sharePreviewCard}>
          <ShareCard ref={shareRef} recap={recap} />
        </View>
      </Animated.View>

      {hasError ? (
        <Animated.Text
          nativeID="wrapped-motion-part-2"
          entering={enter(2, reducedMotion)}
          accessibilityRole="alert"
          style={[styles.shareError, motionFinalStyle, { color: tokens.statusBadText }]}
        >
          {t('shareCard.shareError')}
        </Animated.Text>
      ) : null}

      <Animated.Text
        nativeID="wrapped-motion-part-2"
        entering={enter(2, reducedMotion)}
        accessibilityLiveRegion="polite"
        style={[styles.shareStatus, motionFinalStyle, { color: tokens.fg2 }]}
      >
        {!hasError && savedFileName ? t('shareCard.saved', { file: savedFileName }) : ''}
      </Animated.Text>

    </View>
  )
}
