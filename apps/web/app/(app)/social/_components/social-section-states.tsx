'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRow } from '@/components/ui/skeleton'
import { AlertTriangle } from '@/components/ui/icons'

/** Loading placeholder for a social list section: avatar-and-two-line rows shaped like the final
 *  feed, friends, or buddies rows so nothing shifts when data lands (DESIGN.md: skeleton, not spinner). */
export function SocialSectionSkeleton() {
  const t = useTranslations()
  return (
    <div role="status" aria-label={t('common.loading')}>
      {Array.from({ length: 4 }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  )
}

/** Retryable error state shown when a social section's query fails. */
export function SocialSectionLoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const t = useTranslations()
  return (
    <EmptyState
      icon={AlertTriangle}
      description={t('social.errors.loadFailed')}
      action={{
        label: t('common.retry'),
        onClick: onRetry,
        variant: 'secondary',
      }}
    />
  )
}
