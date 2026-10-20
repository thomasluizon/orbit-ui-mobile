'use client'

import { SPACING } from '@orbit/shared/theme'


import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

interface CalendarLoadErrorProps {
  onRetry: () => void
}

/** Kit-card load-failure state shared by the calendar views: message + ghost retry pill. */
export function CalendarLoadError({ onRetry }: Readonly<CalendarLoadErrorProps>) {
  const t = useTranslations()
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{
        gap: 12,
        padding: "var(--orbit-space-24) var(--orbit-space-16)",
        borderRadius: 18,
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <p className="text-sm text-[var(--fg-2)]" style={{ margin: SPACING.s0 }}>
        {t('calendar.loadError')}
      </p>
      <PillButton variant="ghost" onClick={onRetry}>
        {t('common.retry')}
      </PillButton>
    </div>
  )
}
