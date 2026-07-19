'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Trophy } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'

/** Tappable card on the Social screen that routes into the dedicated challenges surface. */
export function ChallengesEntryCard() {
  const t = useTranslations()
  const router = useRouter()

  return (
    <div style={{ padding: '8px 20px 8px' }}>
      <button
        type="button"
        onClick={() => router.push('/social/challenges')}
        className="card-int flex w-full appearance-none items-center border-0 text-left"
        style={{ gap: 14, padding: 16 }}
      >
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: 'rgba(var(--primary-rgb), 0.14)',
            color: 'var(--primary-soft)',
          }}
        >
          <Trophy size={22} strokeWidth={1.8} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
          <span
            style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 600, color: 'var(--fg-1)' }}
          >
            {t('challenges.entryCard.title')}
          </span>
          <span
            style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.4, color: 'var(--fg-3)' }}
          >
            {t('challenges.entryCard.description')}
          </span>
        </span>
        <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-4)" />
      </button>
    </div>
  )
}
