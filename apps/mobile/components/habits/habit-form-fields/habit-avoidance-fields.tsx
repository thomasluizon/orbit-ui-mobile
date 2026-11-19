import { View } from 'react-native'
import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { createHabitFormController } from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { ListRow } from '@/components/ui/list-row'
import type { createTokensV2 } from '@/lib/theme'
import { FormSectionLabel } from './form-section-label'
import { useHabitFormInteraction } from './habit-form-interaction'
import { SlipAlertSection } from './slip-alert-section'

type AppTokens = ReturnType<typeof createTokensV2>

interface SlipAlertEditorProps {
  visible: boolean
  tokens: AppTokens
  hasProAccess: boolean
  slipAlertEnabled: boolean
  onToggle: () => void
  onUpgrade: () => void
  t: (key: string) => string
}

/** The slip alert of a habit to avoid: a switch for Pro, or a Pro row that opens the upgrade route. */
export function SlipAlertEditor({
  visible,
  tokens,
  hasProAccess,
  slipAlertEnabled,
  onToggle,
  onUpgrade,
  t,
}: Readonly<SlipAlertEditorProps>) {
  if (!visible) return null
  return (
    <View style={{ gap: 8 }}>
      <FormSectionLabel>{t('habits.form.slipAlertQuestion')}</FormSectionLabel>
      <SlipAlertSection inline tokens={tokens} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={onToggle} onUpgrade={onUpgrade} />
    </View>
  )
}

/** "Quer largar?" with its two hints, then the slip alert. An undated item has neither. */
export function HabitAvoidanceFields({ formHelpers, controller, hasProAccess, tokens, onUpgrade }: Readonly<{ formHelpers: HabitFormHelpers; controller: ReturnType<typeof createHabitFormController>; hasProAccess: boolean; tokens: ReturnType<typeof createTokensV2>; onUpgrade: () => void }>) {
  const { t } = useTranslation()
  const { form } = formHelpers
  const { disabled, guard } = useHabitFormInteraction()
  const isBadHabit = useWatch({ control: form.control, name: 'isBadHabit' }) ?? false
  const slipAlertEnabled = useWatch({ control: form.control, name: 'slipAlertEnabled' }) ?? false
  if (formHelpers.isGeneral) return null
  return (
    <View style={{ gap: 16 }}>
      <FormSectionLabel>{t('habits.form.avoidGroup')}</FormSectionLabel>
            <View><ListRow disabled={disabled} placement="field" title={t('habits.form.habitTypeAvoid')} description={isBadHabit ? t('habits.form.habitTypeAvoidHint') : t('habits.form.habitTypeBuildHint')} toggle={{ checked: isBadHabit, onChange: guard((checked) => form.setValue('isBadHabit', checked, { shouldDirty: true })) }} /></View>

            <SlipAlertEditor visible={isBadHabit} tokens={tokens} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={() => controller.setSlipAlertEnabled(!slipAlertEnabled)} onUpgrade={onUpgrade} t={t} />
    </View>
  )
}
