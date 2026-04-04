'use client'

import { useState, useMemo } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { GoalDetailDrawer } from './goal-detail-drawer'
import type { Goal } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalCardProps {
  goal: Goal
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalCard({ goal }: GoalCardProps) {
  const t = useTranslations()
  const [showDetail, setShowDetail] = useState(false)

  const progressColor = useMemo(() => {
    if (goal.status === 'Completed') return 'bg-green-500'
    if (goal.status === 'Abandoned') return 'bg-text-muted'
    if (goal.progressPercentage >= 75) return 'bg-green-500'
    if (goal.progressPercentage >= 50) return 'bg-primary'
    return 'bg-primary'
  }, [goal.status, goal.progressPercentage])

  const deadlineInfo = useMemo(() => {
    if (!goal.deadline) return null
    const deadlineDate = parseISO(goal.deadline)
    const today = new Date()
    const daysLeft = differenceInDays(deadlineDate, today)

    if (goal.status !== 'Active') return null

    if (daysLeft < 0) {
      return {
        text: t('goals.deadline.overdue'),
        className: 'text-red-400 bg-red-500/10',
      }
    }
    if (daysLeft <= 7) {
      return {
        text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
        className: 'text-amber-400 bg-amber-500/10',
      }
    }
    return {
      text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
      className: 'text-text-muted bg-surface-elevated',
    }
  }, [goal.deadline, goal.status, t])

  const statusBadge = useMemo(() => {
    if (goal.status === 'Completed') {
      return {
        text: t('goals.status.completed'),
        className: 'text-green-400 bg-green-500/10',
      }
    }
    if (goal.status === 'Abandoned') {
      return {
        text: t('goals.status.abandoned'),
        className: 'text-text-muted bg-surface-elevated',
      }
    }
    return null
  }, [goal.status, t])

  const trackingBorderClass = useMemo(() => {
    switch (goal.trackingStatus) {
      case 'on_track':
        return 'border-l-[3px] border-l-green-500'
      case 'at_risk':
        return 'border-l-[3px] border-l-amber-500'
      case 'behind':
        return 'border-l-[3px] border-l-red-500'
      default:
        return ''
    }
  }, [goal.trackingStatus])

  return (
    <>
      <div
        className={`bg-surface rounded-[var(--radius-xl)] p-5 cursor-pointer hover:bg-surface-elevated/80 border border-border-muted shadow-[var(--shadow-sm)] transition-all duration-150 ${trackingBorderClass}`}
        onClick={() => setShowDetail(true)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 mb-1">
              <h3
                className={`text-sm font-semibold text-text-primary truncate ${
                  goal.status === 'Abandoned'
                    ? 'line-through text-text-muted'
                    : ''
                }`}
              >
                {goal.title}
              </h3>
              {statusBadge && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusBadge.className}`}
                >
                  {statusBadge.text}
                </span>
              )}
            </div>

            {/* Progress text */}
            <p className="text-xs text-text-secondary mb-2">
              {t('goals.progressOf', {
                current: goal.currentValue,
                target: goal.targetValue,
                unit: goal.unit,
              })}
            </p>

            {/* Progress bar */}
            <div className="h-2 bg-surface-elevated rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-500 animate-[progress-fill_0.6s_ease-out] ${progressColor}`}
                style={{
                  width: `${Math.min(goal.progressPercentage, 100)}%`,
                }}
              />
            </div>

            {/* Footer: percentage + deadline */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted font-medium">
                {t('goals.progressPercentage', {
                  pct: goal.progressPercentage,
                })}
              </span>
              {deadlineInfo && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${deadlineInfo.className}`}
                >
                  {deadlineInfo.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <GoalDetailDrawer
        open={showDetail}
        onOpenChange={setShowDetail}
        goalId={goal.id}
      />
    </>
  )
}
