'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Crown } from 'lucide-react'
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
            className="inline-flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-full bg-[var(--primary)] text-center shadow-[var(--primary-glow)] transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:bg-[var(--primary-pressed)] hover:shadow-[var(--primary-glow-hover)] active:translate-y-0 active:scale-[0.98]"
            style={{
              padding: '15px 26px',
              color: 'var(--fg-on-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 500,
            }}
            onClick={dismiss}
          >
            {t('trial.expired.subscribe')}
          </Link>
          <button
            type="button"
            className="inline-flex w-full cursor-pointer appearance-none items-center justify-center rounded-full border-0 bg-transparent text-center transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-card)] active:scale-[0.98]"
            onClick={dismiss}
            style={{
              padding: '14px 26px',
              boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {t('trial.expired.continueFree')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div
          aria-hidden="true"
          className="flex items-center justify-center self-center rounded-full"
          style={{
            width: 64,
            height: 64,
            marginTop: 2,
            background: 'rgba(var(--primary-rgb), 0.16)',
          }}
        >
          <Crown size={30} strokeWidth={1.8} className="text-[var(--primary-soft)]" />
        </div>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-2)',
            lineHeight: 1.5,
            margin: 0,
            textAlign: 'center',
            textWrap: 'pretty',
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
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
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
