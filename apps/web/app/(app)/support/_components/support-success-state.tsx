'use client'

import { Check } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

export function SupportSuccessState({ email, onBack }: Readonly<{ email: string; onBack: () => void }>) {
  const t = useTranslations()

  return (
    <div
      className="flex min-w-0 flex-col items-start animate-scale-in"
      style={{ padding: '48px 24px', gap: 16 }}
    >
      <span
        className="flex items-center justify-center rounded-full bg-[var(--fg-1)] text-[var(--bg)]"
        style={{
          width: 44,
          height: 44,
        }}
        aria-hidden="true"
      >
        <Check size={24} strokeWidth={1.8} />
      </span>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 500,
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          color: 'var(--fg-1)',
          textWrap: 'pretty',
        }}
      >
        {t('profile.support.success')}
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          lineHeight: 1.55,
          color: 'var(--fg-2)',
          textWrap: 'pretty',
          overflowWrap: 'anywhere',
        }}
      >
        {t('profile.support.successHint', { email })}
      </p>
      <PillButton variant="ghost" onClick={onBack}>
        {t('profile.support.backToAbout')}
      </PillButton>
    </div>
  )
}
