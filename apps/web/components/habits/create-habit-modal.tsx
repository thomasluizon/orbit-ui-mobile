'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Check, Loader2, Trash2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
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
import {
  MAX_GOALS_PER_HABIT,
  MAX_HABIT_TITLE_LENGTH,
  MAX_SUB_HABITS,
  habitFormSchema,
} from '@orbit/shared/validation'

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
  const [initialSnapshot, setInitialSnapshot] = useState({
    tagIds: '[]',
    goalIds: '[]',
    subHabits: '[]',
    reminderTimes: '[0,15]',
  })

  const watchedDueTime = formHelpers.form.watch('dueTime') ?? ''
  const watchedReminderEnabled = formHelpers.form.watch('reminderEnabled') ?? false
  const watchedScheduledReminders = formHelpers.form.watch('scheduledReminders') ?? []

  const atGoalLimit = selectedGoalIds.length >= MAX_GOALS_PER_HABIT
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
        <form className="stagger-enter space-y-10" onSubmit={handleSubmit}>
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
                          onChange={(e) => updateSubHabitValue(entry.id, e.target.value)}
                        />
                        <button
                          type="button"
                          aria-label={t('habits.form.removeSubHabit')}
                          className="shrink-0 grid size-11 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] transition-colors duration-150"
                          onClick={() => removeSubHabit(entry.id)}
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
                  onClick={() => setSubHabits((prev) => [...prev, createSubHabitEntry()])}
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                  {t('habits.form.addSubHabit')}
                </button>
              </div>
            ) : (
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
          className="flex items-center"
          style={{
            gap: 12,
            paddingTop: 14,
            paddingBottom: 8,
          }}
        >
          <PillButton
            variant="ghost"
            disabled={isPending}
            onClick={dismissGuard.requestDismiss}
          >
            {t('common.cancel')}
          </PillButton>
          <PillButton
            type="submit"
            className="flex-1"
            disabled={isPending || !formHelpers.form.formState.isValid}
            dataTestId="habit-create-submit"
            leading={
              isPending ? (
                <Loader2 className="size-[18px] animate-spin" />
              ) : (
                <Check size={18} strokeWidth={2.2} aria-hidden="true" />
              )
            }
          >
            {isSubHabitMode
              ? t('habits.createSubHabit')
              : t('habits.createHabit')}
          </PillButton>
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
