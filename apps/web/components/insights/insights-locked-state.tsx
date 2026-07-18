'use client'

import { Lock } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { useTranslations } from 'next-intl'

/** Route-level Pro gate shown on the Insights surface when the user lacks Pro access. */
export function InsightsLockedState() {
  const t = useTranslations()

  return (
    <div
      className="flex min-h-[70dvh] flex-col items-center justify-center text-center"
      style={{ padding: '40px 24px', gap: 16 }}
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{ width: 56, height: 56, background: 'var(--bg-elev)' }}
      >
        <Lock size={28} strokeWidth={1.8} className="text-[var(--fg-3)]" />
      </span>

      <h1 className="t-h2 text-balance">{t('insights.lockedTitle')}</h1>
      <p className="t-secondary max-w-[320px] text-balance">{t('insights.lockedDescription')}</p>

      <PillButton href="/upgrade" variant="primary" size="md" className="mt-2">
        {t('upgrade.title')}
      </PillButton>
    </div>
  )
}
