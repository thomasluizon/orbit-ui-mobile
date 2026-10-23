'use client'

import { useTranslations } from 'next-intl'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Plus } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { useAppToast } from '@/hooks/use-app-toast'
import { ListRow } from '@/components/ui/list-row'
import { GoalHabitsPicker } from './goal-habits-field'
import { GoalHabitsSelectionNote } from './goal-habits-selection-note'
import { FieldWell } from '@/components/goals/field-well'
import { GoalDeadlineField } from '../habits/create-goal-from-habit/goal-deadline-field'
import { GoalTargetFields } from '../habits/create-goal-from-habit/goal-target-fields'
import { GoalTypeSelector } from '../habits/create-goal-from-habit/goal-type-selector'
import { useId, useRef } from 'react'
import type { CreateGoalSheetProps } from '@orbit/shared/hooks'
import { MAX_GOAL_TITLE_LENGTH } from '@orbit/shared/validation'
import { useGoalCreation } from '@/hooks/use-goal-creation'

export function CreateGoalSheet(props: Readonly<CreateGoalSheetProps & { restoreFocusOnCreate?: boolean }>) {
  const { open, onClose } = props
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const { showError } = useAppToast()
  const restoreTriggerFocus = useRef(true)
  const form = useGoalCreation({ ...props, translate: t, showError, closeSheet: (finish, automatic) => {
    restoreTriggerFocus.current = !automatic || props.restoreFocusOnCreate !== false
    closeSheet(finish)
  } })
  const formId = useId()

  const { goalType, description, targetValue, unit, deadline, habitIds, selectingHabits, setSelectingHabits,
    fieldErrors, formError, isSubmitting, isStreak, setDescription, setTargetValue, setUnit, setDeadline,
    setHabitIds, handleTypeChange, descriptionRef, targetRef, unitRef, dismissGuard, onSubmit } = form

  return (
    <>
      {open && !selectingHabits ? (<Sheet
        ref={sheetRef}
        finalFocus={() => restoreTriggerFocus.current}
        open
        onClose={!isSubmitting && dismissGuard.canDismiss ? onClose : undefined}
        onAttemptDismiss={isSubmitting ? undefined : dismissGuard.requestDismiss}
        title={t('goals.create')}
        actions={(
          <ActionRow>
            <PillButton size="sm" variant="ghost" disabled={isSubmitting} onClick={dismissGuard.requestDismiss}>
              {t('common.cancel')}
            </PillButton>
            <PillButton size="sm" leadingIcon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} formId={formId} disabled={isSubmitting} loading={isSubmitting}>
              {t('goals.create')}
            </PillButton>
          </ActionRow>
        )}
      >
        <form id={formId} onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void onSubmit() }} noValidate>
          <p className="max-w-prose pb-4 text-sm leading-[1.55] text-pretty text-[var(--fg-2)]">{t('goals.form.habitsExplainer')}</p>
          <div>
            <FieldWell
              inputRef={descriptionRef}
              label={t('goals.form.title')}
              id="create-goal-description"
              type="text"
              value={description}
              placeholder={
                isStreak
                  ? t('goals.form.streakDescriptionPlaceholder')
                  : t('goals.form.descriptionPlaceholder')
              }
              maxLength={MAX_GOAL_TITLE_LENGTH}
              required
              error={fieldErrors.description}
              onChange={setDescription}
            />
          </div>

          <div style={{ padding: "var(--orbit-space-16) var(--orbit-space-0) var(--orbit-space-0)" }}>
            <GoalTypeSelector goalType={goalType} onTypeChange={handleTypeChange} />
          </div>

          <GoalTargetFields
            targetRef={targetRef}
            unitRef={unitRef}
            isStreak={isStreak}
            targetValue={targetValue}
            unit={unit}
            fieldErrors={fieldErrors}
            onChangeTarget={setTargetValue}
            onChangeUnit={setUnit}
          />

          <GoalDeadlineField deadline={deadline} onChangeDeadline={setDeadline} />
          <ListRow title={t('goals.linkedHabits')} value={t('habits.form.selectedCount', { count: habitIds.length })} placement="column" disabled={isSubmitting} onClick={() => closeSheet(() => setSelectingHabits(true))} />
          <GoalHabitsSelectionNote selectedIds={habitIds} goalType={goalType} />
          {formError ? <p role="alert" className="pt-3 text-sm text-[var(--status-bad-text)]">{formError}</p> : null}
        </form>
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
