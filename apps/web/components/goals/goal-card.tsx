'use client'

import { useState, useMemo } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { GoalDetailDrawer } from './goal-detail-drawer'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
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

export function GoalCard({ goal }: Readonly<GoalCardProps>) {
  const t = useTranslations()
  const prefersReducedMotion = useReducedMotion()
  const [showDetail, setShowDetail] = useState(false)
  const selectionMotion = resolveMotionPreset('selection', Boolean(prefersReducedMotion))
  const tapTarget = prefersReducedMotion ? undefined : { scale: 0.985 }

  const isStreak = isStreakGoal(goal.type)

  const progressColor = useMemo(() => {
    if (goal.status === 'Completed') return 'bg-success'
    if (goal.status === 'Abandoned') return 'bg-text-muted'
    if (isStreak) return 'bg-warning'
    if (goal.progressPercentage >= 75) return 'bg-success'
    if (goal.progressPercentage >= 50) return 'bg-primary'
    return 'bg-primary'
  }, [goal.status, goal.progressPercentage, isStreak])

  const deadlineInfo = useMemo(() => {
    if (!goal.deadline) return null
    const deadlineDate = parseISO(goal.deadline)
    const today = new Date()
    const daysLeft = differenceInDays(deadlineDate, today)

    if (goal.status !== 'Active') return null

    if (daysLeft < 0) {
      return {
        text: t('goals.deadline.overdue'),
        className: 'text-danger bg-danger/10',
      }
    }
    if (daysLeft <= 7) {
      return {
        text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
        className: 'text-warning bg-warning/10',
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
        className: 'text-success bg-success/10',
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
        return 'border-l-[3px] border-l-success'
      case 'at_risk':
        return 'border-l-[3px] border-l-warning'
      case 'behind':
        return 'border-l-[3px] border-l-danger'
      default:
        return ''
    }
  }, [goal.trackingStatus])

  return (
    <>
      {/* Use a button so the card is keyboard-accessible and has the correct role */}
      <motion.button
        type="button"
        data-tour="tour-goal-card"
        className={`group relative w-full overflow-hidden rounded-[var(--radius-xl)] border border-border-muted bg-surface p-5 text-left shadow-[var(--shadow-sm)] surface-interactive transition-[background-color,border-color,box-shadow,transform] cursor-pointer hover:bg-surface-elevated/80 ${trackingBorderClass}`}
        whileTap={tapTarget}
        transition={{
          duration: selectionMotion.enterDuration / 1000,
          ease: selectionMotion.enterEasing,
        }}
        onClick={() => setShowDetail(true)}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{ background: 'linear-gradient(165deg, var(--surface-sheen-start) 0%, transparent 44%)' }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--surface-top-highlight)]"
        />
        <div className="relative z-10 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 mb-1">
              {isStreak && (
                <span className="text-base leading-none" aria-hidden="true">
                  🔥
                </span>
              )}
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
              {isStreak
                ? t('goals.streak.ofTarget', {
                    current: goal.currentValue,
                    target: goal.targetValue,
                  })
                : t('goals.progressOf', {
                    current: goal.currentValue,
                    target: goal.targetValue,
                    unit: goal.unit,
                  })}
            </p>

            {/* Progress bar */}
            <div className="relative mb-2" data-tour="tour-goal-progress">
              <progress
                className="sr-only"
                value={Math.min(goal.progressPercentage, 100)}
                max={100}
                aria-label={t('goals.progressPercentage', { pct: goal.progressPercentage })}
              />
              <div
                className="h-2 bg-surface-elevated rounded-full overflow-hidden"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full transition-[width,background-color,transform] duration-500 animate-[progress-fill_0.6s_ease-out] ${progressColor}`}
                  style={{
                    width: `${Math.min(goal.progressPercentage, 100)}%`,
                  }}
                />
              </div>
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
      </motion.button>

      <GoalDetailDrawer
        open={showDetail}
        onOpenChange={setShowDetail}
        goalId={goal.id}
      />
    </>
  )
}
