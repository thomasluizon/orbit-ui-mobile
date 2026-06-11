'use client'

import { useState, useMemo } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { motion, useReducedMotion } from 'motion/react'
import { Flame } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { StatusDot, type StatusDotState } from '@/components/ui/status-dot'
import { ProgressBar } from '@/components/ui/progress-bar'
import { GoalDetailDrawer } from './goal-detail-drawer'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import type { Goal } from '@orbit/shared/types/goal'

interface GoalCardProps {
  goal: Goal
}

const badgeClassName =
  'inline-flex shrink-0 items-center rounded-full uppercase'

const badgeStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.06em',
  padding: '3px 9px',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
} as const

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
        color: 'var(--status-bad)',
      }
    }
    if (daysLeft <= 7) {
      return {
        text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
        color: 'var(--status-overdue)',
      }
    }
    return {
      text: plural(t('goals.deadline.daysLeft', { n: daysLeft }), daysLeft),
      color: 'var(--fg-3)',
    }
  }, [goal.deadline, goal.status, t])

  const statusBadge = useMemo(() => {
    if (goal.status === 'Completed') {
      return {
        text: t('goals.status.completed'),
        color: 'var(--status-done)',
      }
    }
    if (goal.status === 'Abandoned') {
      return {
        text: t('goals.status.abandoned'),
        color: 'var(--fg-3)',
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

  const percentLabel = t('goals.progressPercentage', { pct: goal.progressPercentage })

  return (
    <>
      <motion.button
        type="button"
        data-tour="tour-goal-card"
        className="group relative w-full cursor-pointer overflow-hidden rounded-[18px] border-0 bg-[var(--bg-card)] text-left transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
        style={{ padding: '16px 18px', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
        whileTap={tapTarget}
        transition={{
          duration: selectionMotion.enterDuration / 1000,
          ease: selectionMotion.enterEasing,
        }}
        onClick={() => setShowDetail(true)}
      >
        <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
          {isStreak && (
            <Flame
              size={16}
              strokeWidth={1.8}
              className="shrink-0 text-[var(--status-overdue)]"
              aria-hidden="true"
            />
          )}
          <h3
            className={`min-w-0 flex-1 truncate ${
              goal.status === 'Abandoned' ? 'line-through text-[var(--fg-3)]' : ''
            }`}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 500,
              color: goal.status === 'Abandoned' ? undefined : 'var(--fg-1)',
            }}
          >
            {goal.title}
          </h3>
          {statusBadge ? (
            <span className={badgeClassName} style={{ ...badgeStyle, color: statusBadge.color }}>
              {statusBadge.text}
            </span>
          ) : trackingDot ? (
            <StatusDot state={trackingDot.state} ariaLabel={trackingDot.label} />
          ) : null}
        </div>

        <div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 12 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--fg-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
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
          </span>
          {deadlineInfo && (
            <span className={badgeClassName} style={{ ...badgeStyle, color: deadlineInfo.color }}>
              {deadlineInfo.text}
            </span>
          )}
        </div>

        <div
          className="flex items-center"
          style={{ gap: 12 }}
          data-tour="tour-goal-progress"
          data-progress-state={progress.state}
        >
          <ProgressBar
            className="flex-1"
            progress={Math.min(goal.progressPercentage, 100) / 100}
            label={percentLabel}
            color={progress.color}
          />
          <span
            className="shrink-0"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--fg-2)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {percentLabel}
          </span>
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
