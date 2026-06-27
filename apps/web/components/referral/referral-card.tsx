'use client'

import { useTranslations } from 'next-intl'
import { ChevronRight, UserPlus, X } from 'lucide-react'
import { useReferral } from '@/hooks/use-referral'

interface ReferralCardProps {
  onOpen: () => void
  /** When provided, the card shows a dismiss control instead of the chevron (the dismissible Today entry). */
  onDismiss?: () => void
}

/** Kit referral entry card: primary-tinted icon disc, title, progress line, and either a chevron or a dismiss control. */
export function ReferralCard({ onOpen, onDismiss }: Readonly<ReferralCardProps>) {
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
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="card-int flex w-full appearance-none items-center border-0 text-left"
          style={{ padding: '14px 16px', gap: 14, paddingRight: onDismiss ? 52 : 16 }}
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
          {!onDismiss && (
            <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-4)" />
          )}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('common.dismiss')}
            className="absolute flex appearance-none items-center justify-center rounded-full border-0 bg-transparent"
            style={{
              top: '50%',
              right: 14,
              transform: 'translateY(-50%)',
              width: 28,
              height: 28,
              cursor: 'pointer',
            }}
          >
            <X size={18} strokeWidth={1.8} color="var(--fg-4)" />
          </button>
        )}
      </div>
    </div>
  )
}
