'use client'

import { useTranslations } from 'next-intl'

interface GoalLoadErrorProps {
  onRetry: () => void
}

/** Detail-fetch failure notice with a retry affordance; the drawer keeps
 *  rendering the cached list data underneath. */
export function GoalLoadError({ onRetry }: Readonly<GoalLoadErrorProps>) {
  const t = useTranslations()

  return (
    <div style={{ padding: '10px 20px 0' }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--status-overdue-text)',
        }}
      >
        {t('goals.detail.loadError')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex appearance-none cursor-pointer items-center border-0 bg-transparent p-0 text-[var(--fg-1)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--primary)]"
        style={{
          minHeight: 44,
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {t('common.retry')}
      </button>
    </div>
  )
}
