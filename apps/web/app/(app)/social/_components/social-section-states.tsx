'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonLine } from '@/components/ui/skeleton'

function SocialRowSkeleton() {
  return (
    <div className="flex items-center" style={{ gap: 12, padding: '12px 20px' }}>
      <div
        aria-hidden="true"
        className="skeleton-pulse shrink-0 rounded-full bg-[color-mix(in_srgb,var(--fg-1)_6%,transparent)]"
        style={{ width: 40, height: 40 }}
      />
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 6 }}>
        <SkeletonLine width="w-1/3" height="h-4" />
        <SkeletonLine width="w-2/3" height="h-3" />
      </div>
    </div>
  )
}

/** Loading placeholder for a social list section: avatar-and-two-line rows shaped like the final
 *  feed, friends, or buddies rows so nothing shifts when data lands (DESIGN.md: skeleton, not spinner). */
export function SocialSectionSkeleton() {
  const t = useTranslations()
  return (
    <div role="status" aria-label={t('common.loading')}>
      {Array.from({ length: 4 }, (_, index) => (
        <SocialRowSkeleton key={index} />
      ))}
    </div>
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
