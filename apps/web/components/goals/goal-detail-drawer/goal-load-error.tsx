'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'

import { useTranslations } from 'next-intl'

interface GoalLoadErrorProps {
  onRetry: () => void
}

/** Detail-fetch failure notice with a retry affordance; the drawer keeps
 *  rendering the cached list data underneath. */
export function GoalLoadError({ onRetry }: Readonly<GoalLoadErrorProps>) {
  const t = useTranslations()

  return (
    <div style={{ padding: "var(--orbit-space-12) var(--orbit-space-16) var(--orbit-space-0)" }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          color: 'var(--status-overdue-text)',
        }}
      >
        {t('goals.detail.loadError')}
      </p>
      <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
    </div>
  )
}
