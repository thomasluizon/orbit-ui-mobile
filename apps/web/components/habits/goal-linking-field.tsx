'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Goal } from '@orbit/shared/types/goal'
import { fetchJson } from '@/lib/api-fetch'
import { useUIStore } from '@/stores/ui-store'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

interface GoalLinkingFieldProps {
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
}

interface GoalsListResponse { items: Goal[] }

export function GoalLinkingField({ selectedGoalIds, atGoalLimit, onToggleGoal }: Readonly<GoalLinkingFieldProps>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { sheetRef, closeSheet } = useSheetHost()
  const setShowCreateGoalModal = useUIStore((state) => state.setShowCreateGoalModal)
  const { data: goals } = useQuery({
    queryKey: goalKeys.lists(),
    queryFn: async (): Promise<Goal[]> => {
      const response = await fetchJson<GoalsListResponse | Goal[]>(API.goals.list)
      return Array.isArray(response) ? response : response.items
    },
    staleTime: QUERY_STALE_TIMES.goals,
  })
  const activeGoals = useMemo(() => goals?.filter((goal) => goal.status === 'Active') ?? [], [goals])
  const selectedSet = useMemo(() => new Set(selectedGoalIds), [selectedGoalIds])
  const selectedGoals = activeGoals.filter((goal) => selectedSet.has(goal.id))
  const filteredGoals = activeGoals.filter((goal) => goal.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return (
    <>
      <ListRow inset={false} title={t('habits.form.goals')} value={t('habits.form.selectedCount', { count: selectedGoalIds.length })} onClick={() => setOpen(true)} />
      {selectedGoals.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-2">
          {selectedGoals.slice(0, 3).map((goal) => <span key={goal.id} className="chip max-w-full truncate">{goal.title}</span>)}
          {selectedGoals.length > 3 ? <span className="chip">{t('habits.form.moreSelected', { count: selectedGoals.length - 3 })}</span> : null}
        </div>
      ) : null}
      {open ? (
        <Sheet ref={sheetRef} open title={t('habits.form.goals')} onClose={() => { setOpen(false); setQuery('') }}>
          {activeGoals.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center" style={{ gap: 12 }}>
              <p className="text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noGoals')}</p>
              <button type="button" className="chip mt-2" onClick={() => closeSheet(() => setShowCreateGoalModal(true))}>{t('habits.form.createGoal')}</button>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {activeGoals.length >= 8 ? <p className="px-3 py-1 text-xs text-[var(--fg-3)]">{t('habits.form.availableCount', { count: activeGoals.length })}</p> : null}
              {activeGoals.length >= 21 ? <input value={query} onChange={(event) => setQuery(event.target.value)} className="form-input sticky top-0 z-10 mb-2" placeholder={t('habits.form.searchGoals')} /> : null}
              <div className={activeGoals.length >= 21 ? 'max-h-80 overflow-y-auto' : undefined}>
                {filteredGoals.map((goal) => {
                  const selected = selectedSet.has(goal.id)
                  return <button key={goal.id} type="button" aria-pressed={selected} disabled={!selected && atGoalLimit} className="flex min-h-12 w-full items-center justify-between rounded-[12px] px-3 text-left transition-colors duration-[240ms] hover:bg-[var(--bg-hover)] disabled:opacity-40" style={{ contentVisibility: activeGoals.length >= 21 ? 'auto' : 'visible' }} onClick={() => onToggleGoal(goal.id)}><span className="truncate">{goal.title}</span><span className="shrink-0 font-mono text-xs text-[var(--fg-3)]">{selected ? '✓' : `${Math.round(goal.progressPercentage)}%`}</span></button>
                })}
              </div>
            </div>
          )}
        </Sheet>
      ) : null}
    </>
  )
}
