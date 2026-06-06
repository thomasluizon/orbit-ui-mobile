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

interface GoalCardProps {
  goal: Goal
}

export function GoalCard({ goal }: Readonly<GoalCardProps>) {
  const t = useTranslations()
  const prefersReducedMotion = useReducedMotion()
  const [showDetail, setShowDetail] = useState(false)
  const selectionMotion = resolveMotionPreset('selection', Boolean(prefersReducedMotion))
  const tapTarget = prefersReducedMotion ? undefined : { scale: 0.985 }

  const isStreak = isStreakGoal(goal.type)

  const progress = useMemo<{ state: string; className: string }>(() => {
    if (goal.status === 'Completed') return { state: 'completed', className: 'bg-[var(--status-done)]' }
    if (goal.status === 'Abandoned') return { state: 'abandoned', className: 'bg-[var(--fg-3)]' }
    if (isStreak) return { state: 'streak', className: 'bg-[var(--status-overdue)]' }
    if (goal.progressPercentage >= 75) return { state: 'high', className: 'bg-[var(--status-done)]' }
    return { state: 'mid', className: 'bg-[var(--primary)]' }
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
        className: 'text-[var(--status-bad)] bg-[var(--bg-elev)] border border-[var(--hairline)]',
      }
    }
    if (daysLeft <= 7) {
      return {
        text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
        className: 'text-[var(--status-overdue)] bg-[var(--bg-elev)] border border-[var(--hairline)]',
      }
    }
    return {
      text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
      className: 'text-[var(--fg-3)] bg-[var(--bg-elev)]',
    }
  }, [goal.deadline, goal.status, t])

  const statusBadge = useMemo(() => {
    if (goal.status === 'Completed') {
      return {
        text: t('goals.status.completed'),
        className: 'text-[var(--status-done)] bg-[var(--bg-elev)] border border-[var(--hairline)]',
      }
    }
    if (goal.status === 'Abandoned') {
      return {
        text: t('goals.status.abandoned'),
        className: 'text-[var(--fg-3)] bg-[var(--bg-elev)]',
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
      {}
      <motion.button
        type="button"
        data-tour="tour-goal-card"
        className={`group relative w-full overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--bg-elev)] p-5 text-left shadow-[var(--shadow-sm)] surface-interactive transition-[background-color,border-color,box-shadow,transform] cursor-pointer hover:bg-[var(--bg-elev)]/80 ${trackingBorderClass}`}
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
            <div className="flex items-center gap-2 mb-1">
              {isStreak && (
                <span className="text-base leading-none" aria-hidden="true">
                  🔥
                </span>
              )}
              <h3
                className={`text-sm font-semibold text-[var(--fg-1)] truncate ${
                  goal.status === 'Abandoned'
                    ? 'line-through text-[var(--fg-3)]'
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

            <p className="text-xs text-[var(--fg-2)] mb-2">
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

            <div className="relative mb-2" data-tour="tour-goal-progress">
              <progress
                className="sr-only"
                value={Math.min(goal.progressPercentage, 100)}
                max={100}
                aria-label={t('goals.progressPercentage', { pct: goal.progressPercentage })}
              />
              <div
                className="h-2 bg-[var(--bg-elev)] rounded-full overflow-hidden"
                aria-hidden="true"
              >
                <div
                  data-progress-state={progress.state}
                  className={`h-full rounded-full transition-[width,background-color,transform] duration-500 animate-[progress-fill_0.6s_ease-out] ${progress.className}`}
                  style={{
                    width: `${Math.min(goal.progressPercentage, 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--fg-3)] font-medium">
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
