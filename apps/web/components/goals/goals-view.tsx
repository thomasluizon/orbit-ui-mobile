'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { Filter } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { GoalList } from './goal-list'
import { SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu } from '@/components/ui/menu'
import { SectionLabel } from '@/components/ui/section-label'
import { useGoals } from '@/hooks/use-goals'
import { useUIStore } from '@/stores/ui-store'
import type { GoalStatus } from '@orbit/shared/types/goal'

interface StatusFilter {
  key: GoalStatus | null
  label: string
}

export function GoalsView() {
  const t = useTranslations()
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)
  const [activeFilter, setActiveFilter] = useState<GoalStatus | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterAnchorRef = useRef<HTMLButtonElement>(null)

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

  const activeFilterLabel =
    activeFilter != null
      ? statusFilters.find((filter) => filter.key === activeFilter)?.label
      : null

  const emptyState =
    activeFilter != null ? (
      <EmptyState
        title={t('goals.filters.emptyFiltered')}
        description={t('goals.filters.emptyFilteredHint')}
        action={{
          label: t('goals.filters.clearFilter'),
          onClick: () => handleFilterChange(null),
          variant: 'secondary',
        }}
      />
    ) : (
      <EmptyState
        title={t('goals.empty')}
        description={t('goals.emptyHint')}
        action={{
          label: t('goals.create'),
          onClick: () => setShowCreateGoalModal(true),
        }}
      />
    )

  const filterHeader = (
    <SectionLabel
      top={16}
      bottom={12}
      trailing={
        <div className="flex items-center" style={{ gap: 8 }}>
          {activeFilterLabel && (
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--fg-2)',
              }}
            >
              {activeFilterLabel}
            </span>
          )}
          <button
            ref={filterAnchorRef}
            type="button"
            aria-label={t('goals.filters.statusFilter')}
            aria-pressed={activeFilter != null}
            aria-expanded={filterOpen}
            className={`icon-btn text-[var(--fg-3)] hover:text-[var(--fg-1)] ${
              activeFilter ? 'icon-btn-ring bg-[var(--bg-elev)] text-[var(--fg-1)]' : ''
            }`}
            onClick={() => setFilterOpen((current) => !current)}
          >
            <Filter size={18} strokeWidth={1.8} />
          </button>
          <Menu
            open={filterOpen}
            anchorRef={filterAnchorRef}
            title={t('goals.filters.statusFilter')}
            items={statusFilters.map((filter) => ({
              id: filter.key ?? 'all',
              label: filter.label,
              badge: activeFilter === filter.key ? t('common.done') : undefined,
            }))}
            onClose={() => setFilterOpen(false)}
            onSelect={(id) => handleFilterChange(id === 'all' ? null : id as GoalStatus)}
          />
        </div>
      }
    >
      {t('goals.tab')}
    </SectionLabel>
  )

  return (
    <div className="pt-1">
      {filterHeader}

      <div className="px-5">
        {!isFetched && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={`skeleton-${i}`} lines={3} className="rounded-[18px]" />
            ))}
          </div>
        )}

        {isFetched && (
          <>{filteredGoals.length > 0 ? <GoalList goals={filteredGoals} /> : emptyState}</>
        )}
      </div>
    </div>
  )
}
