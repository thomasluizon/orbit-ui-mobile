import { useHabitFormInteraction } from './habit-form-interaction'
import { Text, View } from 'react-native'
import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'

export function HabitTypeField({ formHelpers, lockedGeneral, onChange }: Readonly<{ formHelpers: HabitFormHelpers; lockedGeneral: boolean | null; onChange: () => void }>) {
  const { disabled, guard } = useHabitFormInteraction()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const itemType = useWatch({ control: formHelpers.form.control, name: 'itemType' })
  const errors = formHelpers.form.formState.errors
  const recurrenceMismatch = errors.datePhrase?.message === 'habits.form.recurrenceRequiresHabit' || errors.datePhrase?.message === 'errors.api.generalMismatchWithParent'
  const choose = guard((type: 'task' | 'habit') => { onChange(); formHelpers.chooseItemType(type) })
  return (
      <View style={{ minWidth: 0, gap: 8 }}>
        <Text style={{ color: tokens.fg2, fontSize: 14, fontFamily: 'Geist_500Medium' }}>{t('habits.form.itemType')}</Text>
        <RadioGroup accessibilityLabel={t('habits.form.itemType')} focusRequest={errors.itemType || recurrenceMismatch ? formHelpers.validationFocusRequest : undefined} accessibilityHint={errors.itemType ? t('habits.form.typeRequired') : recurrenceMismatch ? t('habits.form.recurrenceRequiresHabit') : undefined}>
          <RadioRow wrapLabel label={t('habits.form.typeTask')} selected={itemType === 'task'} {...(disabled ? { disabled: true as const, reasonScope: 'group' as const } : lockedGeneral === true ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const })} onSelect={() => choose('task')} />
          <RadioRow wrapLabel label={t('habits.form.typeHabit')} selected={itemType === 'habit'} {...(disabled ? { disabled: true as const, reasonScope: 'group' as const } : { disabled: false as const })} onSelect={() => choose('habit')} />
        </RadioGroup>
        {errors.itemType ? <Text style={{ color: tokens.statusBadText, fontSize: 14 }}>{t('habits.form.typeRequired')}</Text> : null}
      </View>
  )
}
