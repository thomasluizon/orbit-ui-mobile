'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Download, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  formatCompletionRate,
  type RecapSharePeriod,
  type WrappedSlide as WrappedSlideModel,
} from '@orbit/shared/utils'
import { ShareCard } from '@/components/share/share-card'
import { PillButton } from '@/components/ui/pill-button'
import { useShareCard } from '@/hooks/use-share-card'

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-2)',
}

const heroNumeralStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 76,
  lineHeight: 1,
  fontWeight: 700,
  letterSpacing: '-0.03em',
  color: 'var(--fg-1)',
}

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 17,
  fontWeight: 500,
  color: 'var(--fg-2)',
}

const captionStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--fg-2)',
  maxWidth: 280,
  textAlign: 'center',
}

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 34,
  lineHeight: 1.1,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: 'var(--fg-1)',
  textAlign: 'center',
}

interface WrappedSlideProps {
  slide: WrappedSlideModel
  recap: Recap
  period: RecapSharePeriod
  displayName?: string
}

/** Renders a single Orbit Wrapped story slide; the final `share` slide embeds the #197 ShareCard and its CTAs. */
export function WrappedSlide({ slide, recap, period, displayName }: Readonly<WrappedSlideProps>) {
  const t = useTranslations()

  switch (slide.id) {
    case 'intro':
      return (
        <SlideShell testId="wrapped-slide-intro">
          <span style={eyebrowStyle}>{t('wrapped.slides.intro.eyebrow')}</span>
          <h1 style={titleStyle}>{t(`wrapped.slides.intro.${period}`)}</h1>
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
          <WeeklyRhythm values={slide.weeklyConsistency} />
          <p style={captionStyle}>{t('wrapped.slides.consistency.caption')}</p>
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
          <span style={{ fontSize: 72, lineHeight: 1 }} aria-hidden="true">
            {slide.habit.emoji ?? '⭐'}
          </span>
          <h2 style={titleStyle}>{slide.habit.name}</h2>
          <p style={captionStyle}>
            {t('wrapped.slides.topHabit.caption', {
              rate: formatCompletionRate(slide.habit.completionRate),
            })}
          </p>
        </SlideShell>
      )
    case 'share':
      return <WrappedShareSlide recap={recap} displayName={displayName} />
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
      style={{ gap: 18, padding: '0 28px' }}
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
      <span style={heroNumeralStyle}>{value}</span>
      <span style={labelStyle}>{label}</span>
      <p style={captionStyle}>{caption}</p>
    </SlideShell>
  )
}

function WeeklyRhythm({ values }: Readonly<{ values: number[] }>) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 10,
        alignItems: 'end',
        height: 132,
        width: '100%',
        maxWidth: 320,
        marginTop: 6,
      }}
    >
      {values.map((value, index) => {
        const clamped = Math.max(0, Math.min(100, value))
        return (
          <div
            key={WEEKDAY_KEYS[index]}
            aria-hidden="true"
            style={{
              height: `${Math.max(8, (clamped / 100) * 132)}px`,
              borderRadius: 7,
              background: 'var(--primary)',
              opacity: clamped === 0 ? 0.25 : 1,
            }}
          />
        )
      })}
    </div>
  )
}

interface WrappedShareSlideProps {
  recap: Recap
  displayName?: string
}

function WrappedShareSlide({ recap, displayName }: Readonly<WrappedShareSlideProps>) {
  const t = useTranslations()
  const { captureRef, isSharing, hasError, canShareFiles, share, download } = useShareCard()

  function handleShare() {
    void share({
      shareTitle: t('shareCard.shareTitle'),
      shareText: t('shareCard.shareText'),
      url: recap.shareDeepLink,
    })
  }

  return (
    <div
      data-testid="wrapped-slide-share"
      className="flex flex-1 flex-col items-center justify-center"
      style={{ gap: 16, padding: '8px 22px 28px' }}
    >
      <span style={eyebrowStyle}>{t('wrapped.slides.share.eyebrow')}</span>
      <ShareCard ref={captureRef} recap={recap} displayName={displayName} />

      {hasError && (
        <p role="alert" style={{ textAlign: 'center', fontSize: 13, color: 'var(--status-bad)' }}>
          {t('shareCard.shareError')}
        </p>
      )}

      <div className="flex w-full" style={{ gap: 10, maxWidth: 360 }}>
        {canShareFiles && (
          <PillButton
            fullWidth
            busy={isSharing}
            disabled={isSharing}
            onClick={handleShare}
            leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
          >
            {t('shareCard.share')}
          </PillButton>
        )}
        <PillButton
          fullWidth
          variant={canShareFiles ? 'ghost' : 'primary'}
          busy={isSharing}
          disabled={isSharing}
          onClick={() => void download()}
          leading={
            <Download
              size={18}
              strokeWidth={1.8}
              color={canShareFiles ? 'var(--fg-1)' : 'var(--fg-on-primary)'}
            />
          }
        >
          {t('shareCard.download')}
        </PillButton>
      </div>
    </div>
  )
}
