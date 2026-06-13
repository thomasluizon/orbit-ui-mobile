'use client'

import { Plus } from 'lucide-react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { PillButton } from '@/components/ui/pill-button'
import { HabitListSkeleton } from './empty-state'

interface HabitListDrillContentProps {
  t: (key: string) => string
  drillLoading: boolean
  drillError: string
  drillChildren: NormalizedHabit[]
  currentParentId: string | null
  getDrillChildren: (habitId: string) => NormalizedHabit[]
  renderHabitCard: (
    habit: NormalizedHabit,
    depth: number,
    hasChildren: boolean,
    hasSubHabits: boolean,
    options?: { isDrillCard?: boolean; isDraggingList?: boolean },
  ) => React.ReactNode
  onAddSubHabit: (parentId: string) => void
}

/** Drill-panel body: the sub-habit list (or error/empty prompt) shown when the
 *  user drills into a parent. Presentational — the parent HabitList owns drill
 *  state and supplies renderHabitCard plus the add-sub-habit callback. */
export function HabitListDrillContent({
  t,
  drillLoading,
  drillError,
  drillChildren,
  currentParentId,
  getDrillChildren,
  renderHabitCard,
  onAddSubHabit,
}: Readonly<HabitListDrillContentProps>) {
  if (drillLoading) {
    return <HabitListSkeleton />
  }

  if (drillError) {
    return (
      <div className="flex flex-col items-center text-center" style={{ padding: '32px 20px' }}>
        <p
          role="alert"
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--status-bad)',
          }}
        >
          {drillError}
        </p>
      </div>
    )
  }

  if (drillChildren.length > 0) {
    return (
      <div>
        {drillChildren.map((child) =>
          renderHabitCard(
            child,
            0,
            getDrillChildren(child.id).length > 0,
            child.hasSubHabits || getDrillChildren(child.id).length > 0,
            { isDrillCard: true },
          ),
        )}
        <button
          type="button"
          className="w-full appearance-none border-0 bg-transparent cursor-pointer flex items-center justify-center text-[var(--fg-3)] hover:text-[var(--primary-pressed)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
          style={{
            gap: 8,
            padding: '12px 20px',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 500,
          }}
          onClick={() => currentParentId && onAddSubHabit(currentParentId)}
        >
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          {t('habits.form.addSubHabit')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center" style={{ padding: '32px 20px' }}>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          color: 'var(--fg-3)',
        }}
      >
        {t('habits.noSubHabits')}
      </p>
      <PillButton
        variant="ghost"
        className="mt-[18px]"
        leading={<Plus size={18} strokeWidth={1.8} color="var(--fg-1)" aria-hidden="true" />}
        onClick={() => {
          if (currentParentId) onAddSubHabit(currentParentId)
        }}
      >
        {t('habits.form.addSubHabit')}
      </PillButton>
    </div>
  )
}
