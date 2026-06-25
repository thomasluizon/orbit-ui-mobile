'use client'

import { Trash2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ProBadge } from '@/components/ui/pro-badge'
import { MAX_HABIT_TITLE_LENGTH, MAX_SUB_HABITS } from '@orbit/shared/validation'

export interface SubHabitEntry {
  id: string
  value: string
}

interface SubHabitEditorProps {
  subHabits: SubHabitEntry[]
  hasProAccess: boolean
  onUpdateSubHabit: (id: string, value: string) => void
  onRemoveSubHabit: (id: string) => void
  onAddSubHabit: () => void
  onUpgrade: () => void
}

export function SubHabitEditor({
  subHabits,
  hasProAccess,
  onUpdateSubHabit,
  onRemoveSubHabit,
  onAddSubHabit,
  onUpgrade,
}: Readonly<SubHabitEditorProps>) {
  const t = useTranslations()

  if (!hasProAccess) {
    return (
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="form-label !mb-0" aria-hidden="true">
                {t('habits.form.subHabits')}
              </span>
              <ProBadge />
            </div>
            <p className="text-xs text-[var(--fg-3)] leading-relaxed">
              {t('upgrade.features.subHabits.tooltip')}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors duration-150"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500 }}
            onClick={onUpgrade}
          >
            {t('upgrade.subscribe')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5 pt-1">
      <span className="form-label" aria-hidden="true">
        {t('habits.form.subHabits')}
      </span>
      {subHabits.length > 0 && (
        <div className="space-y-2">
          {subHabits.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center rounded-[14px] bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--hairline)] focus-within:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
              style={{ minHeight: 48, gap: 10, padding: '0 8px 0 16px' }}
            >
              <input
                value={entry.value}
                type="text"
                maxLength={MAX_HABIT_TITLE_LENGTH}
                placeholder={t('habits.form.subHabitPlaceholder')}
                className="flex-1 min-w-0 bg-transparent text-[15px] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] border-0 focus:outline-none"
                onChange={(e) => onUpdateSubHabit(entry.id, e.target.value)}
              />
              <button
                type="button"
                aria-label={t('habits.form.removeSubHabit')}
                className="shrink-0 grid size-11 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] transition-colors duration-150"
                onClick={() => onRemoveSubHabit(entry.id)}
              >
                <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="chip disabled:opacity-40"
        disabled={subHabits.length >= MAX_SUB_HABITS}
        onClick={onAddSubHabit}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
        {t('habits.form.addSubHabit')}
      </button>
    </div>
  )
}
