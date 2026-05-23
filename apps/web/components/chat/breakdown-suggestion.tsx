'use client'

import { useState, useMemo } from 'react'
import { Check, X, Plus, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import type { BulkHabitItem, FrequencyUnit } from '@orbit/shared/types/habit'
import { frequencyUnitSchema } from '@orbit/shared/types/habit'
import { useBulkCreateHabits } from '@/hooks/use-habits'

interface EditableHabit {
  title: string
  description: string
  frequencyUnit: FrequencyUnit | null
  frequencyQuantity: number | null
  days: string[] | null
  isBadHabit: boolean
  dueDate: string | null
  checklistItems: { text: string; isChecked: boolean }[] | null
}

interface BreakdownSuggestionProps {
  parentName: string
  subHabits: SuggestedSubHabit[]
  onConfirmed: () => void
  onCancelled: () => void
}

// Extracted outside the component to avoid re-creating the renderer on every
// render.
function RichBoldPrimary(chunks: React.ReactNode): React.ReactNode {
  return <span className="text-[var(--primary)] font-bold">{chunks}</span>
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
    () => habits.filter((h) => h.title.trim().length > 0),
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

  function resolveFrequencyQuantity(habit: EditableHabit): number | undefined {
    if (!habit.frequencyUnit) return undefined
    return habit.frequencyQuantity && habit.frequencyQuantity >= 1
      ? habit.frequencyQuantity
      : 1
  }

  async function handleConfirm() {
    if (validHabits.length === 0) return
    setCreateError('')

    try {
      const subItems: BulkHabitItem[] = validHabits.map((h) => ({
        title: h.title.trim(),
        description: h.description.trim() || undefined,
        frequencyUnit: h.frequencyUnit ?? undefined,
        frequencyQuantity: resolveFrequencyQuantity(h),
        days: h.days ?? undefined,
        isBadHabit: h.isBadHabit,
        dueDate: h.dueDate ?? undefined,
        checklistItems: h.checklistItems ?? undefined,
      }))

      if (createAsParent) {
        const firstWithFreq = validHabits.find((h) => h.frequencyUnit)
        const earliestDueDate =
          validHabits
            .map((h) => h.dueDate)
            .filter((d): d is string => !!d)
            .sort((a, b) => a.localeCompare(b))[0] ?? new Date().toISOString().slice(0, 10)

        let parentFreqQty: number | undefined
        if (firstWithFreq?.frequencyUnit) {
          parentFreqQty = resolveFrequencyQuantity(firstWithFreq)
        }

        await bulkCreate.mutateAsync({
          habits: [
            {
              title: parentName,
              frequencyUnit:
                firstWithFreq?.frequencyUnit ??
                undefined,
              frequencyQuantity: parentFreqQty,
              dueDate: earliestDueDate,
              subHabits: subItems,
            },
          ],
        })
        setCreatedCount(subItems.length)
      } else {
        await bulkCreate.mutateAsync({ habits: subItems })
        setCreatedCount(subItems.length)
      }

      setIsCreated(true)
      onConfirmed()
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : t('errors.bulkCreateHabits'),
      )
    }
  }

  const isSubmitting = bulkCreate.isPending

  if (isCreated) {
    return (
      <div className="bg-[var(--bg-elev)]/50 border border-[var(--hairline)] rounded-[var(--radius-xl)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2 py-2">
          <div className="size-6 rounded-full bg-[var(--status-done)]/20 flex items-center justify-center">
            <Check className="size-3.5 text-[var(--status-done)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--status-done)]">
            {createAsParent
              ? plural(t('habits.breakdown.createAsParentSuccess', { name: parentName, n: createdCount }), createdCount)
              : plural(t('habits.breakdown.createdSuccess', { n: createdCount }), createdCount)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-elev)]/50 border border-[var(--hairline)] rounded-[var(--radius-xl)] p-4 space-y-3 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[var(--fg-1)]">
        {t.rich('habits.breakdown.breakInto', {
          name: RichBoldPrimary,
        })}
      </p>

      <div className="space-y-3">
        {habits.map((habit, index) => (
          <div
            key={`${habit.title}-${index}`}
            className="bg-[var(--bg-elev)] border border-[var(--hairline)] rounded-[var(--radius-lg)] p-3 flex items-center justify-between gap-3"
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
                      value={habit.frequencyQuantity ?? 1}
                      onChange={(e) =>
                        updateHabit(index, {
                          frequencyQuantity: Number(e.target.value) || 1,
                        })
                      }
                      className="w-8 bg-transparent text-[11px] text-[var(--fg-2)] text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] text-[var(--fg-3)]">
                      {t(`habits.form.unit${habit.frequencyUnit}` as Parameters<typeof t>[0])} {/* NOSONAR - dynamic i18n key requires assertion */}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
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
          className={`size-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${createAsParent ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--hairline)]'}`}
        >
          {createAsParent && <Check className="size-2.5 text-white" />}
        </div>
        <span className="text-xs text-[var(--fg-2)]">
          {t('habits.breakdown.createAsParent')}
        </span>
      </label>

      {createError && <p className="text-xs text-[var(--status-bad)]">{createError}</p>}

      <div className="flex gap-2 pt-1">
        <button
          className="flex-1 py-2.5 rounded-[var(--radius-lg)] bg-[var(--primary)] text-white font-bold text-xs hover:bg-[var(--primary-pressed)] transition-[background-color,transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
          disabled={validHabits.length === 0 || isSubmitting}
          onClick={handleConfirm}
        >
          {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
          {plural(t('habits.breakdown.createCount', { n: validHabits.length }), validHabits.length)}
        </button>
        <button
          className="px-4 py-2.5 rounded-[var(--radius-lg)] border border-[var(--hairline)] text-[var(--fg-2)] text-xs font-medium hover:bg-[var(--bg-elev)]/80 transition-colors duration-150"
          disabled={isSubmitting}
          onClick={onCancelled}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
