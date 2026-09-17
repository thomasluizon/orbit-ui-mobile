'use client'

import type { ReactNode } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { ArrowLeft } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
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
}

/** The focused, stack-based view of one parent's direct sub habits. */
export function HabitDrill({
  t,
  drill,
  hasProAccess,
  renderHabitCard,
  onAddSubHabit,
}: Readonly<HabitDrillProps>) {
  const completedCount = drill.drillChildren.filter(
    (child) => child.isCompleted || child.isLoggedInRange,
  ).length
  const addRow = drill.currentParentId ? (
    <ListRow
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
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-1)] hover:bg-[var(--bg-elev)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          style={{
            width: 44,
            height: 44,
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
              done: completedCount,
              total: drill.drillChildren.length,
            })}
          </p>
        </div>
      </div>

      {drill.drillStack.length > 1 ? (
        <ListRow
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
            <p style={{ margin: 0, padding: '8px 16px', color: 'var(--fg-2)', fontSize: 14, lineHeight: 1.5 }}>
              {t('habits.noSubHabits')}
            </p>
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
        </>
      ) : null}
    </>
  )
}
