'use client'

import { useState, useMemo } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { motion, useReducedMotion } from 'motion/react'
import { Flame } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { StatusDot, type StatusDotState } from '@/components/ui/status-dot'
import { ParentRing } from '@/components/ui/parent-ring'
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

  const progress = useMemo<{ state: string; color: string }>(() => {
    if (goal.status === 'Completed') return { state: 'completed', color: 'var(--status-done)' }
    if (goal.status === 'Abandoned') return { state: 'abandoned', color: 'var(--fg-3)' }
    if (isStreak) return { state: 'streak', color: 'var(--status-overdue)' }
    if (goal.progressPercentage >= 75) return { state: 'high', color: 'var(--status-done)' }
    return { state: 'mid', color: 'var(--primary)' }
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
      className: 'text-[var(--fg-3)] bg-[var(--bg-elev)] border border-[var(--hairline)]',
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
        className: 'text-[var(--fg-3)] bg-[var(--bg-elev)] border border-[var(--hairline)]',
      }
    }
    return null
  }, [goal.status, t])

  const trackingDot = useMemo<{ state: StatusDotState; label: string } | null>(() => {
    if (goal.status !== 'Active') return null
    switch (goal.trackingStatus) {
      case 'on_track':
        return { state: 'done', label: t('goals.metrics.onTrack') }
      case 'at_risk':
        return { state: 'overdue', label: t('goals.metrics.atRisk') }
      case 'behind':
        return { state: 'bad', label: t('goals.metrics.behind') }
      default:
        return null
    }
  }, [goal.status, goal.trackingStatus, t])

  return (
    <>
      <motion.button
        type="button"
        data-tour="tour-goal-card"
        className={`group relative w-full overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--bg-elev)] p-5 text-left shadow-[var(--shadow-sm)] surface-interactive transition-[background-color,border-color,box-shadow,transform] cursor-pointer hover:bg-[var(--bg-elev)]/80`}
        whileTap={tapTarget}
        transition={{
          duration: selectionMotion.enterDuration / 1000,
          ease: selectionMotion.enterEasing,
        }}
        onClick={() => setShowDetail(true)}
      >
        <div className="relative z-10 flex items-start gap-3">
          <div
            className="shrink-0"
            data-tour="tour-goal-progress"
            data-progress-state={progress.state}
            style={{ paddingTop: 2 }}
          >
            <progress
              className="sr-only"
              value={Math.min(goal.progressPercentage, 100)}
              max={100}
              aria-label={t('goals.progressPercentage', { pct: goal.progressPercentage })}
            />
            <ParentRing
              done={Math.min(goal.progressPercentage, 100)}
              total={100}
              size={36}
              color={progress.color}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isStreak && (
                <Flame className="size-3.5 text-[var(--status-overdue)] shrink-0" aria-hidden="true" />
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
              {statusBadge ? (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusBadge.className}`}
                >
                  {statusBadge.text}
                </span>
              ) : trackingDot ? (
                <StatusDot state={trackingDot.state} ariaLabel={trackingDot.label} />
              ) : null}
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

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--fg-2)] font-[family-name:var(--font-family-mono)] tabular-nums">
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
