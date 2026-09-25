'use client'

import { useTranslations } from 'next-intl'
import type { GoalType } from '@orbit/shared/types/goal'
import { GoalGroupLabel } from '../../goals/goal-group-label'
import { SegmentedControl } from '@/components/ui/segmented-control'

const goalTypeOptions = [
  {
    key: 'Standard',
    titleKey: 'goals.form.typeStandard',
    descKey: 'goals.form.typeStandardDescription',
  },
  {
    key: 'Streak',
    titleKey: 'goals.form.typeStreak',
    descKey: 'goals.form.typeStreakHintGood',
    hintKey: 'goals.form.typeStreakHintBad',
  },
] as const

interface GoalTypeSelectorProps {
  goalType: GoalType
  onTypeChange: (type: GoalType) => void
}

export function GoalTypeSelector({
  goalType,
  onTypeChange,
}: Readonly<GoalTypeSelectorProps>) {
  const t = useTranslations()
  const activeTypeOption =
    goalTypeOptions.find((option) => option.key === goalType) ?? goalTypeOptions[0]

  return (
    <>
      <GoalGroupLabel>{t('goals.form.type')}</GoalGroupLabel>
      <SegmentedControl<GoalType>
        label={t('goals.form.type')}
        value={goalType}
        options={[
          { value: goalTypeOptions[0].key, label: t(goalTypeOptions[0].titleKey) },
          { value: goalTypeOptions[1].key, label: t(goalTypeOptions[1].titleKey) },
        ]}
        onChange={onTypeChange}
      />
      <div style={{ padding: '12px 0' }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--fg-3)',
            lineHeight: 1.5,
          }}
        >
          {t(activeTypeOption.descKey)}
        </div>
        {'hintKey' in activeTypeOption && (
          <div
            style={{
              marginTop: 4,
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--fg-3)',
              lineHeight: 1.4,
            }}
          >
            {t(activeTypeOption.hintKey)}
          </div>
        )}
      </div>
    </>
  )
}
