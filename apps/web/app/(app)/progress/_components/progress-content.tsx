'use client'

import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'

import { IconButton } from '@/components/ui/icon-button'
import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'

import { ActionRow } from '@/components/ui/action-row'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'

import { PersonalText } from '@/components/ui/personal-text'

import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { ProgressSubscreen } from './progress-subscreen'

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useDragAccessibility } from '@/components/ui/drag-accessibility'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslations } from 'next-intl'
import type { Goal } from '@orbit/shared/types/goal'
import {
  buildGoalMovePositions,
  filterProgressGoals,
  getProgressGoalLabelKey,
  type ProgressGoalFilter,
} from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { useGoalDrag } from './use-goal-drag'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { ErrorState } from '@/components/ui/error-state'
import { RefreshCw, Plus } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressRing } from '@/components/ui/progress-ring'
import * as Menu from '@/components/ui/dropdown-menu'
import { StatusRing } from '@/components/ui/status-ring'
import { useGoals, useReorderGoals } from '@/hooks/use-goals'

import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { ProgressGamificationRoute } from './progress-gamification-content'
import { ProgressLoading } from './progress-loading'
import { ProgressOverviewRoute } from './progress-overview'

function GoalIndicator({ goal }: Readonly<{ goal: Goal }>) {
  const t = useTranslations()
  if (goal.status === 'Abandoned') return null
  const label = t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })
  if (goal.status === 'Completed' || goal.progressPercentage >= 100) return <StatusRing status="done" size={30} label={label} />
  return <ProgressRing value={goal.progressPercentage} size={44} label={label} />
}

function GoalCard({ goal, index, total, canReorder, onMove, onOpen }: Readonly<{
  goal: Goal
  index: number
  total: number
  canReorder: boolean
  onMove: (goalId: string, target: number) => void
  onOpen: () => void
}>) {
  const t = useTranslations()
  const { attributes, setNodeRef, listeners, transform, isDragging } = useSortable({ id: goal.id, disabled: !canReorder, attributes: { roleDescription: t('dragAndDrop.roleDescription') } })
  const labelKey = getProgressGoalLabelKey(goal)
  const abandoned = goal.status === 'Abandoned'
  const state = t(labelKey ?? 'goals.status.active')
  const position = t('progressScreen.goals.position', { position: index + 1, total })
  const accessibilityLabel = abandoned
    ? t('progressScreen.goals.accessibleLabelWithoutProgress', { title: goal.title, state, position })
    : t('progressScreen.goals.accessibleLabel', {
        title: goal.title,
        state,
        progress: t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit }),
        position,
      })
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    onMove(goal.id, index + (event.key === 'ArrowUp' ? -1 : 1))
  }
  return (
    <button type="button" aria-label={accessibilityLabel} data-goal-id={goal.id} data-dragging={isDragging}
      ref={setNodeRef} {...listeners}
      style={{
        translate: transform ? `${transform.x}px ${transform.y}px` : undefined,
        transform: transform ? `scaleX(${transform.scaleX}) scaleY(${transform.scaleY})` : undefined,
        transition: 'background-color var(--dur-hover) var(--ease-standard), box-shadow var(--dur-hover) var(--ease-standard), scale var(--dur-press) var(--ease-out)',
      }}
      aria-roledescription={canReorder ? attributes['aria-roledescription'] : undefined}
      aria-describedby={canReorder ? attributes['aria-describedby'] : undefined}
      aria-keyshortcuts={canReorder ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      onKeyDown={canReorder ? handleKeyDown : undefined}
      onClick={onOpen}
      className="[transition-property:background-color,box-shadow,scale] orbit-hover-text relative flex w-full cursor-pointer select-none items-center gap-3 rounded-[20px] bg-[var(--bg-card)] p-record-inset text-left shadow-[inset_0_0_0_1px_var(--hairline-ghost)] hover:bg-[var(--bg-hover)] hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)] active:scale-[0.96] data-[dragging=true]:z-[2] data-[dragging=true]:scale-[0.96] data-[dragging=true]:opacity-50 data-[dragging=true]:shadow-[var(--sh-2),inset_0_0_0_1px_var(--hairline-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <PersonalText className={`  text-[17px] font-medium ${abandoned ? 'text-[var(--fg-2)]' : 'text-[var(--fg-1)]'}`}>{goal.title}</PersonalText>
        <span className="flex flex-wrap items-center gap-2">
          {labelKey ? <Badge variant={abandoned ? 'outline' : 'solid'}>{t(labelKey)}</Badge> : null}
          {!abandoned ? <span className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--fg-2)]">{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</span> : null}
        </span>
      </span>
      <GoalIndicator goal={goal} />
    </button>
  )
}

