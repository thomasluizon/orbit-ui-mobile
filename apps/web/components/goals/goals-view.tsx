'use client'

import { useState, useCallback, useMemo } from 'react'
import { Check, Filter } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GoalList } from './goal-list'
import { SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Popover } from '@/components/ui/popover'
import { useGoals } from '@/hooks/use-goals'
import type { GoalStatus } from '@orbit/shared/types/goal'

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
    <div className="pt-4 px-5">
      <div className="flex justify-end pb-3">
        <Popover
          placement="bottom-end"
          className="min-w-[180px]"
          trigger={
            <button
              type="button"
              aria-label={t('goals.filters.statusFilter')}
              aria-pressed={activeFilter != null}
              className="appearance-none border-0 cursor-pointer inline-flex items-center justify-center shrink-0"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                color: activeFilter ? 'var(--fg-1)' : 'var(--fg-3)',
                background: activeFilter ? 'var(--bg-elev)' : 'transparent',
                boxShadow: activeFilter ? 'inset 0 0 0 1px var(--hairline-strong)' : 'none',
              }}
            >
              <Filter size={16} strokeWidth={1.6} />
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
                      padding: '8px 10px',
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

      {!isFetched && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={`skeleton-${i}`} lines={3} className="bg-[var(--bg-sunk)] shadow-[var(--shadow-sm)]" />
          ))}
        </div>
      )}

      {isFetched && (
        <>
          {filteredGoals.length > 0 ? (
            <GoalList goals={filteredGoals} />
          ) : (
            <EmptyState
              title={t('goals.empty')}
              description={t('goals.emptyHint')}
            />
          )}
        </>
      )}
    </div>
  )
}
