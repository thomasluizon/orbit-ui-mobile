'use client'

import type { ReactNode, Ref } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import {
  formatCompletionRate,
  getWeeklyConsistencyReading,
  WRAPPED_WEEKDAY_KEYS,
  type RecapSharePeriod,
  type WrappedSlide as WrappedSlideModel,
} from '@orbit/shared/utils'
import { ShareCard } from '@/components/share/share-card'
import { Columns } from '@/components/ui/columns'
import {
  captionStyle,
  eyebrowStyle,
  heroNumeralStyle,
  labelStyle,
  titleStyle,
} from './wrapped-styles'

interface WrappedSlideProps {
  slide: WrappedSlideModel
  recap: Recap
  period: RecapSharePeriod
  captureRef: Ref<HTMLDivElement>
  shareError: boolean
}

function motionProps(step: number, reducedMotion: boolean) {
  const finalState = { y: 0, opacity: 1 }
  if (reducedMotion) {
    return { initial: false as const, animate: finalState }
  }
  return {
    initial: { y: 16, opacity: 1 },
    animate: finalState,
    transition: {
      duration: motionDurations.slow / 1000,
      delay: step * orbitalMotion.list.staggerMs / 1000,
      ease: motionEasings.enter,
    },
  }
}

export function WrappedSlide({ slide, recap, period, captureRef, shareError }: Readonly<WrappedSlideProps>) {
  const t = useTranslations()
  const reducedMotion = Boolean(useReducedMotion())

  switch (slide.id) {
    case 'intro':
      return (
        <SlideShell testId="wrapped-slide-intro">
          <motion.span data-testid="wrapped-motion-part" {...motionProps(0, reducedMotion)} style={eyebrowStyle}>
            {t('wrapped.slides.intro.eyebrow')}
          </motion.span>
          <motion.h1
            data-testid="wrapped-motion-part"
            data-wrapped-figure="primary"
            {...motionProps(1, reducedMotion)}
            style={titleStyle}
          >
            {t(`wrapped.slides.intro.${period}`)}
          </motion.h1>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(2, reducedMotion)} style={captionStyle}>
            {t('wrapped.slides.intro.caption')}
          </motion.p>
        </SlideShell>
      )
    case 'completions':
      return (
        <HeroStatSlide
          testId="wrapped-slide-completions"
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
          testId="wrapped-slide-activeDays"
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
        <SlideShell testId="wrapped-slide-consistency">
          <motion.span data-testid="wrapped-motion-part" {...motionProps(0, reducedMotion)} style={eyebrowStyle}>
            {t('wrapped.slides.consistency.eyebrow')}
          </motion.span>
          <motion.h2 data-testid="wrapped-motion-part" {...motionProps(1, reducedMotion)} style={titleStyle}>
            {t('wrapped.slides.consistency.title')}
          </motion.h2>
          <WeekdayColumns values={slide.weeklyConsistency} reducedMotion={reducedMotion} />
          <WeekdayInterpretation values={slide.weeklyConsistency} reducedMotion={reducedMotion} />
        </SlideShell>
      )
    case 'streak':
      return (
        <StreakSlide
          eyebrow={t('wrapped.slides.streak.eyebrow')}
          value={slide.bestStreak}
          label={t('wrapped.slides.streak.label')}
          caption={t('wrapped.slides.streak.caption', { count: slide.currentStreak })}
          reducedMotion={reducedMotion}
        />
      )
    case 'topHabit':
      return (
        <SlideShell testId="wrapped-slide-topHabit">
          <motion.span data-testid="wrapped-motion-part" {...motionProps(0, reducedMotion)} style={eyebrowStyle}>
            {t('wrapped.slides.topHabit.eyebrow')}
          </motion.span>
          <motion.span
            data-testid="wrapped-motion-part"
            data-wrapped-figure="primary"
            {...motionProps(1, reducedMotion)}
            style={{ fontSize: 72, lineHeight: 1 }}
            aria-hidden="true"
          >
            {slide.habit.emoji ?? '⭐'}
          </motion.span>
          <motion.h2
            data-testid="wrapped-motion-part"
            {...motionProps(2, reducedMotion)}
            style={{
              ...titleStyle,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {slide.habit.name}
          </motion.h2>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(3, reducedMotion)} style={captionStyle}>
            {t('wrapped.slides.topHabit.caption', {
              rate: formatCompletionRate(slide.habit.completionRate),
            })}
          </motion.p>
        </SlideShell>
      )
    case 'goals':
      return (
        <SlideShell testId="wrapped-slide-goals">
          <motion.span
            data-testid="wrapped-motion-part"
            data-wrapped-figure="primary"
            {...motionProps(0, reducedMotion)}
            style={heroNumeralStyle}
          >
            {slide.closedGoals}
          </motion.span>
          <motion.span data-testid="wrapped-motion-part" {...motionProps(1, reducedMotion)} style={labelStyle}>
            {t('shareCard.stats.goalsClosed')}
          </motion.span>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(2, reducedMotion)} style={captionStyle}>
            {slide.closedGoals > 0
              ? t('wrapped.slides.goals.some', { count: slide.closedGoals })
              : t('wrapped.slides.goals.zero')}
          </motion.p>
        </SlideShell>
      )
    case 'share':
      return (
        <WrappedShareSlide
          recap={recap}
          captureRef={captureRef}
          hasError={shareError}
          reducedMotion={reducedMotion}
        />
      )
  }
}

