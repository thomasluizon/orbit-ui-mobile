'use client'

import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PersonalText } from '@/components/ui/personal-text'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Goal } from '@orbit/shared/types/goal'
import { fetchJson } from '@/lib/api-fetch'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { CreateGoalFromHabitSheet } from './create-goal-from-habit-sheet'
import { revealFocusedControl } from '@/lib/focus-scroll'

const VIRTUAL_ROW_HEIGHT = 120
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
    <div data-picker-row="" className="flex flex-col rounded-[12px] px-3 py-2" style={{ minHeight: 'max(120px, calc(2.8em + 72px))' }}>
      <button type="button" aria-label={goal.title} aria-pressed={selected} disabled={disabled} className="orbit-list-row-body flex min-h-12 w-full min-w-0 items-center rounded-[12px] px-2 py-1 text-left active:scale-[0.96] disabled:opacity-40" onClick={() => onToggle(goal.id)}>
        <PersonalText className="w-full leading-[1.4]">{goal.title}</PersonalText>
      </button>
      <div className="flex items-center justify-between gap-2"><span aria-hidden={selected || undefined} className="font-mono text-xs text-[var(--fg-2)]">{selected ? '✓' : `${Math.round(goal.progressPercentage)}%`}</span><PersonalTextDetails iconOnly>{goal.title}</PersonalTextDetails></div>
    </div>
  )
}

function GoalPickerList({ goals, selectedIds, atLimit, onToggle }: Readonly<GoalPickerListProps>) {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [rowHeight, setRowHeight] = useState(VIRTUAL_ROW_HEIGHT)
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => {
      const height = element.querySelector('[data-picker-row]')?.getBoundingClientRect().height
      if (height) setRowHeight(height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const row = element.querySelector('[data-picker-row]')
    if (row) observer.observe(row)
    return () => observer.disconnect()
  }, [])
  const filtered = goals.filter((goal) => goal.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const virtualized = goals.length >= 21
  const start = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN) : 0
  const size = Math.ceil(VIRTUAL_VIEWPORT_HEIGHT / rowHeight) + VIRTUAL_OVERSCAN * 2
  const visible = virtualized ? filtered.slice(start, start + size) : filtered
  const end = Math.min(filtered.length, start + visible.length)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
      {goals.length >= 8 ? <p className="px-3 py-1 text-xs text-[var(--fg-3)]">{t('habits.form.availableCount', { count: goals.length })}</p> : null}
      {virtualized ? <input value={query} onChange={(event) => { setQuery(event.target.value); setScrollTop(0); if (scrollRef.current) scrollRef.current.scrollTop = 0 }} className="form-input mb-2" aria-label={t('habits.form.searchGoals')} placeholder={t('habits.form.searchGoals')} /> : null}
      <div ref={scrollRef} data-focus-inset="" onFocusCapture={revealFocusedControl} className={virtualized ? 'min-h-0 max-h-80 overflow-y-auto' : undefined} onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}>
        {virtualized && start > 0 ? <div aria-hidden="true" style={{ height: start * rowHeight }} /> : null}
        {visible.map((goal) => {
          const selected = selectedIds.has(goal.id)
          return <GoalPickerRow key={goal.id} goal={goal} selected={selected} disabled={!selected && atLimit} onToggle={onToggle} />
        })}
        {virtualized && end < filtered.length ? <div aria-hidden="true" style={{ height: (filtered.length - end) * rowHeight }} /> : null}
      </div>
    </div>
  )
}

export function GoalLinkingField({ selectedGoalIds, atGoalLimit, onToggleGoal }: Readonly<GoalLinkingFieldProps>) {
  const t = useTranslations()
  const [open, setOpen] = useAccountScopedState(false)
  const [creating, setCreating] = useAccountScopedState(false)
  const { sheetRef, closeSheet } = useSheetHost()
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
  const openCreateGoal = () => closeSheet(() => {
    setOpen(false)
    setCreating(true)
  })

  return (
    <>
      <ListRow title={t('habits.form.goals')} value={t('habits.form.selectedCount', { count: selectedGoalIds.length })} inset={false} onClick={() => setOpen(true)} />
      {selectedGoals.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-2">
          {selectedGoals.slice(0, 3).map((goal) => <div key={goal.id} className="min-w-0 max-w-full rounded-[8px] bg-[var(--bg-well)] text-sm font-medium text-[var(--fg-2)]"><PersonalTextDetails lines={1}>{goal.title}</PersonalTextDetails></div>)}
          {selectedGoals.length > 3 ? <span className="chip">{t('habits.form.moreSelected', { count: selectedGoals.length - 3 })}</span> : null}
        </div>
      ) : null}
      {open ? (
        <Sheet ref={sheetRef} open virtualizedBody={activeGoals.length >= 21} title={t('habits.form.goals')} onClose={() => setOpen(false)}>
          {activeGoals.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center" style={{ gap: 12 }}>
              <p className="max-w-full truncate text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noGoals')}</p>
              <button type="button" className="chip mt-2" onClick={openCreateGoal}>{t('habits.form.createGoal')}</button>
            </div>
          ) : (
            <GoalPickerList goals={activeGoals} selectedIds={selectedSet} atLimit={atGoalLimit} onToggle={onToggleGoal} />
          )}
        </Sheet>
      ) : null}
      <CreateGoalFromHabitSheet open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
