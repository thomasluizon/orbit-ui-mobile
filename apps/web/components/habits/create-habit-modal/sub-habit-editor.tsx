'use client'

import { Trash2, Plus } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { MAX_HABIT_TITLE_LENGTH, MAX_SUB_HABITS } from '@orbit/shared/validation'
import { Proposed } from '@/components/ui/proposed'

export interface SubHabitEntry {
  id: string
  value: string
}

interface SubHabitEditorProps {
  subHabits: SubHabitEntry[]
  proposedItemCount?: number
  onUpdateSubHabit: (id: string, value: string) => void
  onRemoveSubHabit: (id: string) => void
  onAddSubHabit: () => void
}

export function SubHabitEditor({
  subHabits,
  proposedItemCount = 0,
  onUpdateSubHabit,
  onRemoveSubHabit,
  onAddSubHabit,
}: Readonly<SubHabitEditorProps>) {
  const t = useTranslations()

  return (
    <div className="space-y-2.5 pt-1">
      <span className="form-label">
        {t('habits.form.subHabits')}
      </span>
      {subHabits.length > 0 && (
        <div className="space-y-2">
          {subHabits.map((entry, index) => (
            <Proposed key={entry.id} proposed={index >= subHabits.length - proposedItemCount} scope="row" label={t('habits.form.proposed')}>
              <div
                className="flex items-center rounded-[14px] bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--hairline)] focus-within:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
                style={{ minHeight: 54, gap: 10, padding: '0 8px 0 16px' }}
              >
                <span className="w-4 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--fg-3)]" aria-hidden="true">{index + 1}</span>
                <input value={entry.value} type="text" maxLength={MAX_HABIT_TITLE_LENGTH} aria-label={t('habits.form.subHabitInputLabel', { index: index + 1 })} placeholder={t('habits.form.subHabitPlaceholder')} className="flex-1 min-w-0 bg-transparent text-[15px] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] border-0 focus:outline-none" onChange={(e) => onUpdateSubHabit(entry.id, e.target.value)} />
                <button type="button" aria-label={t('habits.form.removeSubHabit')} className="shrink-0 grid size-11 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] transition-colors duration-[var(--dur-fast)]" onClick={() => onRemoveSubHabit(entry.id)}>
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </Proposed>
          ))}
        </div>
      )}
      <button
        type="button"
        className="chip"
        disabled={subHabits.length >= MAX_SUB_HABITS}
        onClick={onAddSubHabit}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
        {t('habits.form.addSubHabit')}
      </button>
    </div>
  )
}
