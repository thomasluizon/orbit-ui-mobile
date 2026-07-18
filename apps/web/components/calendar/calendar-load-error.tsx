'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { AlertTriangle } from '@/components/ui/icons'

interface CalendarLoadErrorProps {
  onRetry: () => void
}

/** Calendar load-failure state: the shared centred lockup (alert glyph + message + retry pill),
 *  identical to the social-section and Today habit-list failures instead of a bespoke card. */
export function CalendarLoadError({ onRetry }: Readonly<CalendarLoadErrorProps>) {
  const t = useTranslations()
  return (
    <EmptyState
      icon={AlertTriangle}
      description={t('calendar.loadError')}
      action={{ label: t('common.retry'), onClick: onRetry, variant: 'secondary' }}
    />
  )
}
