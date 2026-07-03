import { View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { frequencyUnitSchema } from '@orbit/shared/types/habit'
import type { BreakdownStyles } from './breakdown-suggestion.styles'

const FREQUENCY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'habits.filter.oneTime' },
  { value: 'Day', labelKey: 'habits.filter.daily' },
  { value: 'Week', labelKey: 'habits.filter.weekly' },
  { value: 'Month', labelKey: 'habits.filter.monthly' },
  { value: 'Year', labelKey: 'habits.filter.yearly' },
]

interface BreakdownFrequencyPickerProps {
  frequencyUnit: FrequencyUnit | null
  styles: BreakdownStyles
  onSelect: (unit: FrequencyUnit | null) => void
}

export function BreakdownFrequencyPicker({
  frequencyUnit,
  styles,
  onSelect,
}: Readonly<BreakdownFrequencyPickerProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.freqRow}>
      {FREQUENCY_OPTIONS.map((opt) => {
        const isActive =
          opt.value === '' ? !frequencyUnit : frequencyUnit === opt.value
        return (
          <Pressable
            key={opt.value}
            style={({ pressed }) => [
              styles.freqChip,
              isActive && styles.freqChipActive,
              pressed && styles.controlPressed,
            ]}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              const parsed = frequencyUnitSchema.safeParse(opt.value)
              const val: FrequencyUnit | null = parsed.success ? parsed.data : null
              onSelect(val)
            }}
          >
            <Text
              style={[
                styles.freqChipText,
                isActive && styles.freqChipTextActive,
              ]}
            >
              {t(opt.labelKey)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
