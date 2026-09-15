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
    <div style={{ padding: '12px 16px 0' }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          color: 'var(--status-overdue-text)',
        }}
      >
        {t('goals.detail.loadError')}
      </p>
      {/* eslint-disable-next-line local/max-button-words -- ORB-68 owns this existing label. */}
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex appearance-none cursor-pointer items-center border-0 bg-transparent p-0 text-[var(--fg-1)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-2)]"
        style={{
          minHeight: 44,
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {t('common.retry')}
      </button>
    </div>
  )
}
