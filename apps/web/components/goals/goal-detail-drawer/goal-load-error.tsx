'use client'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { AlertTriangle } from '@/components/ui/icons'

interface GoalLoadErrorProps {
  onRetry: () => void
}

/** Inline detail-fetch failure notice — the drawer keeps rendering the cached list data underneath,
 *  so this stays an inline row rather than the centred lockup, but shares its vocabulary: the neutral
 *  alert glyph, secondary body copy, and a ghost retry pill. */
export function GoalLoadError({ onRetry }: Readonly<GoalLoadErrorProps>) {
  const t = useTranslations()

  return (
    <div className="flex items-start" style={{ gap: 12, padding: '8px 20px 0' }}>
      <AlertTriangle
        size={18}
        strokeWidth={1.6}
        className="shrink-0 text-[var(--fg-3)]"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col items-start" style={{ gap: 8 }}>
        <p className="t-secondary" style={{ margin: 0 }}>
          {t('goals.detail.loadError')}
        </p>
        <PillButton variant="ghost" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </PillButton>
      </div>
    </div>
  )
}
