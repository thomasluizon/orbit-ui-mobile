'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'

/** Route-level Pro gate shown on the Insights surface when the user lacks Pro access. */
export function InsightsLockedState() {
  const t = useTranslations()

  return (
    <div
      className="flex min-h-[70dvh] flex-col items-center justify-center text-center"
      style={{ padding: '40px 24px', gap: 14 }}
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

      <Link
        href="/upgrade"
        className="inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:bg-[var(--primary-pressed)] active:translate-y-0 active:scale-[0.98]"
        style={{
          marginTop: 8,
          padding: '15px 26px',
          background: 'var(--primary)',
          color: 'var(--fg-on-primary)',
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        {t('upgrade.title')}
      </Link>
    </div>
  )
}
