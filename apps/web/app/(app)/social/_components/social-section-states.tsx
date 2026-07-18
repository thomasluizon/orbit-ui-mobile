'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'

/** Centered spinner shown while a social section's query is loading. */
export function SocialSectionSpinner() {
  const t = useTranslations()
  return (
    <output
      aria-label={t('common.loading')}
      className="flex justify-center"
      style={{ padding: '48px 0' }}
    >
      <Loader2 className="size-[22px] animate-spin" style={{ color: 'var(--primary)' }} />
    </output>
  )
}

/** Retryable error state shown when a social section's query fails. */
export function SocialSectionLoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const t = useTranslations()
  return (
    <EmptyState
      description={t('social.errors.loadFailed')}
      action={{
        label: t('common.retry'),
        onClick: onRetry,
        variant: 'secondary',
      }}
    />
  )
}
