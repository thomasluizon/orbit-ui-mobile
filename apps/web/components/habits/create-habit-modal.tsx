'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Loader2, Trash2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ProBadge } from '@/components/ui/pro-badge'
import { HabitFormFields } from './habit-form-fields'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useCreateHabit, useCreateSubHabit } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import {
  applyHabitFormMode,
  buildEmptyHabitFormValues,
  buildParentHabitFormState,
  formatAPIDate,
  getFriendlyErrorMessage,
  resolveAutoManagedReminderEnabled,
  toggleSelectedId,
} from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildSubHabitRequest, buildCreateHabitRequest, type HabitFormData } from '@/lib/habit-request-builders'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubHabitEntry {
  id: string
  value: string
}

function createSubHabitEntry(value = ''): SubHabitEntry {
  return { id: crypto.randomUUID(), value }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateHabitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string | null
  parentHabit?: NormalizedHabit | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateHabitModal({
  open,
  onOpenChange,
  initialDate,
  parentHabit,
}: Readonly<CreateHabitModalProps>) {
  const t = useTranslations()
  const router = useRouter()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const { profile } = useProfile()
  const createHabit = useCreateHabit()
  const createSubHabit = useCreateSubHabit()
  const { showError } = useAppToast()
  const isSubHabitMode = !!parentHabit
  const hasProAccess = profile?.hasProAccess ?? false
  const activeView = useUIStore((s) => s.activeView)

  const formHelpers = useHabitForm({
    initialData: {
      dueDate: initialDate ?? formatAPIDate(new Date()),
    },
  })

  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [subHabits, setSubHabits] = useState<SubHabitEntry[]>([])
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const reminderWasManuallyToggledRef = useRef(false)
  const initialTagIdsRef = useRef('[]')
  const initialGoalIdsRef = useRef('[]')
  const initialSubHabitsRef = useRef('[]')
  const initialReminderTimesRef = useRef('[0,15]')

  const watchedDueTime = formHelpers.form.watch('dueTime') ?? ''
  const watchedReminderEnabled = formHelpers.form.watch('reminderEnabled') ?? false
  const watchedScheduledReminders = formHelpers.form.watch('scheduledReminders') ?? []

  const atGoalLimit = selectedGoalIds.length >= 10
  const isDirty =
    formHelpers.form.formState.isDirty ||
    JSON.stringify([...tags.selectedTagIds].sort((left, right) => left.localeCompare(right))) !== initialTagIdsRef.current ||
    JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right))) !== initialGoalIdsRef.current ||
    JSON.stringify(subHabits.map((entry) => entry.value)) !== initialSubHabitsRef.current ||
    JSON.stringify(reminderTimes) !== initialReminderTimesRef.current
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => onOpenChange(false),
  })

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  useEffect(() => {
    if (!open || !isSubHabitMode || !profile || profile.hasProAccess) return

    onOpenChange(false)
    router.push('/upgrade')
  }, [isSubHabitMode, onOpenChange, open, profile, router])

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!open) return

    const fallbackDate = initialDate ?? formatAPIDate(new Date())

    reminderWasManuallyToggledRef.current = false
    formHelpers.form.reset(buildEmptyHabitFormValues(fallbackDate))
    tags.resetTags()
    setSelectedGoalIds([])
    setSubHabits([])
    setReminderTimes([0, 15])

    let prefill: ReturnType<typeof buildParentHabitFormState> | null = null

    if (parentHabit) {
      prefill = buildParentHabitFormState(parentHabit, fallbackDate)
      formHelpers.form.reset(prefill.formValues)
      applyHabitFormMode(prefill.mode, formHelpers)
      tags.resetTags(prefill.selectedTagIds)
      setSelectedGoalIds(prefill.selectedGoalIds)
      setReminderTimes(prefill.reminderTimes)
    } else if (activeView === 'general') {
      formHelpers.setGeneral()
    }

    initialTagIdsRef.current = JSON.stringify(
      [...(prefill?.selectedTagIds ?? [])].sort((left, right) => left.localeCompare(right)),
    )
    initialGoalIdsRef.current = JSON.stringify(
      [...(prefill?.selectedGoalIds ?? [])].sort((left, right) => left.localeCompare(right)),
    )
    initialSubHabitsRef.current = JSON.stringify([])
    initialReminderTimesRef.current = JSON.stringify(prefill?.reminderTimes ?? [0, 15])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (hasProAccess || subHabits.length === 0) return
    setSubHabits([])
  }, [hasProAccess, subHabits.length])

  useEffect(() => {
    if (!open) return

    const nextReminderEnabled = resolveAutoManagedReminderEnabled({
      dueTime: watchedDueTime,
      scheduledReminderCount: watchedScheduledReminders.length,
      reminderEnabled: watchedReminderEnabled,
      reminderWasManuallyToggled: reminderWasManuallyToggledRef.current,
    })

    if (nextReminderEnabled === null || nextReminderEnabled === watchedReminderEnabled) {
      return
    }

    formHelpers.form.setValue('reminderEnabled', nextReminderEnabled, {
      shouldDirty: true,
    })
  }, [formHelpers.form, open, watchedDueTime, watchedReminderEnabled, watchedScheduledReminders.length])

  const handleReminderEnabledChange = useCallback((nextEnabled: boolean) => {
    reminderWasManuallyToggledRef.current = true
    formHelpers.form.setValue('reminderEnabled', nextEnabled, {
      shouldDirty: true,
    })
  }, [formHelpers.form])

  const handleSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
      e.preventDefault()

      if (isSubHabitMode && !hasProAccess) {
        onOpenChange(false)
        router.push('/upgrade')
        return
      }

      const data = formHelpers.form.getValues() as unknown as HabitFormData
      const permittedGoalIds = hasProAccess ? selectedGoalIds : []
      const subHabitValues = hasProAccess ? subHabits.map((entry) => entry.value) : []
      const error = formHelpers.validateAll({
        reminderTimes,
        selectedGoalIds: permittedGoalIds,
        selectedTagIds: tags.selectedTagIds,
        subHabits: subHabitValues,
      })
      if (error) {
        showError(error)
        return
      }

      try {
        if (isSubHabitMode && parentHabit) {
          const subRequest = buildSubHabitRequest(data, reminderTimes, tags.selectedTagIds)
          await createSubHabit.mutateAsync({ parentId: parentHabit.id, data: subRequest })
        } else {
          const request = buildCreateHabitRequest(data, reminderTimes, tags.selectedTagIds, permittedGoalIds, subHabitValues)
          await createHabit.mutateAsync(request)
        }
        onOpenChange(false)
      } catch (error) {
        showError(
          getFriendlyErrorMessage(
            error,
            translate,
            isSubHabitMode ? 'errors.createSubHabit' : 'errors.createHabit',
            isSubHabitMode ? 'subHabit' : 'habit',
          ),
        )
      }
    },
    [createHabit, createSubHabit, formHelpers, hasProAccess, isSubHabitMode, onOpenChange, parentHabit, reminderTimes, router, selectedGoalIds, showError, subHabits, tags, translate],
  )

  const isPending = createHabit.isPending || createSubHabit.isPending

  const updateSubHabitValue = useCallback((id: string, value: string) => {
    setSubHabits((prev) => prev.map((s) => s.id === id ? { ...s, value } : s))
  }, [])

  const removeSubHabit = useCallback((id: string) => {
    setSubHabits((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={isSubHabitMode ? t('habits.createSubHabit') : t('habits.createHabit')}
        description={
          isSubHabitMode
            ? t('habits.form.createSubHabitDescription')
            : t('habits.form.createDescription')
        }
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
        initialFocusRef={titleInputRef}
      >
        <form className="space-y-10" onSubmit={handleSubmit}>
        <HabitFormFields
          formHelpers={formHelpers}
          titleInputRef={titleInputRef}
          tags={tags}
          selectedGoalIds={selectedGoalIds}
          atGoalLimit={atGoalLimit}
          onToggleGoal={toggleGoal}
          reminderTimes={reminderTimes}
          onReminderTimesChange={setReminderTimes}
          onReminderEnabledChange={handleReminderEnabledChange}
        >
          {/* Sub-habits (create-only, not in sub-habit mode) */}
          {!isSubHabitMode && (
            hasProAccess ? (
              <div className="space-y-2.5 pt-1">
                <span className="form-label" aria-hidden="true">
                  {t('habits.form.subHabits')}
                </span>
                {subHabits.length > 0 && (
                  <div className="space-y-2">
                    {subHabits.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2">
                        <input
                          value={entry.value}
                          type="text"
                          maxLength={200}
                          placeholder={t('habits.form.subHabitPlaceholder')}
                          className="flex-1 bg-surface text-text-primary placeholder-text-muted rounded-lg py-3 px-4 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                          onChange={(e) => updateSubHabitValue(entry.id, e.target.value)}
                        />
                        <button
                          type="button"
                          className="shrink-0 p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-all duration-150 rounded-full"
                          onClick={() => removeSubHabit(entry.id)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  disabled={subHabits.length >= 20}
                  onClick={() => setSubHabits((prev) => [...prev, createSubHabitEntry()])}
                >
                  <Plus className="size-3.5" />
                  {t('habits.form.addSubHabit')}
                </button>
              </div>
            ) : (
              <div className="rounded-[var(--radius-xl)] border border-border-muted bg-surface-ground p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="form-label !mb-0" aria-hidden="true">
                        {t('habits.form.subHabits')}
                      </span>
                      <ProBadge />
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {t('upgrade.comparison.subHabits.tooltip')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                    onClick={() => router.push('/upgrade')}
                  >
                    {t('upgrade.subscribe')}
                  </button>
                </div>
              </div>
            )
          )}
        </HabitFormFields>

        {/* Submit buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            className="flex-1 py-3.5 rounded-xl border border-border text-text-secondary font-semibold text-sm hover:bg-surface-elevated/80 transition-all duration-150"
            disabled={isPending}
            onClick={dismissGuard.requestDismiss}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="flex-[2] py-3.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] shadow-[var(--shadow-glow)] disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={isPending || !formHelpers.form.formState.isValid}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isSubHabitMode
              ? t('habits.createSubHabit')
              : t('habits.createHabit')}
          </button>
        </div>
        </form>
      </AppOverlay>
      <ConfirmDialog
        open={dismissGuard.showDiscardDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismissGuard.cancelDismiss()
        }}
        title={t('common.discardChangesTitle')}
        description={t('common.discardChangesDescription')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.keepEditing')}
        onConfirm={dismissGuard.confirmDismiss}
        onCancel={dismissGuard.cancelDismiss}
        variant="warning"
      />
    </>
  )
}
