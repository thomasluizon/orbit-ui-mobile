'use client'

import { Check } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'

export function SupportSuccessState() {
  const t = useTranslations()

  return (
    <div
      className="flex flex-col items-center text-center animate-scale-in"
      style={{ padding: '48px 24px', gap: 16 }}
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'rgba(var(--primary-rgb), 0.15)',
        }}
        aria-hidden="true"
      >
        <Check size={34} strokeWidth={1.8} color="var(--primary-soft)" />
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: 'var(--fg-1)',
        }}
      >
        {t('profile.support.success')}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          lineHeight: 1.5,
          color: 'var(--fg-2)',
          maxWidth: 320,
          textWrap: 'pretty',
        }}
      >
        {t('profile.support.successHint')}
      </span>
    </div>
  )
}
