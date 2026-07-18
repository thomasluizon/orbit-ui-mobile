import { View, Text, Pressable } from 'react-native'
import { X } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { BreakdownEditableHabit } from '@orbit/shared/utils'
import { AppTextInput } from '@/components/ui/app-text-input'
import { BreakdownFrequencyPicker } from './breakdown-frequency-picker'
import type { AppTokens, BreakdownStyles } from './breakdown-suggestion.styles'

export interface EditableHabit extends BreakdownEditableHabit {
  id: string
}

interface BreakdownHabitRowProps {
  habit: EditableHabit
  tokens: AppTokens
  styles: BreakdownStyles
  onUpdate: (patch: Partial<EditableHabit>) => void
  onRemove: () => void
}

export function BreakdownHabitRow({
  habit,
  tokens,
  styles,
  onUpdate,
  onRemove,
}: Readonly<BreakdownHabitRowProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.habitRow}>
      <View style={styles.habitContent}>
        <AppTextInput
          style={styles.habitInput}
          value={habit.title}
          onChangeText={(text) => onUpdate({ title: text })}
          placeholder={t('habits.breakdown.habitNamePlaceholder')}
          placeholderTextColor={tokens.fg3}
        />
        <BreakdownFrequencyPicker
          frequencyUnit={habit.frequencyUnit}
          styles={styles}
          onSelect={(val) =>
            onUpdate({
              frequencyUnit: val,
              frequencyQuantity: val ? habit.frequencyQuantity : null,
            })
          }
        />
        {habit.frequencyUnit ? (
          <View style={styles.quantityRow}>
            <Text style={styles.quantityLabel}>{t('habits.breakdown.every')}</Text>
            <AppTextInput
              style={styles.quantityInput}
              value={String(habit.frequencyQuantity ?? 1)}
              onChangeText={(text) =>
                onUpdate({
                  frequencyQuantity: Number(text.replace(/\D/g, '')) || 1,
                })
              }
              keyboardType="number-pad"
              accessibilityLabel={t('habits.breakdown.frequencyQuantityLabel')}
            />
            <Text style={styles.quantityLabel}>
              {t(`habits.form.unit${habit.frequencyUnit}` as 'habits.form.unitDay')}
            </Text>
          </View>
        ) : null}
      </View>
      <Pressable
        style={({ pressed }) => [styles.removeBtn, pressed && styles.controlPressed]}
        hitSlop={9}
        accessibilityRole="button"
        accessibilityLabel={t('habits.breakdown.removeHabit', {
          name: habit.title || t('habits.breakdown.habitNamePlaceholder'),
        })}
        onPress={onRemove}
      >
        <X size={14} color={tokens.fg3} />
      </Pressable>
    </View>
  )
}
