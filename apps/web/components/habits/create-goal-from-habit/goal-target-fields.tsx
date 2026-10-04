'use client'

import type { Ref } from 'react'

import { useTranslations } from 'next-intl'
import { MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'
import { FieldWell } from '../../goals/field-well'

interface GoalTargetFieldsProps {
  isStreak: boolean
  targetValue: string
  unit: string
  fieldErrors: Record<string, string>
  targetRef?: Ref<HTMLInputElement>
  unitRef?: Ref<HTMLInputElement>
  onChangeTarget: (next: string) => void
  onChangeUnit: (next: string) => void
}

export function GoalTargetFields({
  isStreak,
  targetValue,
  unit,
  fieldErrors,
  targetRef,
  unitRef,
  onChangeTarget,
  onChangeUnit,
}: Readonly<GoalTargetFieldsProps>) {
  const t = useTranslations()
  return (
    <div className={isStreak ? '' : 'grid grid-cols-2'} style={{ padding: '8px 0 0', gap: 12 }}>
      <FieldWell
        label={isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
        id="create-goal-target"
        inputRef={targetRef}
        type="number"
        mono
        value={targetValue}
        placeholder={isStreak ? t('goals.form.streakTargetPlaceholder') : '12'}
        error={fieldErrors.targetValue}
        onChange={onChangeTarget}
      />
      {!isStreak && (
        <FieldWell
          label={t('goals.form.unit')}
          id="create-goal-unit"
          inputRef={unitRef}
          type="text"
          value={unit}
          placeholder={t('goals.form.unitPlaceholder')}
          maxLength={MAX_GOAL_UNIT_LENGTH}
          error={fieldErrors.unit}
          onChange={onChangeUnit}
        />
      )}
    </div>
  )
}
