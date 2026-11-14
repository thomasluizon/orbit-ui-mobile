'use client'

import type { KeyboardEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { useTranslations } from 'next-intl'
import type { Goal } from '@orbit/shared/types/goal'
import { getProgressGoalLabelKey } from '@orbit/shared/utils'
import { useRingSweep } from '@/components/goals/goal-detail-drawer/use-ring-sweep'
import { Badge } from '@/components/ui/badge'
import { PersonalText } from '@/components/ui/personal-text'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'

function GoalIndicator({ goal, sweepFrom }: Readonly<{ goal: Goal; sweepFrom: number | null }>) {
  const t = useTranslations()
  const shown = useRingSweep(goal.progressPercentage, sweepFrom)
  if (goal.status === 'Abandoned') return null
  const label = t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })
  if (goal.status === 'Completed' || goal.progressPercentage >= 100) return <StatusRing status="done" size={30} label={label} />
  return <span data-ring-sweep={shown === goal.progressPercentage ? 'rest' : 'sweeping'} className="flex"><ProgressRing value={shown} size={44} label={label} sweepDuration={sweepFrom === null ? 'base' : 'slow'} /></span>
}

interface GoalCardProps {
  goal: Goal
  index: number
  total: number
  canReorder: boolean
  /** The value the ring sweeps from once, when the goal changed since the last visit. Null draws the ring at rest. */
  sweepFrom: number | null
  onMove: (goalId: string, target: number) => void
  onOpen: () => void
}

export function GoalCard({ goal, index, total, canReorder, sweepFrom, onMove, onOpen }: Readonly<GoalCardProps>) {
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
  // WHY: the card presses its surface inside a target that keeps its full size, so a press at its edge never shrinks out from under the pointer and loses its click. https://github.com/thomasluizon/orbit-tickets/issues/2096
  return (
    <button type="button" aria-label={accessibilityLabel} data-goal-id={goal.id} data-dragging={isDragging}
      ref={setNodeRef} {...listeners}
      style={{
        translate: transform ? `${transform.x}px ${transform.y}px` : undefined,
        transform: transform ? `scaleX(${transform.scaleX}) scaleY(${transform.scaleY})` : undefined,
      }}
      aria-roledescription={canReorder ? attributes['aria-roledescription'] : undefined}
      aria-describedby={canReorder ? attributes['aria-describedby'] : undefined}
      aria-keyshortcuts={canReorder ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      onKeyDown={canReorder ? handleKeyDown : undefined}
      onClick={onOpen}
      className="group/goal-card orbit-hover-text relative flex w-full cursor-pointer select-none rounded-[20px] text-left data-[dragging=true]:z-[2] data-[dragging=true]:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]">
      <span data-slot="goal-card-surface" className="[transition-property:background-color,box-shadow,scale] [transition-duration:var(--dur-hover),var(--dur-hover),var(--dur-press)] [transition-timing-function:var(--ease-standard),var(--ease-standard),var(--ease-out)] flex min-w-0 flex-1 items-center gap-3 rounded-[20px] bg-[var(--bg-card)] p-record-inset shadow-[inset_0_0_0_1px_var(--hairline-ghost)] group-hover/goal-card:bg-[var(--bg-hover)] group-hover/goal-card:shadow-[inset_0_0_0_1px_var(--hairline-strong)] motion-safe:group-active/goal-card:scale-[0.96] motion-safe:group-data-[dragging=true]/goal-card:scale-[0.96] group-data-[dragging=true]/goal-card:shadow-[var(--sh-2),inset_0_0_0_1px_var(--hairline-strong)]">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <PersonalText className={`  text-[17px] font-medium ${abandoned ? 'text-[var(--fg-2)]' : 'text-[var(--fg-1)]'}`}>{goal.title}</PersonalText>
          <span className="flex flex-wrap items-center gap-2">
            {labelKey ? <Badge variant={abandoned ? 'outline' : 'solid'}>{t(labelKey)}</Badge> : null}
            {!abandoned ? <span className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--fg-2)]">{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</span> : null}
          </span>
        </span>
        <GoalIndicator goal={goal} sweepFrom={sweepFrom} />
      </span>
    </button>
  )
}