interface SlideShellProps {
  children: ReactNode
  testId: string
}

function SlideShell({ children, testId }: Readonly<SlideShellProps>) {
  return (
    <div
      data-testid={testId}
      className="flex flex-1 flex-col items-center justify-center text-center"
      style={{ gap: 16, padding: '0 24px' }}
    >
      {children}
    </div>
  )
}

interface HeroStatSlideProps {
  testId: string
  eyebrow: string
  value: number
  label: string
  caption: string
  reducedMotion: boolean
}

function HeroStatSlide({ testId, eyebrow, value, label, caption, reducedMotion }: Readonly<HeroStatSlideProps>) {
  return (
    <SlideShell testId={testId}>
      <motion.span data-testid="wrapped-motion-part" {...motionProps(0, reducedMotion)} style={eyebrowStyle}>
        {eyebrow}
      </motion.span>
      <motion.span
        data-testid="wrapped-motion-part"
        data-wrapped-figure="primary"
        {...motionProps(1, reducedMotion)}
        style={heroNumeralStyle}
      >
        {value}
      </motion.span>
      <motion.span data-testid="wrapped-motion-part" {...motionProps(2, reducedMotion)} style={labelStyle}>
        {label}
      </motion.span>
      <motion.p data-testid="wrapped-motion-part" {...motionProps(3, reducedMotion)} style={captionStyle}>
        {caption}
      </motion.p>
    </SlideShell>
  )
}

function WeekdayColumns({ values, reducedMotion }: Readonly<{ values: number[]; reducedMotion: boolean }>) {
  const t = useTranslations()
  return (
    <motion.div
      data-testid="wrapped-motion-part"
      data-wrapped-figure="primary"
      {...motionProps(2, reducedMotion)}
      className="w-full max-w-sm"
    >
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
    </motion.div>
  )
}

