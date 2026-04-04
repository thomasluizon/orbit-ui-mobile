'use client'

import { Gift, ChevronRight } from 'lucide-react'
import { useReferral } from '@/hooks/use-referral'

// TODO: Replace with next-intl when i18n is wired up
const t = (key: string, params?: Record<string, string | number>) => {
  const strings: Record<string, string> = {
    'referral.card.title': 'Refer a Friend',
    'referral.card.hint': 'Share Orbit and earn rewards',
    'referral.card.progress': `${params?.count ?? 0} of ${params?.max ?? 0} referrals completed`,
  }
  return strings[key] ?? key
}

interface ReferralCardProps {
  onOpen: () => void
}

export function ReferralCard({ onOpen }: ReferralCardProps) {
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
