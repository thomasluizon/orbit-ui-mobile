'use client'

import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Goal } from '@orbit/shared/types/goal'

interface GoalLinkingFieldProps {
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
}

interface GoalsListResponse {
  items: Goal[]
}

/** Pill chip strip with mono percent token; active chips take the primary tint. */
export function GoalLinkingField({
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
}: Readonly<GoalLinkingFieldProps>) {
  const t = useTranslations()

  const { data: goals } = useQuery({
    queryKey: goalKeys.lists(),
    queryFn: async (): Promise<Goal[]> => {
      const res = await fetch(API.goals.list)
      if (!res.ok) throw new Error('Failed to fetch goals')
      const data = (await res.json()) as GoalsListResponse | Goal[]
      return Array.isArray(data) ? data : data.items
    },
    staleTime: QUERY_STALE_TIMES.goals,
  })

  const activeGoals = goals?.filter((g) => g.status === 'Active') ?? []

  return (
    <div className="space-y-2">
      <span className="form-label" aria-hidden="true">
        {t('habits.form.goals')}
      </span>
      {activeGoals.length > 0 ? (
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {activeGoals.map((goal) => {
            const isSelected = selectedGoalIds.includes(goal.id)
            const isDimmed = !isSelected && atGoalLimit
            return (
              <button
                key={goal.id}
                type="button"
                aria-pressed={isSelected}
                disabled={isDimmed}
                className={`chip disabled:opacity-30 disabled:pointer-events-none ${
                  isSelected ? 'chip-active' : ''
                }`}
                onClick={() => onToggleGoal(goal.id)}
              >
                <span>{goal.title}</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: isSelected ? 'var(--primary)' : 'var(--fg-4)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {Math.round(goal.progressPercentage)}%
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p
          style={{
            marginTop: 8,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
          }}
        >
          {t('habits.form.noGoals')}
        </p>
      )}
    </div>
  )
}
