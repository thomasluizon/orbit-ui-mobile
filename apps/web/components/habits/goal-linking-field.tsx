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

const VIRTUAL_ROW_HEIGHT = 48
const VIRTUAL_VIEWPORT_HEIGHT = 320
const VIRTUAL_OVERSCAN = 2

interface GoalLinkingFieldProps {
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
}

interface GoalsListResponse { items: Goal[] }

interface GoalPickerListProps {
  goals: Goal[]
  selectedIds: Set<string>
  atLimit: boolean
  onToggle: (goalId: string) => void
}

function GoalPickerRow({ goal, selected, disabled, onToggle }: Readonly<{
  goal: Goal
  selected: boolean
  disabled: boolean
  onToggle: (goalId: string) => void
}>) {
  return (
    <button type="button" aria-pressed={selected} disabled={disabled} className="orbit-list-row flex h-12 w-full items-center justify-between rounded-[12px] px-3 text-left active:scale-[0.96] disabled:opacity-40" onClick={() => onToggle(goal.id)}>
      <span className="truncate">{goal.title}</span>
      <span className="shrink-0 font-mono text-xs text-[var(--fg-3)]">{selected ? '✓' : `${Math.round(goal.progressPercentage)}%`}</span>
    </button>
  )
}

function GoalPickerList({ goals, selectedIds, atLimit, onToggle }: Readonly<GoalPickerListProps>) {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const filtered = goals.filter((goal) => goal.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const virtualized = goals.length >= 21
  const start = virtualized ? Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN) : 0
  const size = Math.ceil(VIRTUAL_VIEWPORT_HEIGHT / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2
  const visible = virtualized ? filtered.slice(start, start + size) : filtered
  const end = Math.min(filtered.length, start + visible.length)

  return (
    <div className="flex flex-col gap-1 p-2">
      {goals.length >= 8 ? <p className="px-3 py-1 text-xs text-[var(--fg-3)]">{t('habits.form.availableCount', { count: goals.length })}</p> : null}
      {virtualized ? <input value={query} onChange={(event) => { setQuery(event.target.value); setScrollTop(0) }} className="form-input mb-2" placeholder={t('habits.form.searchGoals')} /> : null}
      <div className={virtualized ? 'max-h-80 overflow-y-auto' : undefined} onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}>
        {virtualized && start > 0 ? <div aria-hidden="true" style={{ height: start * VIRTUAL_ROW_HEIGHT }} /> : null}
        {visible.map((goal) => {
          const selected = selectedIds.has(goal.id)
          return <GoalPickerRow key={goal.id} goal={goal} selected={selected} disabled={!selected && atLimit} onToggle={onToggle} />
        })}
        {virtualized && end < filtered.length ? <div aria-hidden="true" style={{ height: (filtered.length - end) * VIRTUAL_ROW_HEIGHT }} /> : null}
      </div>
    </div>
  )
}

export function GoalLinkingField({ selectedGoalIds, atGoalLimit, onToggleGoal }: Readonly<GoalLinkingFieldProps>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
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
        <Sheet ref={sheetRef} open title={t('habits.form.goals')} onClose={() => setOpen(false)}>
          {activeGoals.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center" style={{ gap: 12 }}>
              <p className="text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noGoals')}</p>
              <button type="button" className="chip mt-2" onClick={() => closeSheet(() => setShowCreateGoalModal(true))}>{t('habits.form.createGoal')}</button>
            </div>
          ) : (
            <GoalPickerList goals={activeGoals} selectedIds={selectedSet} atLimit={atGoalLimit} onToggle={onToggleGoal} />
          )}
        </Sheet>
      ) : null}
    </>
  )
}
