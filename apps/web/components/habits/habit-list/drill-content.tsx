'use client'

import { Plus } from 'lucide-react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitListSkeleton } from './empty-state'

interface HabitListDrillContentProps {
  t: (key: string) => string
  drillLoading: boolean
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

/** Drill-panel body: the sub-habit list (or empty prompt) shown when the user
 *  drills into a parent. Presentational — the parent HabitList owns drill state
 *  and supplies renderHabitCard plus the add-sub-habit callback. */
export function HabitListDrillContent({
  t,
  drillLoading,
  drillChildren,
  currentParentId,
  getDrillChildren,
  renderHabitCard,
  onAddSubHabit,
}: Readonly<HabitListDrillContentProps>) {
  if (drillLoading) {
    return <HabitListSkeleton />
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
          className="w-full flex items-center justify-center gap-2 py-3 text-[var(--fg-3)] text-sm hover:text-[var(--primary-pressed)] transition-[color] duration-150"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            borderTop: '1px solid var(--hairline)',
          }}
          onClick={() => currentParentId && onAddSubHabit(currentParentId)}
        >
          <Plus className="size-4" />
          {t('habits.form.addSubHabit')}
        </button>
      </div>
    )
  }

  return (
    <div className="text-center py-8">
      <p className="text-[var(--fg-3)] text-sm">
        {t('habits.noSubHabits')}
      </p>
      <button
        className="mt-4 flex items-center justify-center gap-2 mx-auto px-6 py-3 rounded-xl border border-dashed border-[var(--hairline)] text-[var(--fg-3)] text-sm hover:border-[var(--primary)] hover:text-[var(--primary-pressed)] transition-[border-color,color,background-color,transform] duration-150"
        onClick={() => currentParentId && onAddSubHabit(currentParentId)}
      >
        <Plus className="size-4" />
        {t('habits.form.addSubHabit')}
      </button>
    </div>
  )
}