function StreakSlide(props: Readonly<Omit<HeroStatSlideProps, 'testId'>>) {
  const ringTransition = props.reducedMotion ? undefined : {
    duration: motionDurations.slow / 1000,
    delay: orbitalMotion.list.staggerMs / 1000,
    ease: motionEasings.enter,
  }
  return (
    <SlideShell testId="wrapped-slide-streak">
      <motion.span data-testid="wrapped-motion-part" {...motionProps(0, props.reducedMotion)} style={eyebrowStyle}>
        {props.eyebrow}
      </motion.span>
      <motion.div
        data-testid="wrapped-motion-part"
        {...motionProps(1, props.reducedMotion)}
        style={{ lineHeight: 0 }}
      >
        <svg width="88" height="88" viewBox="0 0 34 34" aria-hidden="true" focusable="false">
          <circle cx="17" cy="17" r="15.5" fill="none" stroke="var(--status-empty)" strokeWidth="1.5" />
          <motion.circle
            data-testid="wrapped-streak-ring"
            cx="17"
            cy="17"
            r="15.5"
            fill="none"
            stroke="var(--fg-1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength="1"
            transform="rotate(-90 17 17)"
            initial={props.reducedMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={ringTransition}
          />
        </svg>
      </motion.div>
      <motion.span
        data-testid="wrapped-motion-part"
        data-wrapped-figure="primary"
        {...motionProps(2, props.reducedMotion)}
        style={heroNumeralStyle}
      >
        {props.value}
      </motion.span>
      <motion.span data-testid="wrapped-motion-part" {...motionProps(3, props.reducedMotion)} style={labelStyle}>
        {props.label}
      </motion.span>
      <motion.p data-testid="wrapped-motion-part" {...motionProps(4, props.reducedMotion)} style={captionStyle}>
        {props.caption}
      </motion.p>
    </SlideShell>
  )
}

function WeekdayInterpretation({
  values,
  reducedMotion,
}: Readonly<{ values: number[]; reducedMotion: boolean }>) {
  const t = useTranslations()
  const reading = getWeeklyConsistencyReading(values)
  switch (reading.kind) {
    case 'thin':
      return (
        <motion.p data-testid="wrapped-motion-part" {...motionProps(3, reducedMotion)} style={captionStyle}>
          {t('wrapped.slides.consistency.thin')}
        </motion.p>
      )
    case 'even':
      return (
        <>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(3, reducedMotion)} style={captionStyle}>
            {t('wrapped.slides.consistency.even')}
          </motion.p>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(4, reducedMotion)} style={captionStyle}>
            {t('wrapped.slides.consistency.note')}
          </motion.p>
        </>
      )
    case 'compared': {
      const strongestWeekday = WRAPPED_WEEKDAY_KEYS[reading.strongestIndex]!
      return (
        <>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(3, reducedMotion)} style={captionStyle}>
            {t('wrapped.slides.consistency.summary', {
              strong: t(`dates.daysShort.${strongestWeekday}`),
            })}
          </motion.p>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(4, reducedMotion)} style={captionStyle}>
            {t('wrapped.slides.consistency.note')}
          </motion.p>
        </>
      )
    }
  }
}

interface WrappedShareSlideProps {
  recap: Recap
  captureRef: Ref<HTMLDivElement>
  hasError: boolean
  reducedMotion: boolean
}

function WrappedShareSlide({ recap, captureRef, hasError, reducedMotion }: Readonly<WrappedShareSlideProps>) {
  const t = useTranslations()

  return (
    <div
      data-testid="wrapped-slide-share"
      className="flex flex-1 flex-col items-center justify-center"
      style={{ gap: 16, padding: '8px 24px 24px' }}
    >
      <motion.span data-testid="wrapped-motion-part" {...motionProps(0, reducedMotion)} style={eyebrowStyle}>
        {t('wrapped.slides.share.eyebrow')}
      </motion.span>
      <motion.div
        data-testid="wrapped-motion-part"
        data-wrapped-figure="primary"
        {...motionProps(1, reducedMotion)}
        style={{ width: 216, height: 384, overflow: 'hidden' }}
      >
        <div style={{ transform: 'scale(0.6)', transformOrigin: 'top left' }}>
          <ShareCard ref={captureRef} recap={recap} />
        </div>
      </motion.div>

      {hasError && (
        <motion.p
          data-testid="wrapped-motion-part"
          {...motionProps(2, reducedMotion)}
          role="alert"
          style={{ textAlign: 'center', fontSize: 13, color: 'var(--status-bad-text)' }}
        >
          {t('shareCard.shareError')}
        </motion.p>
      )}

    </div>
  )
}
