'use client'

import { useState, useCallback, useMemo } from 'react'
import { Check, Filter } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GoalList } from './goal-list'
import { GoalsDesktopView } from './goals-desktop-view'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Popover } from '@/components/ui/popover'
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
  const isDesktop = useIsDesktop()
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)
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
          <Popover
            placement="bottom-end"
            className="min-w-[180px]"
            trigger={
              <button
                type="button"
                aria-label={t('goals.filters.statusFilter')}
                aria-pressed={activeFilter != null}
                className={`icon-btn text-[var(--fg-3)] hover:text-[var(--fg-1)] ${
                  activeFilter ? 'icon-btn-ring bg-[var(--bg-elev)] text-[var(--fg-1)]' : ''
                }`}
              >
                <Filter size={18} strokeWidth={1.8} />
              </button>
            }
          >
            {(close) => (
              <>
                {statusFilters.map((filter) => {
                  const active = activeFilter === filter.key
                  return (
                    <button
                      key={filter.key ?? 'all'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        handleFilterChange(filter.key)
                        close()
                      }}
                      className="w-full appearance-none border-0 bg-transparent cursor-pointer flex items-center transition-colors hover:bg-[var(--bg-sunk)]"
                      style={{
                        padding: '12px 12px',
                        gap: 10,
                        fontFamily: 'var(--font-sans)',
                        fontSize: 14,
                        fontWeight: active ? 600 : 500,
                        color: active ? 'var(--fg-1)' : 'var(--fg-2)',
                        textAlign: 'left',
                        borderRadius: 6,
                      }}
                    >
                      <span
                        className="inline-flex shrink-0 items-center justify-center"
                        style={{ width: 14, color: 'var(--primary)' }}
                      >
                        {active ? <Check size={14} strokeWidth={2} /> : null}
                      </span>
                      {filter.label}
                    </button>
                  )
                })}
              </>
            )}
          </Popover>
        </div>
      }
    >
      {t('goals.tab')}
    </SectionLabel>
  )

  if (isDesktop) {
    return (
      <div className="pt-1">
        {filterHeader}
        <GoalsDesktopView goals={filteredGoals} isFetched={isFetched} emptyState={emptyState} />
      </div>
    )
  }

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
