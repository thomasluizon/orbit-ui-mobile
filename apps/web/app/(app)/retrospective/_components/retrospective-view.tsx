'use client'

import { useTranslations } from 'next-intl'
import type { RetrospectivePeriod } from '@/hooks/use-retrospective'
import type { RetrospectiveResponse } from '@orbit/shared/utils/retrospective'
import { AlertTriangle } from '@/components/ui/icons'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'
import { RetrospectiveDashboard } from './retrospective-dashboard'
import { RetrospectiveEmptyState } from './retrospective-empty-state'
import { RetrospectiveNoDataState } from './retrospective-no-data-state'

function StatTileSkeleton() {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-[18px] bg-[var(--bg-card)]"
      style={{ padding: '20px 12px 16px', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
      aria-hidden="true"
    >
      <SkeletonLine width="w-7" height="h-7" />
      <SkeletonLine width="w-10" height="h-6" />
      <SkeletonLine width="w-12" height="h-3" />
    </div>
  )
}

/** Loading placeholder shaped like the retrospective dashboard — a header line, the three
 *  stat tiles, then two narrative cards — so nothing shifts when the generated recap lands
 *  (DESIGN.md States: the skeleton is shaped like the final layout, never a centered spinner). */
function RetrospectiveLoadingSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex flex-col"
      style={{ gap: 12, padding: '16px 20px 24px' }}
    >
      <SkeletonLine width="w-1/3" height="h-3" />
      <div className="flex" style={{ gap: 8 }}>
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </div>
  )
}

interface RetrospectiveViewProps {
  periods: { key: RetrospectivePeriod; label: string }[]
  activePeriod: RetrospectivePeriod
  data: RetrospectiveResponse | null
  isLoading: boolean
  errorMessage: string | null
  noData: boolean
  fromCache: boolean
  isOnline: boolean
  onSelectPeriod: (key: RetrospectivePeriod) => void
  onGenerate: () => void
}

export function RetrospectiveView({
  periods,
  activePeriod,
  data,
  isLoading,
  errorMessage,
  noData,
  fromCache,
  isOnline,
  onSelectPeriod,
  onGenerate,
}: Readonly<RetrospectiveViewProps>) {
  const t = useTranslations()

  return (
    <>
      {!isOnline && (
        <div style={{ padding: '16px 20px 0' }}>
          <OfflineUnavailableState
            title={t('offline.title')}
            description={t('offline.description')}
            compact
          />
        </div>
      )}

      <div
        className="flex items-center"
        style={{
          gap: 8,
          padding: '12px 20px',
          borderBottom: '1px solid var(--hairline)',
          overflowX: 'auto',
        }}
      >
        {periods.map((p) => (
          <Chip
            key={p.key}
            active={activePeriod === p.key}
            onClick={() => onSelectPeriod(p.key)}
            ariaLabel={p.label}
          >
            {p.label}
          </Chip>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && <RetrospectiveLoadingSkeleton label={t('retrospective.generating')} />}

        {!isLoading && data && (
          <RetrospectiveDashboard
            data={data}
            fromCache={fromCache}
            isOnline={isOnline}
            onRegenerate={onGenerate}
          />
        )}

        {!isLoading && !data && noData && (
          <RetrospectiveNoDataState isOnline={isOnline} onGenerate={onGenerate} />
        )}

        {!isLoading && !data && !noData && errorMessage && (
          <EmptyState
            icon={AlertTriangle}
            description={errorMessage || t('retrospective.error')}
            action={{
              label: t('common.retry'),
              onClick: onGenerate,
              disabled: !isOnline,
              variant: 'secondary',
            }}
          />
        )}

        {!isLoading && !data && !noData && !errorMessage && (
          <RetrospectiveEmptyState isOnline={isOnline} onGenerate={onGenerate} />
        )}
      </div>
    </>
  )
}
