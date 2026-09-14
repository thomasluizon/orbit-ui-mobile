'use client'

import type { ReactNode, Ref } from 'react'
import { useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  formatCompletionRate,
  getWeeklyConsistencyComparison,
  hasEnoughWeeklyConsistencyToCompare,
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

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

interface WrappedSlideProps {
  slide: WrappedSlideModel
  recap: Recap
  period: RecapSharePeriod
  displayName?: string
  captureRef: Ref<HTMLDivElement>
  shareError: boolean
}

export function WrappedSlide({ slide, recap, period, displayName, captureRef, shareError }: Readonly<WrappedSlideProps>) {
  const t = useTranslations()

  switch (slide.id) {
    case 'intro':
      return (
        <SlideShell testId="wrapped-slide-intro">
          <span style={eyebrowStyle}>{t('wrapped.slides.intro.eyebrow')}</span>
          <h1 data-wrapped-figure="primary" style={titleStyle}>{t(`wrapped.slides.intro.${period}`)}</h1>
          <p style={captionStyle}>{t('wrapped.slides.intro.caption')}</p>
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
        />
      )
    case 'consistency':
      return (
        <SlideShell testId="wrapped-slide-consistency">
          <span style={eyebrowStyle}>{t('wrapped.slides.consistency.eyebrow')}</span>
          <h2 style={titleStyle}>{t('wrapped.slides.consistency.title')}</h2>
          <WeekdayColumns values={slide.weeklyConsistency} />
          <WeekdayInterpretation values={slide.weeklyConsistency} />
        </SlideShell>
      )
    case 'streak':
      return (
        <HeroStatSlide
          testId="wrapped-slide-streak"
          eyebrow={t('wrapped.slides.streak.eyebrow')}
          value={slide.bestStreak}
          label={t('wrapped.slides.streak.label')}
          caption={t('wrapped.slides.streak.caption', { count: slide.currentStreak })}
        />
      )
    case 'topHabit':
      return (
        <SlideShell testId="wrapped-slide-topHabit">
          <span style={eyebrowStyle}>{t('wrapped.slides.topHabit.eyebrow')}</span>
          <span data-wrapped-figure="primary" style={{ fontSize: 72, lineHeight: 1 }} aria-hidden="true">
            {slide.habit.emoji ?? '⭐'}
          </span>
          <h2
            style={{
              ...titleStyle,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {slide.habit.name}
          </h2>
          <p style={captionStyle}>
            {t('wrapped.slides.topHabit.caption', {
              rate: formatCompletionRate(slide.habit.completionRate),
            })}
          </p>
        </SlideShell>
      )
    case 'goals':
      return (
        <SlideShell testId="wrapped-slide-goals">
          <span data-wrapped-figure="primary" style={heroNumeralStyle}>{slide.closedGoals}</span>
          <span style={labelStyle}>{t('progressScreen.sections.goals')}</span>
          {slide.closedGoals === 0 && <p style={captionStyle}>{t('wrapped.slides.goals.zero')}</p>}
        </SlideShell>
      )
    case 'share':
      return <WrappedShareSlide recap={recap} displayName={displayName} captureRef={captureRef} hasError={shareError} />
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
      className="stagger-enter flex flex-1 flex-col items-center justify-center text-center"
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
}

function HeroStatSlide({ testId, eyebrow, value, label, caption }: Readonly<HeroStatSlideProps>) {
  return (
    <SlideShell testId={testId}>
      <span style={eyebrowStyle}>{eyebrow}</span>
      <span data-wrapped-figure="primary" style={heroNumeralStyle}>{value}</span>
      <span style={labelStyle}>{label}</span>
      <p style={captionStyle}>{caption}</p>
    </SlideShell>
  )
}

function WeekdayColumns({ values }: Readonly<{ values: number[] }>) {
  const t = useTranslations()
  return (
    <div data-wrapped-figure="primary" className="w-full max-w-sm">
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
    </div>
  )
}

function WeekdayInterpretation({ values }: Readonly<{ values: number[] }>) {
  const t = useTranslations()
  if (!hasEnoughWeeklyConsistencyToCompare(values)) {
    return <p style={captionStyle}>{t('wrapped.slides.consistency.thin')}</p>
  }

  const { strongestIndex, weakestIndex } = getWeeklyConsistencyComparison(values)
  const strongestWeekday = WEEKDAY_KEYS[strongestIndex]!
  const weakestWeekday = WEEKDAY_KEYS[weakestIndex]!

  return (
    <>
      <p style={captionStyle}>
        {t('wrapped.slides.consistency.summary', {
          strong: t(`dates.daysShort.${strongestWeekday}`),
          weak: t(`dates.daysShort.${weakestWeekday}`),
        })}
      </p>
      <p style={captionStyle}>{t('wrapped.slides.consistency.note')}</p>
    </>
  )
}

interface WrappedShareSlideProps {
  recap: Recap
  displayName?: string
  captureRef: Ref<HTMLDivElement>
  hasError: boolean
}

function WrappedShareSlide({ recap, displayName, captureRef, hasError }: Readonly<WrappedShareSlideProps>) {
  const t = useTranslations()

  return (
    <div
      data-testid="wrapped-slide-share"
      className="stagger-enter flex flex-1 flex-col items-center justify-center"
      style={{ gap: 16, padding: '8px 24px 24px' }}
    >
      <span style={eyebrowStyle}>{t('wrapped.slides.share.eyebrow')}</span>
      <div data-wrapped-figure="primary">
        <ShareCard ref={captureRef} recap={recap} displayName={displayName} />
      </div>

      {hasError && (
        <p role="alert" style={{ textAlign: 'center', fontSize: 13, color: 'var(--status-bad-text)' }}>
          {t('shareCard.shareError')}
        </p>
      )}

    </div>
  )
}
