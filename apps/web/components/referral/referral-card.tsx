'use client'

import { Gift, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useReferral } from '@/hooks/use-referral'

interface ReferralCardProps {
  onOpen: () => void
}

export function ReferralCard({ onOpen }: Readonly<ReferralCardProps>) {
  const t = useTranslations()
  const { stats, isLoading } = useReferral()

  return (
    <button
      className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 flex items-center gap-4 hover:bg-surface-elevated transition-all duration-150 group text-left"
      onClick={onOpen}
    >
      <div className="shrink-0 flex items-center justify-center bg-surface-elevated rounded-[var(--radius-lg)] p-3 group-hover:bg-border transition-all duration-150">
        <Gift className="size-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-text-primary">{t('referral.card.title')}</p>
        <p className="text-xs text-text-secondary mt-0.5">
          {isLoading && t('referral.card.hint')}
          {!isLoading && stats && t('referral.card.progress', {
            count: stats.successfulReferrals,
            max: stats.maxReferrals,
          })}
          {!isLoading && !stats && t('referral.card.hint')}
        </p>
      </div>
      <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
    </button>
  )
}
