'use client'

import { useTranslations } from 'next-intl'
import { MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'
import { FieldInput } from '@/components/ui/field-input'

interface EditGoalTargetFieldsProps {
  isStreak: boolean
  targetValue: string
  unit: string
  fieldErrors: Record<string, string>
  onChangeTarget: (next: string) => void
  onChangeUnit: (next: string) => void
}

export function EditGoalTargetFields({
  isStreak,
  targetValue,
  unit,
  fieldErrors,
  onChangeTarget,
  onChangeUnit,
}: Readonly<EditGoalTargetFieldsProps>) {
  const t = useTranslations()
  return (
    <div className={isStreak ? '' : 'grid grid-cols-2'} style={{ padding: '16px 0 0', gap: 12 }}>
      <FieldInput
        label={isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
        id="edit-goal-target"
        type="number"
        step="any"
        mono
        value={targetValue}
        error={fieldErrors.targetValue}
        onChange={onChangeTarget}
      />
      {!isStreak && (
        <FieldInput
          label={t('goals.form.unit')}
          id="edit-goal-unit"
          type="text"
          value={unit}
          maxLength={MAX_GOAL_UNIT_LENGTH}
          error={fieldErrors.unit}
          onChange={onChangeUnit}
        />
      )}
    </div>
  )
}
