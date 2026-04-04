'use client'

import { useState, useCallback, useMemo } from 'react'
import { Flag } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GoalList } from './goal-list'
import { useGoals } from '@/hooks/use-goals'
import type { GoalStatus } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StatusFilter {
  key: GoalStatus | null
  label: string
}

export function GoalsView() {
  const t = useTranslations()
  const [activeFilter, setActiveFilter] = useState<GoalStatus | null>(null)

  const { data, isFetched } = useGoals(activeFilter)

  const statusFilters = useMemo(
    (): StatusFilter[] => [
      { key: null, label: t('goals.filters.all') },
      { key: 'Active', label: t('goals.filters.active') },
      { key: 'Completed', label: t('goals.filters.completed') },
      { key: 'Abandoned', label: t('goals.filters.abandoned') },
    ],
    [t],
  )

  const filteredGoals = useMemo(() => {
    if (!data) return []
    if (!activeFilter) return data.allGoals
    return data.allGoals.filter((g) => g.status === activeFilter)
  }, [data, activeFilter])

  const handleFilterChange = useCallback((status: GoalStatus | null) => {
    setActiveFilter(status)
  }, [])

  return (
    <div className="pt-4">
      {/* Filter tabs */}
      <div className="flex gap-2 pb-4 overflow-x-auto">
        {statusFilters.map((filter) => (
          <button
            key={filter.key ?? 'all'}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-150 shrink-0 ${
              activeFilter === filter.key
                ? 'bg-primary text-white'
                : 'bg-surface border border-border text-text-faded hover:text-text-primary'
            }`}
            onClick={() => handleFilterChange(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {!isFetched && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={`skeleton-${i}`}
              className="bg-surface rounded-[var(--radius-xl)] p-5 border border-border-muted shadow-[var(--shadow-sm)]"
            >
              <div className="space-y-3">
                <div className="h-5 w-2/3 bg-surface-elevated rounded animate-pulse" />
                <div className="h-3 w-full bg-surface-elevated rounded animate-pulse" />
                <div className="h-2 w-full bg-surface-elevated rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Goal list */}
      {isFetched && (
        <>
          {filteredGoals.length > 0 ? (
            <GoalList goals={filteredGoals} />
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="size-16 rounded-full bg-surface-ground border border-border-muted flex items-center justify-center mb-4">
                <Flag className="size-8 text-text-muted" />
              </div>
              <p className="text-text-secondary font-medium mb-1">
                {t('goals.empty')}
              </p>
              <p className="text-text-muted text-sm">
                {t('goals.emptyHint')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
