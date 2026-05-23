'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'
import { ProBadge } from '@/components/ui/pro-badge'
import { SkeletonLine } from '@/components/ui/skeleton'

interface HabitSummaryCardProps {
  date: string
}

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

  if (!hasProAccess || !aiSummaryEnabled) return null

  if (isLoading) {
    return (
      <div className="glass bg-[var(--bg-elev)] rounded-xl p-4 space-y-3 border border-[var(--hairline)] shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2">
          <Sparkles className="text-[var(--primary)] size-5 animate-pulse" />
          <span className="text-sm font-bold text-[var(--fg-1)]">
            {t('summary.title')}
          </span>
          <ProBadge />
        </div>
        <p className="text-sm text-[var(--fg-3)]">{t('summary.loading')}</p>
        <div className="space-y-2">
          <SkeletonLine />
          <SkeletonLine width="w-4/5" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[var(--bg-elev)] rounded-xl p-4 border border-[var(--hairline)]">
        <p className="text-[var(--fg-2)] text-sm">{t('summary.error')}</p>
        <button
          className="text-[var(--primary)] text-sm font-medium mt-2"
          onClick={() => refetch()}
        >
          {t('summary.retry')}
        </button>
      </div>
    )
  }

  if (summary) {
    return (
      <div className="glass bg-[var(--bg-elev)] rounded-xl p-4 border border-[var(--hairline)] shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2">
          <Sparkles className="text-[var(--primary)] size-5" />
          <span className="text-sm font-bold text-[var(--fg-1)]">
            {t('summary.title')}
          </span>
          <ProBadge />
        </div>
        <p className="text-sm text-[var(--fg-2)] mt-2 leading-relaxed">
          {summary}
        </p>
      </div>
    )
  }

  return null
}
