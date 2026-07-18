'use client'

import { Gift, Lock } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { useTranslations } from 'next-intl'
import type { NextRewardCarrotState } from '@orbit/shared/utils'

interface NextRewardCarrotProps {
  carrot: NextRewardCarrotState | null
}

/** "Next reward" upgrade nudge shown to free-unlocked users: next free level plus a Pro teaser. */
export function NextRewardCarrot({ carrot }: Readonly<NextRewardCarrotProps>) {
  const t = useTranslations()

  if (!carrot) return null

  return (
    <div className="px-5" style={{ marginTop: 24 }}>
      <div
        className="rounded-[18px]"
        style={{
          padding: 18,
          background: 'rgba(var(--primary-rgb), 0.08)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)',
        }}
      >
        <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
          <Gift size={18} strokeWidth={1.9} color="var(--primary)" aria-hidden="true" />
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--fg-2)',
            }}
          >
            {t('gamification.carrot.title')}
          </span>
        </div>

        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            fontWeight: 500,
            lineHeight: 1.4,
            color: 'var(--fg-1)',
          }}
        >
          {t('gamification.carrot.toNextLevel', {
            xp: carrot.xpToNextLevel,
            level: carrot.nextLevel,
          })}
        </span>

        {carrot.showProTeaser && (
          <div
            className="flex items-center justify-between"
            style={{ gap: 12, marginTop: 16 }}
          >
            <span className="flex min-w-0 items-center" style={{ gap: 8 }}>
              <Lock size={16} strokeWidth={1.9} color="var(--primary)" aria-hidden="true" />
              <span className="min-w-0">
                <span
                  className="block"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--fg-1)',
                  }}
                >
                  {t('gamification.carrot.proTeaser.title')}
                </span>
                <span
                  className="block overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: 'var(--fg-3)',
                  }}
                >
                  {t('gamification.carrot.proTeaser.achievements')}
                </span>
              </span>
            </span>
            <PillButton href="/upgrade" variant="primary" size="sm" className="shrink-0">
              {t('common.upgrade')}
            </PillButton>
          </div>
        )}
      </div>
    </div>
  )
}
