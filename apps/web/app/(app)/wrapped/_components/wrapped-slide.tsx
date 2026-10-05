'use client'

import { PersonalText } from '@/components/ui/personal-text'
import { useState, type ReactNode, type Ref } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
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
import { useProfile } from '@/hooks/use-profile'
import { ErrorState } from '@/components/ui/error-state'
import { Button } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { OrbitMark } from '@/components/ui/orbit-mark'
import {
  captionStyle,
  heroNumeralStyle,
  introTitleStyle,
  labelStyle,
  streakNumeralStyle,
  titleStyle,
  topHabitTitleStyle,
  weekdayNoteStyle,
  weekdayReadingStyle,
} from './wrapped-styles'

interface WrappedSlideProps {
  slide: WrappedSlideModel
  recap: Recap
  period: RecapSharePeriod
  captureRef: Ref<HTMLDivElement>
  shareError: boolean
  savedFileName: string | null
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

export function WrappedSlide({ slide, recap, period, captureRef, shareError, savedFileName }: Readonly<WrappedSlideProps>) {
  const t = useTranslations()
  const { profile, isError: isProfileError, refetch: refetchProfile } = useProfile()
  const reducedMotion = Boolean(useReducedMotion())
  const [titleExpanded, setTitleExpanded] = useState(false)

  switch (slide.id) {
    case 'intro':
      return (
        <SlideShell testId="wrapped-slide-intro" gap={16}>
          <motion.div data-testid="wrapped-motion-part" {...motionProps(0, reducedMotion)}><OrbitMark size={48} /></motion.div>
          <motion.h1
            className="text-[34px] lg:text-[44px]"
            data-testid="wrapped-motion-part"
            data-wrapped-figure="primary"
            {...motionProps(1, reducedMotion)}
            style={introTitleStyle}
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
          value={slide.activeDays}
          label={t('wrapped.slides.activeDays.label')}
          caption={t('wrapped.slides.activeDays.caption', {
            rate: formatCompletionRate(slide.completionRate),
          })}
          reducedMotion={reducedMotion}
        />
      )
    case 'consistency': {
      const values = getWrappedWeekdayValues(
        slide.weeklyConsistency, period, recap.metrics.periodDays, profile?.weekStartDay,
      )
      return (
        <SlideShell testId="wrapped-slide-consistency" gap={24}>
          <motion.h2 data-testid="wrapped-motion-part" {...motionProps(0, reducedMotion)} style={titleStyle}>
            {t('wrapped.slides.consistency.title')}
          </motion.h2>
          {period === 'week' && !profile ? (
            <div data-wrapped-figure="primary" className="w-full">
              {isProfileError ? (
                <ErrorState message={t('wrapped.error')} action={
                  <Button size="sm" onClick={() => void refetchProfile()}>{t('wrapped.retry')}</Button>
                } />
              ) : <Skeleton variant="bar-chart" label={t('wrapped.loading')} />}
            </div>
          ) : (
            <>
              <WeekdayColumns values={values} reducedMotion={reducedMotion} />
              <WeekdayInterpretation values={values} reducedMotion={reducedMotion} />
            </>
          )}
        </SlideShell>
      )
    }
    case 'streak':
      return (
        <StreakSlide
          value={slide.bestStreak}
          label={t('wrapped.slides.streak.label')}
          caption={t('wrapped.slides.streak.caption', { count: slide.currentStreak })}
          reducedMotion={reducedMotion}
        />
      )
    case 'topHabit':
      return (
        <SlideShell testId="wrapped-slide-topHabit" gap={16}>
          <motion.div
            data-testid="wrapped-motion-part"
            data-wrapped-figure="primary"
            {...motionProps(0, reducedMotion)}
            className="flex size-[88px] items-center justify-center rounded-[var(--r-well)] bg-[var(--bg-well)]"
            aria-hidden="true"
          >
            <span style={{ fontSize: 44, lineHeight: 1, color: slide.habit.emoji ? undefined : 'var(--fg-3)', fontWeight: 500 }}>
              {slide.habit.emoji || slide.habit.name.charAt(0).toLocaleUpperCase()}
            </span>
          </motion.div>
          <motion.h2
            data-testid="wrapped-motion-part"
            {...motionProps(1, reducedMotion)}
            style={topHabitTitleStyle}
          >
            <button type="button" aria-label={slide.habit.name} aria-expanded={titleExpanded} onClick={() => setTitleExpanded(!titleExpanded)} className="underline decoration-from-font min-h-12 w-full min-w-0 rounded-[12px] text-center touch-manipulation hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2"><PersonalText expanded={titleExpanded}>{slide.habit.name}</PersonalText></button>
          </motion.h2>
          <motion.span data-testid="wrapped-motion-part" {...motionProps(2, reducedMotion)} style={labelStyle}>
            {t('wrapped.slides.topHabit.label')}
          </motion.span>
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
          savedFileName={savedFileName}
          reducedMotion={reducedMotion}
        />
      )
  }
}

interface SlideShellProps {
  children: ReactNode
  testId: string
  gap?: number
}

function SlideShell({ children, testId, gap = 8 }: Readonly<SlideShellProps>) {
  return (
    <div
      data-testid={testId}
      className="flex flex-1 flex-col items-start justify-center px-4 py-6 text-start lg:px-16 lg:py-12"
      style={{ gap }}
    >
      {children}
    </div>
  )
}

interface HeroStatSlideProps {
  testId: string
  value: number
  label: string
  caption: string
  reducedMotion: boolean
}

function HeroStatSlide({ testId, value, label, caption, reducedMotion }: Readonly<HeroStatSlideProps>) {
  return (
    <SlideShell testId={testId}>
      <motion.span
        data-testid="wrapped-motion-part"
        data-wrapped-figure="primary"
        {...motionProps(0, reducedMotion)}
        style={heroNumeralStyle}
      >
        {value}
      </motion.span>
      <motion.span data-testid="wrapped-motion-part" {...motionProps(1, reducedMotion)} style={labelStyle}>
        {label}
      </motion.span>
      <motion.p data-testid="wrapped-motion-part" {...motionProps(2, reducedMotion)} style={captionStyle}>
        {caption}
      </motion.p>
    </SlideShell>
  )
}

function WeekdayColumns({ values, reducedMotion }: Readonly<{ values: (number | null)[]; reducedMotion: boolean }>) {
  const t = useTranslations()
  return (
    <motion.div
      data-testid="wrapped-motion-part"
      data-wrapped-figure="primary"
      {...motionProps(1, reducedMotion)}
      className="w-full"
    >
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
    <SlideShell testId="wrapped-slide-streak" gap={24}>
      <motion.div
        data-testid="wrapped-motion-part"
        {...motionProps(0, props.reducedMotion)}
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
      <div className="flex flex-col items-start" style={{ gap: 8 }}>
        <motion.span data-testid="wrapped-motion-part" data-wrapped-figure="primary"
          {...motionProps(1, props.reducedMotion)} style={streakNumeralStyle}>
          {props.value}
        </motion.span>
        <motion.span data-testid="wrapped-motion-part" {...motionProps(2, props.reducedMotion)} style={labelStyle}>
          {props.label}
        </motion.span>
        <motion.p data-testid="wrapped-motion-part" {...motionProps(3, props.reducedMotion)} style={captionStyle}>
          {props.caption}
        </motion.p>
      </div>
    </SlideShell>
  )
}

function WeekdayInterpretation({
  values,
  reducedMotion,
}: Readonly<{ values: (number | null)[]; reducedMotion: boolean }>) {
  const t = useTranslations()
  const reading = getWeeklyConsistencyReading(values)
  switch (reading.kind) {
    case 'thin':
      return (
        <>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(2, reducedMotion)} style={weekdayReadingStyle}>
            {t('wrapped.slides.consistency.thin')}
          </motion.p>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(3, reducedMotion)} style={weekdayNoteStyle}>
            {t('wrapped.slides.consistency.note')}
          </motion.p>
        </>
      )
    case 'even':
      return (
        <>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(2, reducedMotion)} style={weekdayReadingStyle}>
            {t('wrapped.slides.consistency.even')}
          </motion.p>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(3, reducedMotion)} style={weekdayNoteStyle}>
            {t('wrapped.slides.consistency.note')}
          </motion.p>
        </>
      )
    case 'compared': {
      const strongestWeekday = WRAPPED_WEEKDAY_KEYS[reading.strongestIndex]!
      return (
        <>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(2, reducedMotion)} style={weekdayReadingStyle}>
            {t('wrapped.slides.consistency.summary', {
              strong: t(`dates.daysLong.${strongestWeekday}`),
            })}
          </motion.p>
          <motion.p data-testid="wrapped-motion-part" {...motionProps(3, reducedMotion)} style={weekdayNoteStyle}>
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
  savedFileName: string | null
  reducedMotion: boolean
}

function WrappedShareSlide({ recap, captureRef, hasError, savedFileName, reducedMotion }: Readonly<WrappedShareSlideProps>) {
  const t = useTranslations()

  return (
    <div
      data-testid="wrapped-slide-share"
      className="flex flex-1 flex-col items-start justify-center px-4 py-6 text-start lg:px-16 lg:py-12"
      style={{ gap: 16 }}
    >
      <motion.h2 data-testid="wrapped-motion-part" {...motionProps(0, reducedMotion)} style={titleStyle}>
        {t('wrapped.slides.share.title')}
      </motion.h2>
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
          style={{ fontSize: 14 }}
        >
          <span style={{ color: 'var(--status-bad-text)' }}>{t('shareCard.shareError')}</span>
        </motion.p>
      )}

      <motion.p
        data-testid="wrapped-motion-part"
        {...motionProps(2, reducedMotion)}
        role="status"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          color: 'var(--fg-2)',
        }}
      >
        {!hasError && savedFileName ? t('shareCard.saved', { file: savedFileName }) : ''}
      </motion.p>

    </div>
  )
}
