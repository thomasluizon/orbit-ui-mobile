'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'
import { ProBadge } from '@/components/ui/pro-badge'
import { SkeletonLine } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitSummaryCardProps {
  date: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitSummaryCard({ date }: Readonly<HabitSummaryCardProps>) {
  const t = useTranslations()
  const uiLocale = useLocale()
  const { profile } = useProfile()

  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = profile?.aiSummaryEnabled ?? false
  // DB is the source of truth for language. Fall back to the UI locale only
  // until the profile hydrates, so pt-BR users never see an English summary.
  const locale = profile?.language ?? uiLocale

  const { summary, isLoading, error, refetch } = useSummary({
    date,
    locale,
    hasProAccess,
    aiSummaryEnabled,
  })

  // Don't render if user doesn't have pro or AI summary disabled
  if (!hasProAccess || !aiSummaryEnabled) return null

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="glass bg-surface rounded-xl p-4 space-y-3 border border-border-muted shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary size-5 animate-pulse" />
          <span className="text-sm font-bold text-text-primary">
            {t('summary.title')}
          </span>
          <ProBadge />
        </div>
        <p className="text-sm text-text-muted">{t('summary.loading')}</p>
        <div className="space-y-2">
          <SkeletonLine />
          <SkeletonLine width="w-4/5" />
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-surface rounded-xl p-4 border border-border-muted">
        <p className="text-text-secondary text-sm">{t('summary.error')}</p>
        <button
          className="text-primary text-sm font-medium mt-2"
          onClick={() => refetch()}
        >
          {t('summary.retry')}
        </button>
      </div>
    )
  }

  // Content state
  if (summary) {
    return (
      <div className="glass bg-surface rounded-xl p-4 border border-border-muted shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary size-5" />
          <span className="text-sm font-bold text-text-primary">
            {t('summary.title')}
          </span>
          <ProBadge />
        </div>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {summary}
        </p>
      </div>
    )
  }

  return null
}
