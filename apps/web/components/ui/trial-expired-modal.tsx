'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Crown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useTrialExpired } from '@/hooks/use-profile'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'

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
  const router = useRouter()
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
          <PillButton
            variant="primary"
            fullWidth
            onClick={() => {
              dismiss()
              router.push('/upgrade')
            }}
          >
            {t('trial.expired.subscribe')}
          </PillButton>
          <PillButton variant="ghost" fullWidth onClick={dismiss}>
            {t('trial.expired.continueFree')}
          </PillButton>
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
          {PAUSED_FEATURES.map((featureKey, index) => (
            <div
              key={featureKey}
              className="flex items-baseline justify-between"
              style={{
                padding: '11px 0',
                borderBottom:
                  index === PAUSED_FEATURES.length - 1
                    ? undefined
                    : '1px solid var(--hairline)',
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
