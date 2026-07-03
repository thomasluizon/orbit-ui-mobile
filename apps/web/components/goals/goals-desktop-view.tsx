'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { SkeletonCard } from '@/components/ui/skeleton'
import type { Goal } from '@orbit/shared/types/goal'
import { GoalDetailPanel } from './goal-detail-panel'
import { GoalList } from './goal-list'

interface GoalsDesktopViewProps {
  goals: Goal[]
  isFetched: boolean
  emptyState: ReactNode
}

/** Desktop (>=768px) Goals layout: a master goal list on the left and a detail +
 *  metrics panel on the right for the selected goal. The first goal is selected by
 *  default and the selection follows the list as it is filtered or reordered. */
export function GoalsDesktopView({
  goals,
  isFetched,
  emptyState,
}: Readonly<GoalsDesktopViewProps>) {
  const [pickedGoalId, setPickedGoalId] = useState<string | null>(null)

  const selectedId = useMemo(() => {
    if (goals.length === 0) return null
    if (pickedGoalId && goals.some((goal) => goal.id === pickedGoalId)) return pickedGoalId
    return goals[0]!.id
  }, [goals, pickedGoalId])

  if (!isFetched) {
    return (
      <div className="grid items-start gap-6 px-5 lg:grid-cols-[272px_minmax(0,1fr)]">
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <SkeletonCard key={`goal-skeleton-${index}`} lines={3} className="rounded-[18px]" />
          ))}
        </div>
        <div className="hidden lg:block">
          <SkeletonCard lines={6} className="rounded-[18px]" />
        </div>
      </div>
    )
  }

  if (goals.length === 0) {
    return <div className="px-5">{emptyState}</div>
  }

  return (
    <div className="grid items-start gap-6 px-5 lg:grid-cols-[272px_minmax(0,1fr)]">
      <div className="min-w-0">
        <GoalList goals={goals} selectedId={selectedId} onSelect={setPickedGoalId} />
      </div>
      <div className="min-w-0">
        <GoalDetailPanel goalId={selectedId} />
      </div>
    </div>
  )
}
