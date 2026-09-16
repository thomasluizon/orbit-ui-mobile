import { Pressable, Text, View } from 'react-native'
import { Target, Flame } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { GoalType } from '@orbit/shared/types/goal'
import type { CreateGoalStyles, CreateGoalTokens } from './styles'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-group'

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

function GoalTypeOption({
  active,
  label,
  onSelect,
  option,
  styles,
  tokens,
}: Readonly<{
  active: boolean
  label: string
  onSelect: () => void
  option: (typeof goalTypeOptions)[number]
  styles: CreateGoalStyles
  tokens: CreateGoalTokens
}>) {
  const { elementRef, onKeyDown, tabIndex } = useRadioGroupItem({ disabled: false, onSelect, selected: active })
  const keyProps = { onKeyDown }
  const OptionIcon = option.icon

  return (
    <Pressable
      {...keyProps}
      ref={elementRef}
      tabIndex={tabIndex}
      style={({ pressed }) => [
        styles.typeOption,
        active ? styles.typeOptionActive : styles.typeOptionInactive,
        pressed
          ? [
              styles.typeOptionPressed,
              active ? styles.typeOptionActivePressed : styles.typeOptionInactivePressed,
            ]
          : null,
      ]}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
    >
      <OptionIcon
        size={20}
        strokeWidth={1.8}
        color={active ? tokens.fgOnPrimary : tokens.fg2}
      />
      <Text
        style={[
          styles.typeOptionText,
          { color: active ? tokens.fgOnPrimary : tokens.fg2 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
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
      <RadioGroup
        style={styles.typeRow}
        accessibilityLabel={t('goals.form.type')}
      >
        {goalTypeOptions.map((option) => {
          const isActive = goalType === option.key
          return (
            <GoalTypeOption
              key={option.key}
              active={isActive}
              label={t(option.titleKey)}
              onSelect={() => onTypeChange(option.key)}
              option={option}
              styles={styles}
              tokens={tokens}
            />
          )
        })}
      </RadioGroup>
      <View style={styles.typeCaption}>
        <Text style={styles.typeDesc}>{t(activeTypeOption.descKey)}</Text>
        {'hintKey' in activeTypeOption ? (
          <Text style={styles.typeHint}>{t(activeTypeOption.hintKey)}</Text>
        ) : null}
      </View>
    </View>
  )
}
