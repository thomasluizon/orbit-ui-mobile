'use client'

import { useState, useMemo } from 'react'
import { Check, X, Plus, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { frequencyUnitSchema } from '@orbit/shared/types/habit'
import {
  buildBreakdownCreateRequest,
  filterValidBreakdownHabits,
  type BreakdownEditableHabit,
} from '@orbit/shared/utils'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { PillButton } from '@/components/ui/pill-button'

type EditableHabit = BreakdownEditableHabit

interface BreakdownSuggestionProps {
  parentName: string
  subHabits: SuggestedSubHabit[]
  onConfirmed: () => void
  onCancelled: () => void
}

function RichBoldPrimary(chunks: React.ReactNode): React.ReactNode {
  return <span className="text-[var(--primary)] font-semibold">{chunks}</span>
}

export function BreakdownSuggestion({
  parentName,
  subHabits,
  onConfirmed,
  onCancelled,
}: Readonly<BreakdownSuggestionProps>) {
  const t = useTranslations()
  const bulkCreate = useBulkCreateHabits()

  const [habits, setHabits] = useState<EditableHabit[]>(
    subHabits.map((h) => ({
      title: h.title,
      description: h.description ?? '',
      frequencyUnit: h.frequencyUnit ?? null,
      frequencyQuantity: h.frequencyQuantity ?? null,
      days: h.days ?? null,
      isBadHabit: h.isBadHabit ?? false,
      dueDate: h.dueDate ?? null,
      checklistItems: h.checklistItems ?? null,
    })),
  )

  const [isCreated, setIsCreated] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)
  const [createAsParent, setCreateAsParent] = useState(false)
  const [createError, setCreateError] = useState('')

  const frequencyOptions = useMemo(() => [
    { value: '', label: t('habits.filter.oneTime') },
    { value: 'Day', label: t('habits.filter.daily') },
    { value: 'Week', label: t('habits.filter.weekly') },
    { value: 'Month', label: t('habits.filter.monthly') },
    { value: 'Year', label: t('habits.filter.yearly') },
  ], [t])

  const validHabits = useMemo(
    () => filterValidBreakdownHabits(habits),
    [habits],
  )

  function updateHabit(index: number, patch: Partial<EditableHabit>) {
    setHabits((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }

  function removeHabit(index: number) {
    setHabits((prev) => prev.filter((_, i) => i !== index))
  }

  function addHabit() {
    setHabits((prev) => [
      ...prev,
      {
        title: '',
        description: '',
        frequencyUnit: null,
        frequencyQuantity: null,
        days: null,
        isBadHabit: false,
        dueDate: null,
        checklistItems: null,
      },
    ])
  }

  async function handleConfirm() {
    if (validHabits.length === 0) return
    setCreateError('')

    try {
      await bulkCreate.mutateAsync(
        buildBreakdownCreateRequest(validHabits, parentName, createAsParent),
      )
      setCreatedCount(validHabits.length)
      setIsCreated(true)
      onConfirmed()
    } catch (err: unknown) {
      setCreateError(
        process.env.NODE_ENV === 'development' && err instanceof Error
          ? err.message
          : t('errors.bulkCreateHabits'),
      )
    }
  }

  const isSubmitting = bulkCreate.isPending

  if (isCreated) {
    return (
      <div className="rounded-[16px] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
        <div className="flex items-center gap-2 py-2">
          <div className="size-6 rounded-full bg-[var(--status-done)]/20 flex items-center justify-center">
            <Check className="size-3.5 text-[var(--status-done)]" />
          </div>
          <p className="text-sm font-medium text-[var(--status-done)]">
            {createAsParent
              ? plural(t('habits.breakdown.createAsParentSuccess', { name: parentName, n: createdCount }), createdCount)
              : plural(t('habits.breakdown.createdSuccess', { n: createdCount }), createdCount)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[16px] bg-[var(--bg-field)] p-4 space-y-3 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--fg-1)',
        }}
      >
        {t.rich('habits.breakdown.breakInto', {
          name: RichBoldPrimary,
        })}
      </p>

      <div className="space-y-3">
        {habits.map((habit, index) => (
          <div
            key={`${habit.title}-${index}`}
            className="bg-[var(--bg-elev)] rounded-[12px] p-3 flex items-center justify-between gap-3 shadow-[inset_0_0_0_1px_var(--hairline)]"
          >
            <div className="flex-1 min-w-0 space-y-1">
              <input
                type="text"
                value={habit.title}
                onChange={(e) => updateHabit(index, { title: e.target.value })}
                placeholder={t('habits.breakdown.habitNamePlaceholder')}
                className="w-full bg-transparent text-sm font-medium text-[var(--fg-1)] placeholder:text-[var(--fg-3)] outline-none"
              />
              <div className="flex items-center gap-2">
                <select
                  value={habit.frequencyUnit ?? ''}
                  onChange={(e) => {
                    const rawVal = e.target.value
                    const parsed = frequencyUnitSchema.safeParse(rawVal)
                    const val: FrequencyUnit | null = parsed.success ? parsed.data : null
                    updateHabit(index, {
                      frequencyUnit: val,
                      frequencyQuantity: val ? habit.frequencyQuantity : null,
                    })
                  }}
                  className="bg-transparent text-[11px] text-[var(--fg-2)] outline-none cursor-pointer"
                >
                  {frequencyOptions.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      className="bg-[var(--bg-elev)] text-[var(--fg-1)]"
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
                {habit.frequencyUnit && (
                  <>
                    <span className="text-[11px] text-[var(--fg-3)]">{t('habits.breakdown.every')}</span>
                    <input
                      type="number"
                      min={1}
                      aria-label={t('habits.breakdown.frequencyQuantityLabel')}
                      value={habit.frequencyQuantity ?? 1}
                      onChange={(e) =>
                        updateHabit(index, {
                          frequencyQuantity: Number(e.target.value) || 1,
                        })
                      }
                      className="w-8 bg-transparent text-[11px] text-[var(--fg-2)] text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] text-[var(--fg-3)]">
                      {t(`habits.form.unit${habit.frequencyUnit}` as Parameters<typeof t>[0])} {}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label={t('habits.breakdown.removeHabit', { name: habit.title || t('habits.breakdown.habitNamePlaceholder') })}
              className="shrink-0 p-1.5 rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] hover:bg-[var(--status-bad)]/10 transition-colors"
              onClick={() => removeHabit(index)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors"
        onClick={addHabit}
      >
        <Plus className="size-3.5" />
        {t('habits.breakdown.addHabit')}
      </button>

      <label htmlFor="breakdown-create-as-parent" className="flex items-center gap-2 cursor-pointer select-none w-fit">
        <input
          id="breakdown-create-as-parent"
          type="checkbox"
          checked={createAsParent}
          onChange={(e) => setCreateAsParent(e.target.checked)}
          className="hidden"
        />
        <div
          aria-hidden="true"
          className={`size-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${createAsParent ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--fg-3)]'}`}
        >
          {createAsParent && <Check className="size-2.5 text-[var(--fg-on-primary)]" />}
        </div>
        <span className="text-xs text-[var(--fg-2)]">
          {t('habits.breakdown.createAsParent')}
        </span>
      </label>

      {createError && <p className="text-xs text-[var(--status-bad)]">{createError}</p>}

      <div className="flex gap-2 pt-1">
        <PillButton
          className="flex-1 py-[11px]! text-[14px]!"
          disabled={validHabits.length === 0 || isSubmitting}
          onClick={() => {
            void handleConfirm()
          }}
          leading={isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : undefined}
        >
          {plural(t('habits.breakdown.createCount', { n: validHabits.length }), validHabits.length)}
        </PillButton>
        <PillButton
          variant="ghost"
          className="py-[11px]! text-[14px]! px-[18px]!"
          disabled={isSubmitting}
          onClick={onCancelled}
        >
          {t('common.cancel')}
        </PillButton>
      </div>
    </div>
  )
}
