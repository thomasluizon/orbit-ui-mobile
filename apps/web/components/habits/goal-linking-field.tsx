'use client'

import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Goal } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalLinkingFieldProps {
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalLinkingField({
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
}: GoalLinkingFieldProps) {
  const t = useTranslations()

  const { data: goals } = useQuery({
    queryKey: goalKeys.lists(),
    queryFn: async () => {
      const res = await fetch(API.goals.list)
      if (!res.ok) throw new Error('Failed to fetch goals')
      const data = await res.json()
      return (data.items ?? data) as Goal[]
    },
    staleTime: QUERY_STALE_TIMES.goals,
  })

  const activeGoals = goals?.filter(
    (g) => g.status === 'Active',
  ) ?? []

  return (
    <div className="space-y-2">
      <span className="form-label" aria-hidden="true">
        {t('habits.form.goals')}
      </span>
      {activeGoals.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activeGoals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                selectedGoalIds.includes(goal.id)
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border-muted text-text-secondary hover:text-text-primary'
              } ${
                !selectedGoalIds.includes(goal.id) && atGoalLimit
                  ? 'opacity-30 pointer-events-none'
                  : ''
              }`}
              onClick={() => onToggleGoal(goal.id)}
            >
              {goal.title}
              <span className="ml-1 opacity-70">
                {Math.round(goal.progressPercentage)}%
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted mt-2">
          {t('habits.form.noGoals')}
        </p>
      )}
    </div>
  )
}
