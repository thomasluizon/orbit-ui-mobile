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
                className="appearance-none cursor-pointer inline-flex items-center whitespace-nowrap shrink-0 transition-[background-color,box-shadow,color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] disabled:opacity-30 disabled:pointer-events-none"
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 999,
                  background: isSelected
                    ? 'rgba(var(--primary-rgb), 0.12)'
                    : 'var(--bg-field)',
                  boxShadow: isSelected
                    ? 'inset 0 0 0 1px var(--primary)'
                    : undefined,
                  border: 0,
                  color: isSelected ? 'var(--primary)' : 'var(--fg-3)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: 500,
                  gap: 6,
                }}
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
            fontStyle: 'italic',
            color: 'var(--fg-3)',
          }}
        >
          {t('habits.form.noGoals')}
        </p>
      )}
    </div>
  )
}
