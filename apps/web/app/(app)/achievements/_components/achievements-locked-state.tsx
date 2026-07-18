'use client'

import { Lock } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { useTranslations } from 'next-intl'

export function AchievementsLockedState() {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center text-center" style={{ padding: '40px 24px', gap: 16 }}>
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
      <PillButton href="/upgrade" variant="primary" size="md" className="mt-2">
        {t('gamification.page.upgradeButton')}
      </PillButton>
    </div>
  )
}
