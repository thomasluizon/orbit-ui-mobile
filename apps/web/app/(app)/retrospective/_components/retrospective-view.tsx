'use client'

import { useTranslations } from 'next-intl'
import type { RetrospectivePeriod } from '@/hooks/use-retrospective'
import { Chip } from '@/components/ui/chip'
import { RetrospectiveCard } from './retrospective-card'
import { RetrospectiveEmptyState } from './retrospective-empty-state'

interface RetrospectiveViewProps {
  periods: { key: RetrospectivePeriod; label: string }[]
  activePeriod: RetrospectivePeriod
  retrospective: string | null
  isLoading: boolean
  hasError: boolean
  fromCache: boolean
  isOnline: boolean
  onSelectPeriod: (key: RetrospectivePeriod) => void
  onGenerate: () => void
}

export function RetrospectiveView({
  periods,
  activePeriod,
  retrospective,
  isLoading,
  hasError,
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

        {!isLoading && retrospective && (
          <RetrospectiveCard
            retrospective={retrospective}
            fromCache={fromCache}
            isLoading={isLoading}
            isOnline={isOnline}
            onRegenerate={onGenerate}
          />
        )}

        {!isLoading && hasError && (
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

        {!isLoading && !retrospective && !hasError && (
          <RetrospectiveEmptyState isOnline={isOnline} onGenerate={onGenerate} />
        )}
      </div>
    </>
  )
}
