import { useTranslation } from 'react-i18next'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { Plus } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { useAppToast } from '@/hooks/use-app-toast'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ListRow } from '@/components/ui/list-row'
import { GoalHabitsPicker } from './goal-habits-field'
import { GoalHabitsSelectionNote } from './goal-habits-selection-note'
import { GoalDeadlineField } from '../habits/create-goal-from-habit/goal-deadline-field'
import { GoalTargetFields } from '../habits/create-goal-from-habit/goal-target-fields'
import { GoalTypeSelector } from '../habits/create-goal-from-habit/goal-type-selector'
import { createStyles } from '../habits/create-goal-from-habit/styles'
import { useMemo } from 'react'
import { Text, View } from 'react-native'
import type { CreateGoalSheetProps } from '@orbit/shared/hooks'
import { MAX_GOAL_TITLE_LENGTH } from '@orbit/shared/validation'
import { useGoalCreation } from '@/hooks/use-goal-creation'

export function CreateGoalSheet(props: Readonly<CreateGoalSheetProps>) {
  const { open, onClose } = props
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  const { showError } = useAppToast()
  const form = useGoalCreation({ ...props, translate: t, showError, closeSheet: (finish, automatic) => closeSheet(finish, automatic ? finish : undefined) })
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { goalType, description, targetValue, unit, deadline, habitIds, selectingHabits, setSelectingHabits,
    fieldErrors, formError, isSubmitting, isStreak, setDescription, setTargetValue, setUnit, setDeadline,
    setHabitIds, handleTypeChange, descriptionRef, targetRef, unitRef, dismissGuard, onSubmit } = form

  return (
    <>
      {open && !selectingHabits ? (<Sheet
        ref={sheetRef}
        open
        onClose={!isSubmitting && dismissGuard.canDismiss ? onClose : undefined}
        onAttemptDismiss={isSubmitting ? undefined : dismissGuard.requestDismiss}
        title={t('goals.create')}
        actions={(
          <ActionRow>
            <PillButton size="sm" variant="ghost" disabled={isSubmitting} onClick={dismissGuard.requestDismiss}>{t('common.cancel')}</PillButton>
            <PillButton size="sm" leadingIcon={<Plus size={16} strokeWidth={2} />} onClick={() => void onSubmit()} disabled={isSubmitting} loading={isSubmitting}>
              {t('goals.create')}
            </PillButton>
          </ActionRow>
        )}
      >
        <View style={styles.form}>
          <Text style={styles.explainer}>{t('goals.form.habitsExplainer')}</Text>
          <View>
            <Text style={styles.fieldLabel}>{t('goals.form.title')}</Text>
            <BottomSheetAppTextInput
              ref={descriptionRef}
              value={description}
              onChangeText={setDescription}
              placeholder={
                isStreak
                  ? t('goals.form.streakDescriptionPlaceholder')
                  : t('goals.form.descriptionPlaceholder')
              }
              placeholderTextColor={tokens.fg3}
              maxLength={MAX_GOAL_TITLE_LENGTH}
              accessibilityLabel={t('goals.form.title')}
              accessibilityHint={fieldErrors.description ?? t('common.required')}
            />
            {fieldErrors.description ? (
              <Text style={styles.fieldError} accessibilityRole="alert">
                {fieldErrors.description}
              </Text>
            ) : null}
          </View>

          <GoalTypeSelector
            styles={styles}
            goalType={goalType}
            onTypeChange={handleTypeChange}
          />

          <GoalTargetFields
            targetRef={targetRef}
            unitRef={unitRef}
            tokens={tokens}
            styles={styles}
            isStreak={isStreak}
            targetValue={targetValue}
            unit={unit}
            fieldErrors={fieldErrors}
            onChangeTarget={setTargetValue}
            onChangeUnit={setUnit}
          />

          <GoalDeadlineField
            tokens={tokens}
            styles={styles}
            deadline={deadline}
            onChangeDeadline={setDeadline}
          />
          {formError ? <Text accessibilityRole="alert" style={styles.fieldError}>{formError}</Text> : null}
          <GoalHabitsSelectionNote selectedIds={habitIds} goalType={goalType} />
          <ListRow title={t('goals.linkedHabits')} value={t('habits.form.selectedCount', { count: habitIds.length })} placement="column" disabled={isSubmitting} onClick={() => closeSheet(() => setSelectingHabits(true))} />
        </View>
      </Sheet>) : null}
      {open && selectingHabits ? <GoalHabitsPicker selectedIds={habitIds} goalType={goalType} onChange={setHabitIds} disabled={isSubmitting} onClose={() => setSelectingHabits(false)} /> : null}
      <DiscardChangesSheet
        open={dismissGuard.showDiscardDialog}
        onKeepEditing={dismissGuard.cancelDismiss}
        onDiscard={dismissGuard.confirmDismiss}
      />
    </>
  )
}