function GoalsEmptyState({ inSection = false, onCreate }: Readonly<{ inSection?: boolean; onCreate: () => void }>) {
  const t = useTranslations()
  const isDesktop = useIsDesktop()
  const action = <PillButton variant={isDesktop ? 'secondary' : 'primary'} size="sm" onClick={onCreate}>{t('progressScreen.goals.createAction')}</PillButton>

  if (!inSection) return <EmptyState title={t('progressScreen.goals.empty')} action={action} />
  return <div data-goals-empty className="flex flex-col items-start gap-2 rounded-[12px] bg-[var(--bg-well)] p-4"><p className="text-[14px] text-[var(--fg-2)]">{t('progressScreen.goals.empty')}</p><div data-empty-state-action>{action}</div></div>
}

function GoalsSection({ goals, onOpenGoal, onCreate, filter, setFilter }: Readonly<{ goals: readonly Goal[]; onCreate: () => void; filter: ProgressGoalFilter; setFilter: (filter: ProgressGoalFilter) => void; onOpenGoal: (goalId: string) => void }>) {

  const t = useTranslations()
  const dragAccessibility = useDragAccessibility(t, (id) => goals.find((goal) => goal.id === id)?.title, t('dragAndDrop.goalInstructions'))
  const reorder = useReorderGoals()
  const [filterOpen, setFilterOpen] = useState(false)
  // WHY: Repeated text must move between mounted regions so assistive technology sees a DOM change. https://github.com/thomasluizon/orbit-tickets/issues/480
  const [reorderAnnouncements, setReorderAnnouncements] = useState<readonly [string, string]>(['', ''])
  const announceReorderResult = (message: string) => {
    setReorderAnnouncements(([first]) => first === '' ? [message, ''] : ['', message])
  }
  const filtered = filterProgressGoals(goals, filter)
  const commitMove = (positions: NonNullable<ReturnType<typeof buildGoalMovePositions>>, goalId: string, target: number) => {
    const goal = goals.find((item) => item.id === goalId)
    if (!goal) return
    reorder.mutate(positions, {
      onSuccess: () => announceReorderResult(t('progressScreen.goals.reorderMoved', { title: goal.title, position: target + 1, total: goals.length })),
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
      announceReorderResult(t('progressScreen.goals.reorderBoundary', { title: goal.title, position: currentIndex + 1, total: goals.length }))
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
      {goals.length > 0 ? <Menu.Root open={filterOpen} onOpenChange={setFilterOpen}><ActionRow><Menu.Trigger asChild><PillButton variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} accessibleName={`${t('progressScreen.goals.filter')}: ${t(`progressScreen.goals.${filter}`)}`}>{t(`progressScreen.goals.${filter}`)}</PillButton></Menu.Trigger><IconButton label={t('goals.create')} onClick={onCreate}><Plus size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton></ActionRow>
        <Menu.Content title={t('progressScreen.goals.views')} shortTitle={t('progressScreen.goals.filter')} presentation="sheet"
          items={options.map((option) => ({ id: option.value, label: option.label, checked: option.value === filter }))}
          onSelect={(id) => { const option = options.find((item) => item.value === id); if (option) setFilter(option.value) }} /></Menu.Root> : null}
      {goals.length === 0 ? <GoalsEmptyState onCreate={onCreate} inSection /> : null}
      {goals.length > 0 && filtered.length === 0 ? <div data-goals-empty className="flex flex-col items-start gap-2 rounded-[12px] bg-[var(--bg-well)] p-4"><p className="text-[14px] text-[var(--fg-2)]">{t('progressScreen.goals.filterEmpty')}</p><PillButton variant="ghost" size="sm" minimumHeight={48} onClick={() => setFilter('all')}>{t('progressScreen.goals.clearFilter')}</PillButton></div> : null}
      <DndContext accessibility={dragAccessibility} sensors={drag.sensors} onDragEnd={drag.onDragEnd} collisionDetection={closestCenter}><SortableContext items={filtered.map((goal) => goal.id)} strategy={verticalListSortingStrategy}><div className="flex flex-col gap-3">
          <ListPresence>{filtered.map((goal) => {
            const index = goals.findIndex((item) => item.id === goal.id)
            return <ListMotionItem key={goal.id}><GoalCard goal={goal} index={index} total={goals.length} canReorder={filter === 'all' && !reorder.isPending} onMove={move} onOpen={() => onOpenGoal(goal.id)} /></ListMotionItem>
          })}</ListPresence>
        </div></SortableContext></DndContext>
      {reorderAnnouncements.map((message, index) => (
        <p key={index} role="status" aria-live="polite" aria-atomic="true" data-testid="goal-reorder-status" className="sr-only">{message}</p>
      ))}
      {reorder.isError ? <p role="alert" className="text-[14px] text-[var(--fg-2)]">{t('progressScreen.goals.reorderError')}</p> : null}
    </section>
  )
}

function ProgressGoalsContent() {
  const [goalFilter, setGoalFilter] = useAccountScopedState<ProgressGoalFilter>('all')
  const [creating, setCreating] = useAccountScopedState(false)
  const [createdGoalId, setCreatedGoalId] = useAccountScopedState<string | null>(null)
  const openCreateGoal = () => { setCreatedGoalId(null); setCreating(true) }
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (creating || !createdGoalId) return
    const card = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-goal-id]') ?? []).find((element) => element.dataset.goalId === createdGoalId)
    const destination = card ?? contentRef.current?.querySelector<HTMLElement>('[data-progress-focus]')
    destination?.focus()
  }, [creating, createdGoalId])
  const [detailGoalId, setDetailGoalId] = useAccountScopedState<string | null>(null)
  const openingGoalId = useRef<string | null>(null)
  useEffect(() => {
    if (detailGoalId) { openingGoalId.current = detailGoalId; return }
    const previousGoal = openingGoalId.current
    if (!previousGoal) return
    const card = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-goal-id]') ?? []).find((element) => element.dataset.goalId === previousGoal)
    ;(card ?? contentRef.current?.querySelector<HTMLElement>('[data-progress-focus]'))?.focus()
    openingGoalId.current = null
  }, [detailGoalId])
  const t = useTranslations()

  const goals = useGoals()
  const allGoals = goals.data?.allGoals ?? []
  const error = goals.isError
  const loading = !error && goals.isLoading
  const empty = !loading && !error && allGoals.length === 0
  const retry = () => { void goals.refetch() }
  return (
    <div ref={contentRef} className="mx-auto flex w-full min-w-0 max-w-[740px] flex-1 flex-col">
      {creating ? <CreateGoalSheet open restoreFocusOnCreate={false} onCreated={(goalId) => { setGoalFilter('all'); setCreatedGoalId(goalId) }} onClose={() => setCreating(false)} /> : null}
      {detailGoalId ? <div className="px-screen-gutter pt-4"><GoalDetailDrawer key={detailGoalId} inline open onOpenChange={(open) => { if (!open) setDetailGoalId(null) }} goalId={detailGoalId} /></div> : null}
      <div hidden={detailGoalId !== null} className="flex w-full flex-1 flex-col">
        <ProgressSubscreen screen="goals" hideHeader={detailGoalId !== null}>
          <p data-progress-focus tabIndex={-1} className="sr-only">{t('progressScreen.sections.goals')}</p>
          {loading ? <ProgressLoading label={t('progressScreen.loading')} screen="goals" /> : null}
          {error ? <div className="w-full"><ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} /></div> : null}
          {empty ? <ShellCentredRegion><GoalsEmptyState onCreate={openCreateGoal} /></ShellCentredRegion> : null}
          {!loading && !error && !empty ? <GoalsSection filter={goalFilter} setFilter={setGoalFilter} onCreate={openCreateGoal} onOpenGoal={setDetailGoalId} goals={allGoals} /> : null}
        </ProgressSubscreen>
      </div>
    </div>
  )
}

export function ProgressContent({ screen = 'overview' }: Readonly<{ screen?: ProgressSubmenuId | 'overview' }>) {
  if (screen === 'overview') return <ProgressOverviewRoute />
  if (screen === 'goals') return <ProgressGoalsContent />
  return <ProgressGamificationRoute screen={screen} />
}
