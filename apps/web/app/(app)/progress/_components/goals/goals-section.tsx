'use client'

import { useState } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslations } from 'next-intl'
import type { Goal } from '@orbit/shared/types/goal'
import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { buildGoalMovePositions, filterProgressGoals, type ProgressGoalFilter } from '@orbit/shared/utils'
import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'
import { ActionRow } from '@/components/ui/action-row'
import { useDragAccessibility } from '@/components/ui/drag-accessibility'
import * as Menu from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { Plus } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { useReorderGoals } from '@/hooks/use-goals'
import { useGoalDrag } from '../use-goal-drag'
import { GoalCard } from './goal-card'

interface GoalsSectionProps {
  goals: readonly Goal[]
  filter: ProgressGoalFilter
  setFilter: (filter: ProgressGoalFilter) => void
  onCreate: () => void
  onOpenGoal: (goalId: string) => void
  /** The value each card's ring sweeps from once, or null for a card with no change since the last visit. */
  sweepFrom: (goal: Goal) => number | null
}

function useReorderAnnouncements() {
  // WHY: Repeated text must move between mounted regions so assistive technology sees a DOM change. https://github.com/thomasluizon/orbit-tickets/issues/480
  const [announcements, setAnnouncements] = useState<readonly [string, string]>(['', ''])
  const announce = (message: string) => {
    setAnnouncements(([first]) => first === '' ? [message, ''] : ['', message])
  }
  return { announcements, announce }
}

export function GoalsSection({ goals, onOpenGoal, onCreate, filter, setFilter, sweepFrom }: Readonly<GoalsSectionProps>) {
  const t = useTranslations()
  const dragAccessibility = useDragAccessibility(t, (id) => goals.find((goal) => goal.id === id)?.title, t('dragAndDrop.goalInstructions'))
  const reorder = useReorderGoals()
  const [filterOpen, setFilterOpen] = useState(false)
  const { announcements, announce } = useReorderAnnouncements()
  const filtered = filterProgressGoals(goals, filter)
  const commitMove = (positions: NonNullable<ReturnType<typeof buildGoalMovePositions>>, goalId: string, target: number) => {
    const goal = goals.find((item) => item.id === goalId)
    if (!goal) return
    reorder.mutate(positions, {
      onSuccess: () => announce(t('progressScreen.goals.reorderMoved', { title: goal.title, position: target + 1, total: goals.length })),
    })
  }
  const drag = useGoalDrag(goals, filter === 'all' && !reorder.isPending, reorder.mutate)
  const move = (goalId: string, target: number) => {
    const currentIndex = goals.findIndex((item) => item.id === goalId)
    const goal = goals[currentIndex]
    if (!goal) return
    const boundedTarget = Math.max(0, Math.min(goals.length - 1, target))
    const positions = buildGoalMovePositions(goals, goalId, target)
    if (!positions) {
      announce(t('progressScreen.goals.reorderBoundary', { title: goal.title, position: currentIndex + 1, total: goals.length }))
      return
    }
    commitMove(positions, goalId, boundedTarget)
  }
  const options = [
    { value: 'all', label: t('progressScreen.goals.all') }, { value: 'active', label: t('progressScreen.goals.active') },
    { value: 'completed', label: t('progressScreen.goals.completed') }, { value: 'abandoned', label: t('progressScreen.goals.abandoned') },
  ] as const
  return (
    <section aria-label={t('progressScreen.sections.goals')} className="flex flex-col gap-section-title-gap">
      <Menu.Root open={filterOpen} onOpenChange={setFilterOpen}><ActionRow><Menu.Trigger asChild><PillButton variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} accessibleName={`${t('progressScreen.goals.filter')}: ${t(`progressScreen.goals.${filter}`)}`}>{t(`progressScreen.goals.${filter}`)}</PillButton></Menu.Trigger><IconButton label={t('goals.create')} onClick={onCreate}><Plus size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton></ActionRow>
        <Menu.Content title={t('progressScreen.goals.views')} shortTitle={t('progressScreen.goals.filter')} presentation="sheet"
          items={options.map((option) => ({ id: option.value, label: option.label, checked: option.value === filter }))}
          onSelect={(id) => { const option = options.find((item) => item.value === id); if (option) setFilter(option.value) }} /></Menu.Root>
      {filtered.length === 0 ? <div data-goals-empty className="flex flex-col items-start gap-2 rounded-[12px] bg-[var(--bg-well)] p-4"><p className="text-[14px] text-[var(--fg-2)]">{t('progressScreen.goals.filterEmpty')}</p><PillButton variant="ghost" size="sm" minimumHeight={48} onClick={() => setFilter('all')}>{t('progressScreen.goals.clearFilter')}</PillButton></div> : null}
      <DndContext accessibility={dragAccessibility} sensors={drag.sensors} onDragEnd={drag.onDragEnd} collisionDetection={closestCenter}><SortableContext items={filtered.map((goal) => goal.id)} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-3">
          <ListPresence>{filtered.map((goal) => {
            const index = goals.findIndex((item) => item.id === goal.id)
            return <ListMotionItem key={goal.id}><GoalCard goal={goal} index={index} total={goals.length} canReorder={filter === 'all' && !reorder.isPending} sweepFrom={sweepFrom(goal)} onMove={move} onOpen={() => onOpenGoal(goal.id)} /></ListMotionItem>
          })}</ListPresence>
        </div></SortableContext></DndContext>
      {announcements.map((message, index) => (
        <p key={index} role="status" aria-live="polite" aria-atomic="true" data-testid="goal-reorder-status" className="sr-only">{message}</p>
      ))}
      {reorder.isError ? <p role="alert" className="text-[14px] text-[var(--fg-2)]">{t('progressScreen.goals.reorderError')}</p> : null}
    </section>
  )
}
