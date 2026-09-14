import { useEffect, type Ref } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  Keyframe,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import {
  formatCompletionRate,
  WRAPPED_WEEKDAY_KEYS,
  type RecapSharePeriod,
  type WrappedSlide as WrappedSlideModel,
} from '@orbit/shared/utils'
import { ShareCard } from '@/components/share/share-card'
import { Columns } from '@/components/ui/columns'
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
}

export function WrappedSlide({ slide, recap, period, tokens, shareRef, shareError }: Readonly<WrappedSlideProps>) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  switch (slide.id) {
    case 'intro':
      return (
        <View style={styles.slide} testID="wrapped-slide-intro">
          <Animated.Text nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={[styles.eyebrow, motionFinalStyle, { color: tokens.fg3 }]}>
            {t('wrapped.slides.intro.eyebrow')}
          </Animated.Text>
          <Animated.Text testID="wrapped-figure" nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} style={[styles.title, motionFinalStyle, { color: tokens.fg1 }]}>
            {t(`wrapped.slides.intro.${period}`)}
          </Animated.Text>
          <Animated.Text nativeID="wrapped-motion-part-2" entering={enter(2, reducedMotion)} style={[styles.caption, motionFinalStyle, { color: tokens.fg2 }]}>
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
          reducedMotion={reducedMotion}
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
          reducedMotion={reducedMotion}
        />
      )
    case 'consistency':
      return (
        <View style={styles.slide} testID="wrapped-slide-consistency">
          <Animated.Text nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={[styles.eyebrow, motionFinalStyle, { color: tokens.fg3 }]}>
            {t('wrapped.slides.consistency.eyebrow')}
          </Animated.Text>
          <Animated.Text nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} style={[styles.title, motionFinalStyle, { color: tokens.fg1 }]}>
            {t('wrapped.slides.consistency.title')}
          </Animated.Text>
          <WeekdayColumns values={slide.weeklyConsistency} reducedMotion={reducedMotion} />
        </View>
      )
    case 'streak':
      return (
        <StreakSlide
          tokens={tokens}
          eyebrow={t('wrapped.slides.streak.eyebrow')}
          value={slide.bestStreak}
          label={t('wrapped.slides.streak.label')}
          caption={t('wrapped.slides.streak.caption', { count: slide.currentStreak })}
          reducedMotion={reducedMotion}
        />
      )
    case 'topHabit':
      return (
        <View style={styles.slide} testID="wrapped-slide-topHabit">
          <Animated.Text nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={[styles.eyebrow, motionFinalStyle, { color: tokens.fg3 }]}>
            {t('wrapped.slides.topHabit.eyebrow')}
          </Animated.Text>
          <Animated.Text testID="wrapped-figure" nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} style={[styles.bigEmoji, motionFinalStyle]}>
            {slide.habit.emoji ?? '⭐'}
          </Animated.Text>
          <Animated.Text
            nativeID="wrapped-motion-part-2"
            entering={enter(2, reducedMotion)}
            numberOfLines={2}
            style={[styles.title, motionFinalStyle, { color: tokens.fg1 }]}
          >
            {slide.habit.name}
          </Animated.Text>
          <Animated.Text nativeID="wrapped-motion-part-3" entering={enter(3, reducedMotion)} style={[styles.caption, motionFinalStyle, { color: tokens.fg2 }]}>
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
          <Animated.Text nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} style={[styles.label, motionFinalStyle, { color: tokens.fg2 }]}>
            {t('progressScreen.sections.goals')}
          </Animated.Text>
        </View>
      )
    case 'share':
      return <WrappedShareSlide recap={recap} tokens={tokens} shareRef={shareRef} hasError={shareError} reducedMotion={reducedMotion} />
  }
}

interface HeroStatSlideProps {
  tokens: Tokens
  testID: string
  eyebrow: string
  value: number
  label: string
  caption: string
  reducedMotion: boolean
}

function HeroStatSlide({ tokens, testID, eyebrow, value, label, caption, reducedMotion }: Readonly<HeroStatSlideProps>) {
  return (
    <View style={styles.slide} testID={testID}>
      <Animated.Text nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={[styles.eyebrow, motionFinalStyle, { color: tokens.fg3 }]}>
        {eyebrow}
      </Animated.Text>
      <Animated.Text testID="wrapped-figure" nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} style={[styles.heroNumeral, motionFinalStyle, { color: tokens.fg1 }]}>
        {value}
      </Animated.Text>
      <Animated.Text nativeID="wrapped-motion-part-2" entering={enter(2, reducedMotion)} style={[styles.label, motionFinalStyle, { color: tokens.fg2 }]}>
        {label}
      </Animated.Text>
      <Animated.Text nativeID="wrapped-motion-part-3" entering={enter(3, reducedMotion)} style={[styles.caption, motionFinalStyle, { color: tokens.fg2 }]}>
        {caption}
      </Animated.Text>
    </View>
  )
}

function WeekdayColumns({ values, reducedMotion }: Readonly<{ values: number[]; reducedMotion: boolean }>) {
  const { t } = useTranslation()
  return (
    <Animated.View testID="wrapped-figure" nativeID="wrapped-motion-part-2" style={[styles.figureWidth, motionFinalStyle]} entering={enter(2, reducedMotion)}>
      <Columns
        columns={values.slice(0, 7).map((value, index) => {
          const weekday = WRAPPED_WEEKDAY_KEYS[index]!
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

function StreakSlide(props: Readonly<Omit<HeroStatSlideProps, 'testID'>>) {
  return (
    <View style={styles.slide} testID="wrapped-slide-streak">
      <Animated.Text nativeID="wrapped-motion-part-0" entering={enter(0, props.reducedMotion)} style={[styles.eyebrow, motionFinalStyle, { color: props.tokens.fg3 }]}>
        {props.eyebrow}
      </Animated.Text>
      <StreakRing tokens={props.tokens} reducedMotion={props.reducedMotion} />
      <Animated.Text testID="wrapped-figure" nativeID="wrapped-motion-part-2" entering={enter(2, props.reducedMotion)} style={[styles.heroNumeral, motionFinalStyle, { color: props.tokens.fg1 }]}>
        {props.value}
      </Animated.Text>
      <Animated.Text nativeID="wrapped-motion-part-3" entering={enter(3, props.reducedMotion)} style={[styles.label, motionFinalStyle, { color: props.tokens.fg2 }]}>
        {props.label}
      </Animated.Text>
      <Animated.Text nativeID="wrapped-motion-part-4" entering={enter(4, props.reducedMotion)} style={[styles.caption, motionFinalStyle, { color: props.tokens.fg2 }]}>
        {props.caption}
      </Animated.Text>
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
      dashOffset.value = withTiming(0, {
        duration: motionDurations.slow,
        easing: Easing.bezier(...motionEasings.enter),
      })
    }
  }, [dashOffset, reducedMotion])

  return (
    <Animated.View nativeID="wrapped-motion-part-1" entering={enter(1, reducedMotion)} style={motionFinalStyle}>
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
  reducedMotion: boolean
}

function WrappedShareSlide({ recap, tokens, shareRef, hasError, reducedMotion }: Readonly<WrappedShareSlideProps>) {
  const { t } = useTranslation()

  return (
    <View style={styles.shareSlide} testID="wrapped-slide-share">
      <Animated.Text nativeID="wrapped-motion-part-0" entering={enter(0, reducedMotion)} style={[styles.eyebrow, motionFinalStyle, { color: tokens.fg3 }]}>
        {t('wrapped.slides.share.eyebrow')}
      </Animated.Text>
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

    </View>
  )
}
