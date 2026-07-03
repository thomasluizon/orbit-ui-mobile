'use client'

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
        gap: 14,
        padding: '28px 18px',
        borderRadius: 18,
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <p className="text-sm text-[var(--fg-2)]" style={{ margin: 0 }}>
        {t('calendar.loadError')}
      </p>
      <PillButton variant="ghost" onClick={onRetry}>
        {t('common.retry')}
      </PillButton>
    </div>
  )
}
