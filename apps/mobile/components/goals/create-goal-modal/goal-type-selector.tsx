import { Pressable, Text, View } from 'react-native'
import { Target, Flame } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { GoalType } from '@orbit/shared/types/goal'
import type { CreateGoalStyles, CreateGoalTokens } from './styles'

const goalTypeOptions = [
  {
    key: 'Standard',
    titleKey: 'goals.form.typeStandard',
    descKey: 'goals.form.typeStandardDescription',
    icon: Target,
  },
  {
    key: 'Streak',
    titleKey: 'goals.form.typeStreak',
    descKey: 'goals.form.typeStreakHintGood',
    hintKey: 'goals.form.typeStreakHintBad',
    icon: Flame,
  },
] as const

interface GoalTypeSelectorProps {
  tokens: CreateGoalTokens
  styles: CreateGoalStyles
  goalType: GoalType
  onTypeChange: (type: GoalType) => void
}

export function GoalTypeSelector({
  tokens,
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
      <View
        style={styles.typeRow}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('goals.form.type')}
      >
        {goalTypeOptions.map((option) => {
          const isActive = goalType === option.key
          const OptionIcon = option.icon
          return (
            <Pressable
              key={option.key}
              style={({ pressed }) => [
                styles.typeOption,
                isActive ? styles.typeOptionActive : styles.typeOptionInactive,
                pressed
                  ? [
                      styles.typeOptionPressed,
                      isActive
                        ? styles.typeOptionActivePressed
                        : styles.typeOptionInactivePressed,
                    ]
                  : null,
              ]}
              onPress={() => onTypeChange(option.key)}
              accessibilityRole="radio"
              accessibilityLabel={t(option.titleKey)}
              accessibilityState={{ checked: isActive }}
            >
              <OptionIcon
                size={18}
                strokeWidth={1.8}
                color={isActive ? tokens.fgOnPrimary : tokens.fg2}
              />
              <Text
                style={[
                  styles.typeOptionText,
                  { color: isActive ? tokens.fgOnPrimary : tokens.fg2 },
                ]}
              >
                {t(option.titleKey)}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.typeCaption}>
        <Text style={styles.typeDesc}>{t(activeTypeOption.descKey)}</Text>
        {'hintKey' in activeTypeOption ? (
          <Text style={styles.typeHint}>{t(activeTypeOption.hintKey)}</Text>
        ) : null}
      </View>
    </View>
  )
}
