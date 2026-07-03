'use client'

import Link from 'next/link'
import { Lock, Sparkles } from 'lucide-react'
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
        <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
          <Sparkles size={18} strokeWidth={1.9} color="var(--primary)" aria-hidden="true" />
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
            <span className="flex min-w-0 items-center" style={{ gap: 10 }}>
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
            <Link
              href="/upgrade"
              className="touch-target-y shrink-0 rounded-full transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:bg-[var(--primary-pressed)] active:translate-y-0 active:scale-[0.96]"
              style={{
                padding: '9px 16px',
                background: 'var(--primary)',
                color: 'var(--fg-on-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
                boxShadow: 'var(--primary-glow)',
              }}
            >
              {t('common.upgrade')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
