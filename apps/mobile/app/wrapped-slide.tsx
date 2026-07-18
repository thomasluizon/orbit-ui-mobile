import { Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { Share2 } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  formatCompletionRate,
  type RecapSharePeriod,
  type WrappedSlide as WrappedSlideModel,
} from '@orbit/shared/utils'
import { ShareCard } from '@/components/share/share-card'
import { PillButton } from '@/components/ui/pill-button'
import { useShareCard } from '@/hooks/use-share-card'
import { styles, type Tokens } from './wrapped-styles'

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
}

/** Renders a single Orbit Wrapped story slide; the final `share` slide embeds the #197 ShareCard and its CTA. */
export function WrappedSlide({ slide, recap, period, tokens, displayName }: Readonly<WrappedSlideProps>) {
  const { t } = useTranslation()

  switch (slide.id) {
    case 'intro':
      return (
        <View style={styles.slide} testID="wrapped-slide-intro">
          <Animated.Text entering={enter(0)} style={[styles.eyebrow, { color: tokens.fg3 }]}>
            {t('wrapped.slides.intro.eyebrow')}
          </Animated.Text>
          <Animated.Text entering={enter(1)} style={[styles.title, { color: tokens.fg1 }]}>
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
          <WeeklyRhythm tokens={tokens} values={slide.weeklyConsistency} />
          <Animated.Text entering={enter(3)} style={[styles.caption, { color: tokens.fg2 }]}>
            {t('wrapped.slides.consistency.caption')}
          </Animated.Text>
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
          <Animated.Text entering={enter(1)} style={styles.bigEmoji}>
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
    case 'share':
      return <WrappedShareSlide recap={recap} tokens={tokens} displayName={displayName} />
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
      <Animated.Text entering={enter(1)} style={[styles.heroNumeral, { color: tokens.fg1 }]}>
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

function WeeklyRhythm({ tokens, values }: Readonly<{ tokens: Tokens; values: number[] }>) {
  const { t } = useTranslation()
  return (
    <Animated.View style={styles.barsRow} entering={enter(2)}>
      {values.slice(0, 7).map((value, index) => {
        const clamped = Math.max(0, Math.min(100, value))
        return (
          <View key={WEEKDAY_KEYS[index]} style={styles.barColumn}>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(8, (clamped / 100) * 132),
                    backgroundColor: tokens.primary,
                    opacity: clamped === 0 ? 0.25 : 1,
                  },
                ]}
              />
            </View>
            <Text style={[styles.dayLabel, { color: tokens.fg3 }]}>
              {t(`dates.daysShort.${WEEKDAY_KEYS[index]}`)}
            </Text>
          </View>
        )
      })}
    </Animated.View>
  )
}

interface WrappedShareSlideProps {
  recap: Recap
  tokens: Tokens
  displayName?: string
}

function WrappedShareSlide({ recap, tokens, displayName }: Readonly<WrappedShareSlideProps>) {
  const { t } = useTranslation()
  const { shareRef, isSharing, hasError, share } = useShareCard()

  return (
    <View style={styles.shareSlide} testID="wrapped-slide-share">
      <Animated.Text entering={enter(0)} style={[styles.eyebrow, { color: tokens.fg3 }]}>
        {t('wrapped.slides.share.eyebrow')}
      </Animated.Text>
      <Animated.View entering={enter(1)}>
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

      <Animated.View entering={enter(3)} style={styles.shareCtaWrap}>
        <PillButton
          fullWidth
          busy={isSharing}
          disabled={isSharing}
          onPress={() => void share(t('shareCard.shareTitle'))}
          accessibilityLabel={t('shareCard.share')}
          leading={<Share2 size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
        >
          {t('shareCard.share')}
        </PillButton>
      </Animated.View>
    </View>
  )
}
