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
import { buildSubHabitRequest, buildCreateHabitRequest } from '@/lib/habit-request-builders'
import { habitFormSchema } from '@orbit/shared/validation'

interface SubHabitEntry {
  id: string
  value: string
}

function createSubHabitEntry(value = ''): SubHabitEntry {
  return { id: crypto.randomUUID(), value }
}

interface CreateHabitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string | null
  parentHabit?: NormalizedHabit | null
}

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
  const [reminderWasManuallyToggled, setReminderWasManuallyToggled] = useState(false)
  // Initial snapshot strings captured on open so the dirty-check can read them
  // during render. State (not refs) so render-time reads are lint-safe.
  const [initialSnapshot, setInitialSnapshot] = useState({
    tagIds: '[]',
    goalIds: '[]',
    subHabits: '[]',
    reminderTimes: '[0,15]',
  })

  const watchedDueTime = formHelpers.form.watch('dueTime') ?? ''
  const watchedReminderEnabled = formHelpers.form.watch('reminderEnabled') ?? false
  const watchedScheduledReminders = formHelpers.form.watch('scheduledReminders') ?? []

  const atGoalLimit = selectedGoalIds.length >= 10
  const isDirty =
    formHelpers.form.formState.isDirty ||
    JSON.stringify([...tags.selectedTagIds].sort((left, right) => left.localeCompare(right))) !== initialSnapshot.tagIds ||
    JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right))) !== initialSnapshot.goalIds ||
    JSON.stringify(subHabits.map((entry) => entry.value)) !== initialSnapshot.subHabits ||
    JSON.stringify(reminderTimes) !== initialSnapshot.reminderTimes
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

  const [previousOpen, setPreviousOpen] = useState(false)
  if (open !== previousOpen) {
    setPreviousOpen(open)
    if (open) {
      const fallbackDate = initialDate ?? formatAPIDate(new Date())

      setReminderWasManuallyToggled(false)
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

      setInitialSnapshot({
        tagIds: JSON.stringify(
          [...(prefill?.selectedTagIds ?? [])].sort((left, right) => left.localeCompare(right)),
        ),
        goalIds: JSON.stringify(
          [...(prefill?.selectedGoalIds ?? [])].sort((left, right) => left.localeCompare(right)),
        ),
        subHabits: JSON.stringify([]),
        reminderTimes: JSON.stringify(prefill?.reminderTimes ?? [0, 15]),
      })
    }
  }

  // Drop sub-habit entries if the user loses pro access. "Adjusting state when
  // a prop changes" pattern: track previous prop, react in render.
  const [previousHasProAccess, setPreviousHasProAccess] = useState(hasProAccess)
  if (hasProAccess !== previousHasProAccess) {
    setPreviousHasProAccess(hasProAccess)
    if (!hasProAccess && subHabits.length > 0) setSubHabits([])
  }

  useEffect(() => {
    if (!open) return

    const nextReminderEnabled = resolveAutoManagedReminderEnabled({
      dueTime: watchedDueTime,
      scheduledReminderCount: watchedScheduledReminders.length,
      reminderEnabled: watchedReminderEnabled,
      reminderWasManuallyToggled,
    })

    if (nextReminderEnabled === null || nextReminderEnabled === watchedReminderEnabled) {
      return
    }

    formHelpers.form.setValue('reminderEnabled', nextReminderEnabled, {
      shouldDirty: true,
    })
  }, [formHelpers.form, open, reminderWasManuallyToggled, watchedDueTime, watchedReminderEnabled, watchedScheduledReminders.length])

  const handleReminderEnabledChange = useCallback((nextEnabled: boolean) => {
    setReminderWasManuallyToggled(true)
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
      const data = habitFormSchema.parse(formHelpers.form.getValues())

      try {
        if (isSubHabitMode && parentHabit) {
          const subRequest = buildSubHabitRequest(data, reminderTimes, tags.selectedTagIds)
          await createSubHabit.mutateAsync({ parentId: parentHabit.id, data: subRequest })
        } else {
          const request = buildCreateHabitRequest(data, reminderTimes, tags.selectedTagIds, permittedGoalIds, subHabitValues)
          await createHabit.mutateAsync(request)
        }
        onOpenChange(false)
      } catch (error: unknown) {
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
                          className="flex-1 bg-[var(--bg-sunk)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-lg py-3 px-4 text-sm border border-[var(--hairline)] focus:outline-none focus:border-[var(--primary)] transition-[border-color]"
                          onChange={(e) => updateSubHabitValue(entry.id, e.target.value)}
                        />
                        <button
                          type="button"
                          className="shrink-0 p-2 text-[var(--fg-3)] hover:text-[var(--status-bad)] transition-colors duration-150 rounded-full"
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
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors"
                  disabled={subHabits.length >= 20}
                  onClick={() => setSubHabits((prev) => [...prev, createSubHabitEntry()])}
                >
                  <Plus className="size-3.5" />
                  {t('habits.form.addSubHabit')}
                </button>
              </div>
            ) : (
              <div className="rounded-[var(--radius-xl)] border border-[var(--hairline)] bg-[var(--bg-sunk)] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="form-label !mb-0" aria-hidden="true">
                        {t('habits.form.subHabits')}
                      </span>
                      <ProBadge />
                    </div>
                    <p className="text-xs text-[var(--fg-3)] leading-relaxed">
                      {t('upgrade.comparison.subHabits.tooltip')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors"
                    onClick={() => router.push('/upgrade')}
                  >
                    {t('upgrade.subscribe')}
                  </button>
                </div>
              </div>
            )
          )}
        </HabitFormFields>

        <div
          className="flex items-center justify-between"
          style={{
            paddingTop: 12,
            paddingBottom: 8,
            borderTop: '1px solid var(--hairline)',
            marginTop: 4,
          }}
        >
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-50"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--fg-3)',
              padding: 6,
            }}
            disabled={isPending}
            onClick={dismissGuard.requestDismiss}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="appearance-none border-0 cursor-pointer disabled:opacity-50 inline-flex items-center"
            style={{
              background: 'var(--primary)',
              color: 'var(--fg-on-primary)',
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontWeight: 600,
              padding: '10px 18px',
              borderRadius: 8,
              gap: 6,
            }}
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
