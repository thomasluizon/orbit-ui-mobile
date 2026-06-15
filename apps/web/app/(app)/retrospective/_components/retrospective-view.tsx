'use client'

import { useTranslations } from 'next-intl'
import type { RetrospectivePeriod } from '@/hooks/use-retrospective'
import type { RetrospectiveResponse } from '@orbit/shared/utils/retrospective'
import { Chip } from '@/components/ui/chip'
import { RetrospectiveDashboard } from './retrospective-dashboard'
import { RetrospectiveEmptyState } from './retrospective-empty-state'
import { RetrospectiveNoDataState } from './retrospective-no-data-state'

interface RetrospectiveViewProps {
  periods: { key: RetrospectivePeriod; label: string }[]
  activePeriod: RetrospectivePeriod
  data: RetrospectiveResponse | null
  isLoading: boolean
  hasError: boolean
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
  hasError,
  noData,
  fromCache,
  isOnline,
  onSelectPeriod,
  onGenerate,
}: Readonly<RetrospectiveViewProps>) {
  const t = useTranslations()

  return (
    <>
      <div
        className="flex items-center"
        style={{
          gap: 6,
          padding: '10px 20px 14px',
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
        {isLoading && (
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span
              className="t-secondary"
              style={{ color: 'var(--fg-3)', textAlign: 'center' }}
            >
              {t('retrospective.generating')}
            </span>
            <div className="animate-pulse" style={{ width: '60%', height: 7, background: 'var(--bg-card)', borderRadius: 4 }} />
            <div className="animate-pulse" style={{ width: '80%', height: 7, background: 'var(--bg-card)', borderRadius: 4 }} />
            <div className="animate-pulse" style={{ width: '40%', height: 7, background: 'var(--bg-card)', borderRadius: 4 }} />
          </div>
        )}

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

        {!isLoading && !data && !noData && hasError && (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--status-bad)' }}>
              {t('retrospective.error')}
            </p>
            <button
              type="button"
              onClick={onGenerate}
              className="chip"
              style={{ marginTop: 10 }}
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {!isLoading && !data && !noData && !hasError && (
          <RetrospectiveEmptyState isOnline={isOnline} onGenerate={onGenerate} />
        )}
      </div>
    </>
  )
}
