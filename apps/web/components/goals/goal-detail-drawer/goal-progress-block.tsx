'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Goal } from '@orbit/shared/types/goal'
import { getFriendlyErrorMessage, getProgressGoalLabelKey } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { Minus, Plus } from '@/components/ui/icons'
import { useUpdateGoalProgress } from '@/hooks/use-goals'

function GoalDetailIndicator({ goal, label }: Readonly<{ goal: Goal; label: string }>) {
  if (goal.status === 'Abandoned') return null
  if (goal.status === 'Completed' || goal.progressPercentage >= 100) return <StatusRing status="done" size={60} label={label} />
  return <ProgressRing value={goal.progressPercentage} size={60} label={label} />
}

function GoalDerivedProgress({ goal }: Readonly<{ goal: Goal }>) {
  const t = useTranslations()
  if (goal.status === 'Abandoned' || !goal.isProgressDerived) return null
  return <p className="text-[14px] text-[var(--fg-2)]">{t(goal.type === 'Streak' ? 'goals.detail.derivedStreak' : 'goals.detail.derivedHabits', { count: goal.linkedHabits.length })}</p>
}

interface GoalProgressBlockProps {
  goal: Goal
  isUpdatingStatus: boolean
  onComplete: () => void
  refetchDetail: () => Promise<unknown>
}

export function GoalProgressBlock({ goal, isUpdatingStatus, onComplete, refetchDetail }: Readonly<GoalProgressBlockProps>) {
  const t = useTranslations()
  const update = useUpdateGoalProgress()
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abandoned = goal.status === 'Abandoned'
  const active = goal.status === 'Active'
  const derived = goal.isProgressDerived === true
  const done = goal.status === 'Completed' || goal.progressPercentage >= 100
  const labelKey = getProgressGoalLabelKey(goal)
  const ringLabel = t('goals.progressPercentage', { pct: Math.round(goal.progressPercentage) })

  async function step(change: number) {
    if (pending.current || !active || derived) return
    const value = Math.min(goal.targetValue, Math.max(0, goal.currentValue + change))
    if (value === goal.currentValue) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await update.mutateAsync({ goalId: goal.id, data: { currentValue: value } })
      await refetchDetail()
    } catch (failure: unknown) {
      setError(getFriendlyErrorMessage(failure, t, 'goals.errors.progress', 'goalProgress'))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className={`font-[var(--font-display)] text-[22px] font-medium leading-tight md:text-[28px] ${abandoned ? 'text-[var(--fg-3)]' : 'text-[var(--fg-1)]'}`}>{goal.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {labelKey ? <Badge variant={abandoned ? 'outline' : 'solid'}>{t(labelKey)}</Badge> : null}
            {!abandoned ? <p className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--fg-3)]">{t('progressScreen.goals.progress', { current: goal.currentValue, target: goal.targetValue, unit: goal.unit })}</p> : null}
          </div>
        </div>
        <GoalDetailIndicator goal={goal} label={ringLabel} />
      </div>
      <GoalDerivedProgress goal={goal} />
      {active && !derived ? <div className="flex flex-col gap-2" aria-busy={busy}>
        <p className="text-[14px] text-[var(--fg-2)]">{t('goals.detail.manualProgress')}</p>
        <div className="flex items-center gap-2">
        <PillButton variant="ghost" size="sm" iconOnly label={t('goals.detail.decrease')} disabled={busy || goal.currentValue <= 0} onClick={() => void step(-1)}><Minus size={16} aria-hidden="true" /></PillButton>
        <span className="font-[var(--font-mono)] min-w-8 text-center text-[20px] tabular-nums text-[var(--fg-1)]">{goal.currentValue}</span>
        <PillButton variant="ghost" size="sm" iconOnly label={t('goals.detail.increase')} disabled={busy || goal.currentValue >= goal.targetValue} onClick={() => void step(1)}><Plus size={16} aria-hidden="true" /></PillButton>
        <span className="text-[14px] text-[var(--fg-3)]">{goal.unit}</span>
        </div>
      </div> : null}
      <p role="alert" className={error ? 'text-[14px] text-[var(--fg-2)]' : 'sr-only'}>{error}</p>
      {active && done ? <div className="flex flex-col items-start gap-2">
        <PillButton variant="secondary" size="sm" accessibleName={t('goals.detail.markCompleted')} disabled={busy || isUpdatingStatus} onClick={onComplete}>{t('goals.detail.markCompleted')}</PillButton>
        <p className="text-[14px] text-[var(--fg-2)]">{t(derived ? 'goals.detail.completeWhyDerived' : 'goals.detail.completeWhy')}</p>
      </div> : null}
    </div>
  )
}
