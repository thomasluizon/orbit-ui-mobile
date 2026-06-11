'use client'

import { useTranslations } from 'next-intl'
import { ChevronRight, UserPlus } from 'lucide-react'
import { useReferral } from '@/hooks/use-referral'

interface ReferralCardProps {
  onOpen: () => void
}

/** Kit referral entry card: primary-tinted icon disc, title, progress line, chevron. */
export function ReferralCard({ onOpen }: Readonly<ReferralCardProps>) {
  const t = useTranslations()
  const { stats, isLoading } = useReferral()

  let desc = t('referral.card.hint')
  if (!isLoading && stats) {
    desc = t('referral.card.progress', {
      count: stats.successfulReferrals,
      max: stats.maxReferrals,
    })
  }

  return (
    <div style={{ padding: '6px 20px' }}>
      <button
        type="button"
        onClick={onOpen}
        className="card-int flex w-full appearance-none items-center border-0 text-left"
        style={{ padding: '14px 16px', gap: 14 }}
      >
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: 44,
            height: 44,
            background: 'rgba(var(--primary-rgb), 0.15)',
          }}
        >
          <UserPlus size={22} strokeWidth={1.8} color="var(--primary-soft)" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 3 }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {t('referral.card.title')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
            }}
          >
            {desc}
          </span>
        </span>
        <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-4)" />
      </button>
    </div>
  )
}
