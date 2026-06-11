import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useWatch } from 'react-hook-form'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { PillButton } from '@/components/ui/pill-button'
import { HabitFormFields } from './habit-form-fields'
import { SubHabitEditor, type SubHabitEntry } from './create-habit-modal/sub-habit-editor'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useProfile } from '@/hooks/use-profile'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useCreateHabit, useCreateSubHabit } from '@/hooks/use-habits'
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
import {
  buildSubHabitRequest,
  buildCreateHabitRequest,
} from '@/lib/habit-request-builders'
import { habitFormSchema } from '@orbit/shared/validation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

let subHabitCounter = 0
function createSubHabitEntry(value = ''): SubHabitEntry {
  subHabitCounter += 1
  return { id: `sub-${subHabitCounter}-${Date.now()}`, value }
}

interface CreateHabitModalProps {
  open: boolean
  onClose: () => void
  initialDate?: string | null
  parentHabit?: NormalizedHabit | null
}

export function CreateHabitModal({
  open,
  onClose,
  initialDate,
  parentHabit,
}: Readonly<CreateHabitModalProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(
    () => createStyles(tokens, insets.bottom),
    [tokens, insets.bottom],
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
  const [titleFilled, setTitleFilled] = useState(false)
  const [reminderWasManuallyToggled, setReminderWasManuallyToggled] = useState(false)
  const flushBufferedInputsRef = useRef<() => void>(() => {})
  const [initialTagIdsSnapshot, setInitialTagIdsSnapshot] = useState('[]')
  const [initialGoalIdsSnapshot, setInitialGoalIdsSnapshot] = useState('[]')
  const [initialSubHabitsSnapshot, setInitialSubHabitsSnapshot] = useState('[]')
  const [initialReminderTimesSnapshot, setInitialReminderTimesSnapshot] =
    useState('[0,15]')

  const watchedDueTime =
    useWatch({ control: formHelpers.form.control, name: 'dueTime' }) ?? ''
  const watchedReminderEnabled =
    useWatch({
      control: formHelpers.form.control,
      name: 'reminderEnabled',
    }) ?? false
  const watchedScheduledReminders =
    useWatch({
      control: formHelpers.form.control,
      name: 'scheduledReminders',
    }) ?? []

  const atGoalLimit = selectedGoalIds.length >= 10
  const isDirty =
    formHelpers.form.formState.isDirty ||
    JSON.stringify(
      [...tags.selectedTagIds].sort((left, right) => left.localeCompare(right)),
    ) !== initialTagIdsSnapshot ||
    JSON.stringify(
      [...selectedGoalIds].sort((left, right) => left.localeCompare(right)),
    ) !== initialGoalIdsSnapshot ||
    JSON.stringify(subHabits.map((entry) => entry.value)) !==
      initialSubHabitsSnapshot ||
    JSON.stringify(reminderTimes) !== initialReminderTimesSnapshot
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: onClose,
  })

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  useEffect(() => {
    if (!open || !isSubHabitMode || !profile || profile.hasProAccess) return
    onClose()
    router.push('/upgrade')
  }, [isSubHabitMode, onClose, open, profile, router])

  const [previousOpen, setPreviousOpen] = useState(false)
  if (open !== previousOpen) {
    setPreviousOpen(open)
    if (open) {
      const fallbackDate = initialDate ?? formatAPIDate(new Date())

      setReminderWasManuallyToggled(false)
      setTitleFilled(false)
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

      setInitialTagIdsSnapshot(
        JSON.stringify(
          [...(prefill?.selectedTagIds ?? [])].sort((left, right) =>
            left.localeCompare(right),
          ),
        ),
      )
      setInitialGoalIdsSnapshot(
        JSON.stringify(
          [...(prefill?.selectedGoalIds ?? [])].sort((left, right) =>
            left.localeCompare(right),
          ),
        ),
      )
      setInitialSubHabitsSnapshot(JSON.stringify([]))
      setInitialReminderTimesSnapshot(
        JSON.stringify(prefill?.reminderTimes ?? [0, 15]),
      )
    }
  }

  useEffect(() => {
    if (!open) return

    const nextReminderEnabled = resolveAutoManagedReminderEnabled({
      dueTime: watchedDueTime,
      scheduledReminderCount: watchedScheduledReminders.length,
      reminderEnabled: watchedReminderEnabled,
      reminderWasManuallyToggled,
    })

    if (
      nextReminderEnabled === null ||
      nextReminderEnabled === watchedReminderEnabled
    ) {
      return
    }

    formHelpers.form.setValue('reminderEnabled', nextReminderEnabled, {
      shouldDirty: true,
    })
  }, [
    formHelpers.form,
    open,
    reminderWasManuallyToggled,
    watchedDueTime,
    watchedReminderEnabled,
    watchedScheduledReminders.length,
  ])

  const handleReminderEnabledChange = useCallback(
    (nextEnabled: boolean) => {
      setReminderWasManuallyToggled(true)
      formHelpers.form.setValue('reminderEnabled', nextEnabled, {
        shouldDirty: true,
      })
    },
    [formHelpers.form],
  )

  const handleBufferedInputsReady = useCallback((flush: () => void) => {
    flushBufferedInputsRef.current = flush
  }, [])

  const handleSubmit = useCallback(async () => {
    flushBufferedInputsRef.current()

    if (isSubHabitMode && !hasProAccess) {
      onClose()
      router.push('/upgrade')
      return
    }

    const hasTypedSubHabits = subHabits.some(
      (entry) => entry.value.trim().length > 0,
    )
    if (!hasProAccess && hasTypedSubHabits) {
      onClose()
      router.push('/upgrade')
      return
    }

    const permittedGoalIds = hasProAccess ? selectedGoalIds : []
    const subHabitValues = hasProAccess
      ? subHabits.map((entry) => entry.value)
      : []
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
        const subRequest = buildSubHabitRequest(
          data,
          reminderTimes,
          tags.selectedTagIds,
        )
        await createSubHabit.mutateAsync({
          parentId: parentHabit.id,
          data: subRequest,
        })
      } else {
        const request = buildCreateHabitRequest(
          data,
          reminderTimes,
          tags.selectedTagIds,
          permittedGoalIds,
          subHabitValues,
        )
        await createHabit.mutateAsync(request)
      }
      onClose()
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
  }, [
    formHelpers,
    isSubHabitMode,
    parentHabit,
    tags,
    selectedGoalIds,
    subHabits,
    reminderTimes,
    createHabit,
    createSubHabit,
    hasProAccess,
    onClose,
    router,
    showError,
    translate,
  ])

  const isPending = createHabit.isPending || createSubHabit.isPending
  const submitDisabled = isPending || !titleFilled

  const updateSubHabitValue = useCallback((id: string, value: string) => {
    setSubHabits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, value } : s)),
    )
  }, [])

  const removeSubHabit = useCallback((id: string) => {
    setSubHabits((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const addSubHabit = useCallback(() => {
    setSubHabits((prev) => [...prev, createSubHabitEntry()])
  }, [])

  return (
    <>
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={
          isSubHabitMode ? t('habits.createSubHabit') : t('habits.createHabit')
        }
        snapPoints={['80%', '95%']}
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
        <KeyboardAwareBottomSheetScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <HabitFormFields
            formHelpers={formHelpers}
            tags={tags}
            selectedGoalIds={selectedGoalIds}
            atGoalLimit={atGoalLimit}
            onToggleGoal={toggleGoal}
            reminderTimes={reminderTimes}
            onReminderTimesChange={setReminderTimes}
            onReminderEnabledChange={handleReminderEnabledChange}
            onFlushBufferedInputsReady={handleBufferedInputsReady}
            onTitlePresenceChange={setTitleFilled}
          >
            {!isSubHabitMode ? (
              <SubHabitEditor
                subHabits={subHabits}
                hasProAccess={hasProAccess}
                onUpdateSubHabit={updateSubHabitValue}
                onRemoveSubHabit={removeSubHabit}
                onAddSubHabit={addSubHabit}
                tokens={tokens}
                styles={styles}
              />
            ) : null}
          </HabitFormFields>

          <View style={styles.footer}>
            <PillButton
              variant="ghost"
              disabled={isPending}
              onPress={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </PillButton>
            <PillButton
              style={styles.submitButton}
              disabled={submitDisabled}
              onPress={handleSubmit}
              leading={
                isPending ? (
                  <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
                ) : (
                  <Check size={18} color={tokens.fgOnPrimary} strokeWidth={2.2} />
                )
              }
            >
              {isSubHabitMode
                ? t('habits.createSubHabit')
                : t('habits.createHabit')}
            </PillButton>
          </View>
        </KeyboardAwareBottomSheetScrollView>
      </BottomSheetModal>
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

function createStyles(
  tokens: ReturnType<typeof createTokensV2>,
  bottomInset: number,
) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: Math.max(bottomInset, 16) + 20,
      gap: 22,
    },
    fieldLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg2,
    },
    subHabitsSection: {
      gap: 10,
    },
    subHabitsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    subHabitsHint: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      lineHeight: 19,
    },
    subHabitsList: {
      gap: 8,
    },
    subHabitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingLeft: 14,
      paddingRight: 6,
    },
    subHabitIndex: {
      width: 16,
      textAlign: 'right',
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg4,
    },
    subHabitInput: {
      flex: 1,
      minHeight: 44,
      backgroundColor: 'transparent',
      color: tokens.fg1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      borderWidth: 0,
      borderRadius: 0,
      paddingVertical: 10,
      paddingHorizontal: 0,
    },
    subHabitRemoveButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addSubHabitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgElev,
    },
    addSubHabitText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg2,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 18,
    },
    submitButton: {
      flex: 1,
    },
  })
}
