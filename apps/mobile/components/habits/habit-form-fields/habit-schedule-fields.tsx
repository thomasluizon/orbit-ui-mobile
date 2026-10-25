import { useHabitFormInteraction } from './habit-form-interaction'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { buildHabitFrequencyUnits, type HabitScheduleFieldsProps } from '@orbit/shared/utils'
import { Proposed } from '@/components/ui/proposed'
import { Input } from '@/components/ui/input'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'

function scheduleAvailability(locked: boolean | undefined, pending: boolean, reason: string) {
  if (pending) return { disabled: true as const, reasonScope: 'group' as const }
  return locked ? { disabled: true as const, reason } : { disabled: false as const }
}

export function HabitScheduleFields({ unit, quantity, flexible, disabled, onChange, onModeChange, proposed = false, hidden = false, general = false, generalLocked = false, onGeneral }: Readonly<HabitScheduleFieldsProps>) {
  const { disabled: formDisabled, guard } = useHabitFormInteraction()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const locked = disabled || formDisabled
  const availability = scheduleAvailability(disabled, formDisabled, t('common.locked'))
  const invalid = Boolean(unit) && (quantity === null || !Number.isInteger(quantity) || quantity < 1)
  const change = (nextUnit: FrequencyUnit, nextQuantity: number | null, nextFlexible: boolean) => {
    if (!locked) onChange(nextUnit, nextQuantity, nextFlexible)
  }
  if (hidden) return null
  return (
    <View style={styles.container}>
      <RadioGroup accessibilityLabel={t('habits.form.frequency')}>
        <Proposed keepMounted inset proposed={proposed && (Boolean(unit) && !flexible)} scope="row" label={t('habits.detail.proposed')}>
          <RadioRow proposed={proposed && (Boolean(unit) && !flexible)} label={t('habits.form.every')} selected={Boolean(unit) && !flexible} {...availability} onSelect={() => { if (!locked) onModeChange(false) }} />
        </Proposed>
        <Proposed keepMounted inset proposed={proposed && flexible} scope="row" label={t('habits.detail.proposed')}>
          <RadioRow proposed={proposed && flexible} label={t('habits.form.timesPerUnit')} selected={flexible} {...availability} onSelect={() => { if (!locked) onModeChange(true) }} />
        </Proposed>
        <RadioRow label={t('habits.form.noSchedule')} description={t('habits.form.noScheduleHint')} selected={general} {...scheduleAvailability(generalLocked || disabled, formDisabled, t('common.locked'))} onSelect={onGeneral ? guard(onGeneral) : undefined} />
      </RadioGroup>
      {!general ? <>
      <Proposed keepMounted inset proposed={proposed} scope="field" label={t('habits.detail.proposed')}>
        <Input
          proposed={proposed}
          label={t('habits.form.frequency')}
          name="frequencyQuantity"
          autoComplete="off"
          kind="number"
          inputMode="numeric"
          mono
          value={quantity === null ? '' : String(quantity)}
          disabled={locked}
          error={invalid ? t('habits.form.frequencyRequired') : undefined}
          onChange={guard((value) => change(unit ?? 'Day', value.trim() === '' ? null : Number(value), flexible))}
        />
      </Proposed>
      <View style={styles.group}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('habits.form.unit')}</Text>
        <RadioGroup accessibilityLabel={t('habits.form.unit')}>
          {buildHabitFrequencyUnits({ unitDay: t('habits.form.unitDay'), unitWeek: t('habits.form.unitWeek'), unitMonth: t('habits.form.unitMonth'), unitYear: t('habits.form.unitYear') }).map((option) => (
            <Proposed key={option.value} keepMounted inset proposed={proposed && unit === option.value} scope="row" label={t('habits.detail.proposed')}>
              <RadioRow proposed={proposed && unit === option.value} label={option.label} selected={unit === option.value} {...availability} onSelect={() => change(option.value, quantity ?? 1, flexible)} />
            </Proposed>
          ))}
        </RadioGroup>
      </View>
      </> : null}
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
