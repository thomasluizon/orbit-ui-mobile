import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { buildHabitFrequencyUnits, type HabitScheduleFieldsProps } from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'

export function HabitScheduleFields({ unit, quantity, flexible, disabled, onChange }: Readonly<HabitScheduleFieldsProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const availability = disabled ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const }
  const invalid = Boolean(unit) && (quantity === null || !Number.isInteger(quantity) || quantity < 1)
  const change = (nextUnit: FrequencyUnit, nextQuantity: number | null, nextFlexible: boolean) => {
    if (!disabled) onChange(nextUnit, nextQuantity, nextFlexible)
  }
  return (
    <View style={styles.container}>
      <RadioGroup accessibilityLabel={t('habits.form.frequency')}>
        <RadioRow label={t('habits.form.every')} selected={Boolean(unit) && !flexible} {...availability} onSelect={() => change(unit ?? 'Day', quantity ?? 1, false)} />
        <RadioRow label={t('habits.form.timesPerUnit')} selected={flexible} {...availability} onSelect={() => change(unit ?? 'Week', quantity ?? 3, true)} />
      </RadioGroup>
      <Input
        label={t('habits.form.frequency')}
        name="frequencyQuantity"
        autoComplete="off"
        kind="number"
        inputMode="numeric"
        mono
        value={quantity === null ? '' : String(quantity)}
        disabled={disabled}
        error={invalid ? t('habits.form.frequencyRequired') : undefined}
        onChange={(value) => change(unit ?? 'Day', value.trim() === '' ? null : Number(value), flexible)}
      />
      <View style={styles.group}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('habits.form.unit')}</Text>
        <RadioGroup accessibilityLabel={t('habits.form.unit')}>
          {buildHabitFrequencyUnits({ unitDay: t('habits.form.unitDay'), unitWeek: t('habits.form.unitWeek'), unitMonth: t('habits.form.unitMonth'), unitYear: t('habits.form.unitYear') }).map((option) => (
            <RadioRow key={option.value} label={option.label} selected={unit === option.value} {...availability} onSelect={() => change(option.value, quantity ?? 1, flexible)} />
          ))}
        </RadioGroup>
      </View>
      {flexible && unit && quantity !== null && !invalid ? <Text style={[styles.hint, { color: tokens.fg3 }]}>{t('habits.form.flexibleDescription', { n: quantity, unit })}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  group: { gap: 8 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  hint: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
})
