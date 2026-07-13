'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'

const upgradeLinkStyle = {
  marginTop: 8,
  padding: '15px 26px',
  borderRadius: 999,
  background: 'var(--primary)',
  color: 'var(--fg-on-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  fontWeight: 500,
  textDecoration: 'none',
  boxShadow: 'var(--primary-glow)',
}

export function AchievementsLockedState() {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center text-center" style={{ padding: '40px 24px', gap: 14 }}>
      <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{ width: 56, height: 56, background: 'var(--bg-field)' }}
      >
        <Lock size={28} strokeWidth={1.4} className="text-[var(--fg-3)]" />
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          fontWeight: 500,
          color: 'var(--fg-1)',
        }}
      >
        {t('gamification.page.lockedTitle')}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          color: 'var(--fg-3)',
          lineHeight: 1.55,
        }}
      >
        {t('gamification.page.lockedDescription')}
      </span>
      <Link
        href="/upgrade"
        className="inline-flex items-center justify-center transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:bg-[var(--primary-pressed)] active:translate-y-0 active:scale-[0.98]"
        style={upgradeLinkStyle}
      >
        {t('gamification.page.upgradeButton')}
      </Link>
    </div>
  )
}
