'use client'

import { useState, useCallback, useMemo } from 'react'
import { Flag } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GoalList } from './goal-list'
import { SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
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
            className={`min-h-11 shrink-0 rounded-[var(--radius-lg)] border px-4 py-2 text-xs font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[var(--orbit-press-scale)] ${
              activeFilter === filter.key
                ? 'border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_0_var(--surface-top-highlight)]'
                : 'border-border-muted bg-surface-ground text-text-faded hover:border-border-emphasis hover:bg-surface hover:text-text-primary'
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
            <SkeletonCard key={`skeleton-${i}`} lines={3} className="bg-surface-ground shadow-[var(--shadow-sm)]" />
          ))}
        </div>
      )}

      {/* Goal list */}
      {isFetched && (
        <>
          {filteredGoals.length > 0 ? (
            <GoalList goals={filteredGoals} />
          ) : (
            <EmptyState
              icon={Flag}
              title={t('goals.empty')}
              description={t('goals.emptyHint')}
              className="rounded-[var(--radius-xl)] border border-border-muted bg-surface-ground shadow-[var(--shadow-sm)]"
            />
          )}
        </>
      )}
    </div>
  )
}
