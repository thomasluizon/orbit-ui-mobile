'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useTrialExpired } from '@/hooks/use-profile'
import { AppOverlay } from '@/components/ui/app-overlay'

const STORAGE_KEY = 'orbit_trial_expired_seen'

const PAUSED_FEATURES = [
  'trial.expired.subHabits',
  'trial.expired.aiChat',
  'trial.expired.goals',
  'trial.expired.aiSummary',
  'trial.expired.allColors',
] as const

export function TrialExpiredModal() {
  const t = useTranslations()
  const pathname = usePathname()
  const trialExpired = useTrialExpired()
  const [dismissed, setDismissed] = useState(false)
  const mounted = useIsClient()

  const isOpen =
    mounted &&
    pathname !== '/upgrade' &&
    !dismissed &&
    trialExpired &&
    !localStorage.getItem(STORAGE_KEY)

  function dismiss() {
    setDismissed(true)
    localStorage.setItem(STORAGE_KEY, '1')
  }

  if (!isOpen) return null

  return (
    <AppOverlay
      open={true}
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
      title={t('trial.expired.heading')}
      footer={
        <div className="flex flex-col" style={{ gap: 10 }}>
          <Link
            href="/upgrade"
            className="appearance-none cursor-pointer text-center"
            style={{
              padding: '12px 18px',
              background: 'var(--primary)',
              color: 'var(--fg-on-primary)',
              borderRadius: 10,
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 600,
            }}
            onClick={dismiss}
          >
            {t('trial.expired.subscribe')}
          </Link>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer text-center"
            onClick={dismiss}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
              padding: 6,
            }}
          >
            {t('trial.expired.continueFree')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--fg-3)',
          }}
        >
          {t('trial.expired.eyebrow')}
        </div>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--fg-2)',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {t('trial.expired.subtitleQuiet')}
        </p>
        <div>
          {PAUSED_FEATURES.map((featureKey) => (
            <div
              key={featureKey}
              className="flex items-baseline justify-between"
              style={{
                padding: '11px 0',
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 15,
                  color: 'var(--fg-1)',
                }}
              >
                {t(featureKey)}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontStyle: 'italic',
                  color: 'var(--fg-3)',
                }}
              >
                {t('trial.expired.paused')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppOverlay>
  )
}
