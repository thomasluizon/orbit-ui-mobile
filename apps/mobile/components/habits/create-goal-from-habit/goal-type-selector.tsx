import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { GoalType } from '@orbit/shared/types/goal'
import type { CreateGoalStyles } from './styles'
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
  styles: CreateGoalStyles
  goalType: GoalType
  onTypeChange: (type: GoalType) => void
}

export function GoalTypeSelector({
  styles,
  goalType,
  onTypeChange,
}: Readonly<GoalTypeSelectorProps>) {
  const { t } = useTranslation()
  const activeTypeOption =
    goalTypeOptions.find((option) => option.key === goalType) ?? goalTypeOptions[0]
  return (
    <View>
      <Text style={styles.fieldLabel}>{t('goals.form.type')}</Text>
      <SegmentedControl<GoalType>
        label={t('goals.form.type')}
        value={goalType}
        options={[
          { value: goalTypeOptions[0].key, label: t(goalTypeOptions[0].titleKey) },
          { value: goalTypeOptions[1].key, label: t(goalTypeOptions[1].titleKey) },
        ]}
        onChange={onTypeChange}
      />
      <View style={styles.typeCaption}>
        <Text style={styles.typeDesc}>{t(activeTypeOption.descKey)}</Text>
        {'hintKey' in activeTypeOption ? (
          <Text style={styles.typeHint}>{t(activeTypeOption.hintKey)}</Text>
        ) : null}
      </View>
    </View>
  )
}
