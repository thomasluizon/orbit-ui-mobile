'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PencilLine, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatLocaleDateTime } from '@orbit/shared/utils'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { SkeletonCard } from '@/components/ui/skeleton'
import { TrendLine, type TrendPoint } from '@/components/charts/trend-line'
import { useGoalDetail, useGoals } from '@/hooks/use-goals'
import { GoalAskAstraRow } from './goal-ask-astra-row'
import { GoalDetailDrawer, type GoalDrawerInitialAction } from './goal-detail-drawer'
import {
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
} from './goal-detail-sections'
import { GoalProgressRing } from './goal-detail-drawer/goal-progress-ring'
import { GoalMetricsPanel } from './goal-metrics-panel'
import { GoalStatusBadge } from './goal-status-badge'

interface GoalDetailPanelProps {
  goalId: string | null
}

const TREND_MIN_POINTS = 2

/** Desktop master-detail right pane: an always-visible read view of the selected
 *  goal (progress ring, metrics, a progress trend, linked habits and history)
 *  with the full edit/update/delete flow reused from the GoalDetailDrawer modal. */
export function GoalDetailPanel({ goalId }: Readonly<GoalDetailPanelProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerAction, setDrawerAction] = useState<GoalDrawerInitialAction | null>(null)

  const openDrawer = useCallback((initialAction: GoalDrawerInitialAction | null) => {
    setDrawerAction(initialAction)
    setDrawerOpen(true)
  }, [])

  const { data: goalsData } = useGoals()
  const { data: detailData, isLoading } = useGoalDetail(goalId)

  const detail = detailData?.goal ?? null
  const goal = detail ?? (goalId ? goalsData?.goalsById.get(goalId) ?? null : null)
  const metrics = detailData?.metrics ?? null
  const isStreak = isStreakGoal(goal?.type)

  const trendPoints = useMemo<TrendPoint[]>(() => {
    return (detail?.progressHistory ?? []).map((entry) => ({
      label: formatLocaleDateTime(entry.createdAtUtc, locale, {
        month: 'short',
        day: 'numeric',
      }),
      value: entry.value,
    }))
  }, [detail?.progressHistory, locale])

  const formatHistoryDate = useCallback(
    (dateStr: string) =>
      formatLocaleDateTime(dateStr, locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [locale],
  )

  function handleAskAstra() {
    if (!goal) return
    const seed = t('goals.detail.askAstraSeedDefault', { title: goal.title })
    if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem('orbit-chat-draft', seed)
    }
    router.push('/chat')
  }

  if (!goalId) return null

  if (!goal) {
    return <SkeletonCard lines={6} className="rounded-[18px]" />
  }

  const statusBadge =
    goal.status === 'Completed'
      ? { text: t('goals.status.completed'), color: 'var(--status-done)' }
      : goal.status === 'Abandoned'
        ? { text: t('goals.status.abandoned'), color: 'var(--fg-3)' }
        : null

  const progressOfLabel = isStreak
    ? t('goals.streak.ofTarget', { current: goal.currentValue, target: goal.targetValue })
    : t('goals.progressOf', {
        current: goal.currentValue,
        target: goal.targetValue,
        unit: goal.unit,
      })

  return (
    <section aria-label={goal.title} className="min-h-[420px]">
      <div className="flex items-center px-5 pt-1" style={{ gap: 12 }}>
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'var(--bg-elev)',
            fontSize: 20,
            lineHeight: 1,
          }}
        >
          {isStreak ? '🔥' : '🎯'}
        </span>
        <h2
          className={`min-w-0 flex-1 overflow-hidden line-clamp-2 ${
            goal.status === 'Abandoned' ? 'line-through text-[var(--fg-3)]' : ''
          }`}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: goal.status === 'Abandoned' ? undefined : 'var(--fg-1)',
            overflowWrap: 'anywhere',
          }}
        >
          {goal.title}
        </h2>
        {statusBadge && <GoalStatusBadge text={statusBadge.text} color={statusBadge.color} />}
      </div>

      <SectionLabel>{t('goals.progress')}</SectionLabel>
      <div style={{ padding: '2px 20px 16px' }}>
        <GoalProgressRing
          progressPercentage={goal.progressPercentage}
          percentLabel={t('goals.progressPercentage', {
            pct: Math.round(goal.progressPercentage),
          })}
          progressOfLabel={progressOfLabel}
          color={isStreak ? 'var(--status-overdue)' : 'var(--primary)'}
        />
        {trendPoints.length >= TREND_MIN_POINTS && (
          <div className="mt-4">
            <TrendLine points={trendPoints} ariaLabel={t('goals.progress')} />
          </div>
        )}
        <div className="flex justify-center">
          {goal.status === 'Active' ? (
            <PillButton
              fullWidth
              className="mt-[14px] max-w-[360px]"
              leading={
                <Plus size={18} strokeWidth={1.8} color="var(--fg-on-primary)" aria-hidden="true" />
              }
              onClick={() => openDrawer('progress')}
            >
              {t('goals.updateProgress')}
            </PillButton>
          ) : (
            <PillButton
              variant="ghost"
              fullWidth
              className="mt-[14px] max-w-[360px]"
              leading={
                <PencilLine size={18} strokeWidth={1.8} color="var(--fg-1)" aria-hidden="true" />
              }
              onClick={() => openDrawer('edit')}
            >
              {t('goals.detail.edit')}
            </PillButton>
          )}
        </div>
      </div>

      {goal.status === 'Active' && (
        <GoalMetricsPanel
          metrics={metrics}
          unit={goal.unit}
          isLoading={isLoading}
          isStreak={isStreak}
        />
      )}

      <GoalLinkedHabitsSection
        title={t('goals.linkedHabits')}
        linkedHabits={goal.linkedHabits ?? []}
      />

      <GoalProgressHistorySection
        title={t('goals.progressHistory')}
        entries={detail?.progressHistory ?? []}
        formatDate={formatHistoryDate}
        renderEntryLabel={(entry) =>
          t('goals.progressEntry', {
            previous: entry.previousValue,
            value: entry.value,
            unit: goal.unit,
          })
        }
        showAllLabel={t('goals.detail.showAllHistory')}
        showLessLabel={t('goals.detail.showLessHistory')}
      />

      <div
        style={{
          marginTop: 16,
          borderTop: '1px solid var(--hairline)',
          padding: '16px 20px 4px',
        }}
      >
        <GoalAskAstraRow onClick={handleAskAstra} />
      </div>

      <GoalDetailDrawer
        open={drawerOpen}
        onOpenChange={(nextOpen) => {
          setDrawerOpen(nextOpen)
          if (!nextOpen) setDrawerAction(null)
        }}
        goalId={goal.id}
        initialAction={drawerAction}
      />
    </section>
  )
}
