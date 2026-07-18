'use client'

import { Trash2, Plus } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { ProBadge } from '@/components/ui/pro-badge'
import { FieldInput } from '@/components/ui/field-input'
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
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="form-label">
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
            className="flex min-h-11 shrink-0 items-center text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors duration-[var(--dur-fast)]"
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
      <span className="form-label">
        {t('habits.form.subHabits')}
      </span>
      {subHabits.length > 0 && (
        <div className="flex flex-col gap-2">
          {subHabits.map((entry, index) => (
            <FieldInput
              key={entry.id}
              value={entry.value}
              maxLength={MAX_HABIT_TITLE_LENGTH}
              ariaLabel={t('habits.form.subHabitInputLabel', { index: index + 1 })}
              placeholder={t('habits.form.subHabitPlaceholder')}
              onChange={(next) => onUpdateSubHabit(entry.id, next)}
              leading={
                <span
                  className="w-4 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--fg-3)]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
              }
              trailing={
                <button
                  type="button"
                  aria-label={t('habits.form.removeSubHabit')}
                  className="shrink-0 grid size-11 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] transition-colors duration-[var(--dur-fast)]"
                  onClick={() => onRemoveSubHabit(entry.id)}
                >
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              }
            />
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
