'use client'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import type { ReactNode } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { ArrowLeft } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { HabitListSkeleton } from './empty-state'

interface HabitDrillProps {
  t: (key: string, values?: Record<string, string | number>) => string
  drill: ReturnType<typeof useDrillNavigation>
  hasProAccess: boolean
  renderHabitCard: (
    habit: NormalizedHabit,
    depth: number,
    hasChildren: boolean,
    hasSubHabits: boolean,
    options?: { isDrillCard?: boolean; isDraggingList?: boolean },
  ) => ReactNode
  onAddSubHabit: (parentId: string) => void
  subHabitRefusal?: boolean
  onShowCompleted?: () => void
}

function DrillEmptyMessage({
  drill,
  t,
  onShowCompleted,
}: Readonly<Pick<HabitDrillProps, 'drill' | 't' | 'onShowCompleted'>>) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <p style={{ margin: 0, color: 'var(--fg-2)', fontSize: 14, lineHeight: 1.5 }}>
        {t(drill.hasUnfilteredChildren ? 'habits.filterEmptySubHabits' : 'habits.noSubHabits')}
      </p>
      {drill.canRevealCompletedChildren && onShowCompleted ? (
        <PillButton variant="ghost" onClick={onShowCompleted}>
          {t('habits.showCompleted')}
        </PillButton>
      ) : null}
    </div>
  )
}

/** The focused, stack-based view of one parent's direct sub habits. */
export function HabitDrill({
  t,
  drill,
  hasProAccess,
  renderHabitCard,
  onAddSubHabit,
  subHabitRefusal,
  onShowCompleted,
}: Readonly<HabitDrillProps>) {
  const addRow = drill.currentParentId ? (
    <ListRow
      compact={false}
      icon="plus"
      title={t('habits.form.addSubHabit')}
      chevron={false}
      trailing={hasProAccess ? undefined : <Badge>Pro</Badge>}
      onClick={() => onAddSubHabit(drill.currentParentId!)}
    />
  ) : null

  return (
    <>
      <div className="flex items-center" style={{ gap: 12, padding: '8px 16px 16px' }}>
        <button
          type="button"
          aria-label={t('common.back')}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-1)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          style={{
            width: TOUCH_TARGET_MIN,
            height: TOUCH_TARGET_MIN,
            boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
          }}
          onClick={drill.drillBack}
        >
          <ArrowLeft size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate"
            style={{
              margin: 0,
              color: 'var(--fg-1)',
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          >
            {drill.currentParent?.title ?? ''}
          </h2>
          <p
            style={{
              margin: 0,
              color: 'var(--fg-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
            }}
          >
            {t('habits.drillProgress', {
              done: drill.completedCount,
              total: drill.drillChildren.length,
            })}
          </p>
        </div>
      </div>

      {drill.drillStack.length > 1 ? (
        <ListRow
          compact={false}
          icon="home"
          title={t('habits.backToHabits')}
          chevron={false}
          onClick={drill.drillReset}
        />
      ) : null}

      {drill.drillLoading ? <HabitListSkeleton /> : null}

      {!drill.drillLoading && drill.drillError ? (
        <div className="flex flex-col items-center text-center" style={{ gap: 16, padding: '32px 16px' }}>
          <p role="alert" style={{ margin: 0, color: 'var(--fg-2)', fontSize: 14, lineHeight: 1.5 }}>
            {drill.drillError}
          </p>
          <PillButton variant="ghost" onClick={() => void drill.refreshCurrent()}>
            {t('common.retry')}
          </PillButton>
        </div>
      ) : null}

      {!drill.drillLoading && !drill.drillError ? (
        <>
          {drill.drillChildren.length === 0 ? (
            <DrillEmptyMessage drill={drill} t={t} onShowCompleted={onShowCompleted} />
          ) : (
            drill.drillChildren.map((child) => {
              const nestedChildren = drill.getDrillChildren(child.id)
              return renderHabitCard(
                child,
                0,
                nestedChildren.length > 0,
                child.hasSubHabits || nestedChildren.length > 0,
                { isDrillCard: true },
              )
            })
          )}
          {addRow}
          <div aria-live="polite" aria-atomic="true">
            {subHabitRefusal ? <OfflineRefusal icon="create" embedded title={t('offline.create.title')} reason={t('offline.create.reason')} /> : null}
          </div>
        </>
      ) : null}
    </>
  )
}
