import { useState } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { formatLocaleDate } from '@orbit/shared/utils'
import { DateField } from '@/components/ui/date-field'
import { X } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { FormSectionLabel } from './form-section-label'
import { useHabitFormInteraction } from './habit-form-interaction'

interface EndDateEditorProps {
  visible: boolean
  value: string
  onChange: (value: string) => void
  t: (key: string) => string
}

/** The end date of a repeat: add it, pick it in the calendar, and remove it. */
export function EndDateEditor({ visible, value, onChange, t }: Readonly<EndDateEditorProps>) {
  const { disabled, guard } = useHabitFormInteraction()
  const { i18n } = useTranslation()
  const [focusRequest, setFocusRequest] = useState(0)
  const [endDateExpanded, setShowEndDate] = useState<boolean | null>(null)
  const showEndDate = endDateExpanded ?? Boolean(value)
  if (!visible) return null
  return (
    <View testID="end-date-levels" style={{ gap: 16 }}>
      <FormSectionLabel>{t('habits.form.ending')}</FormSectionLabel>
      <View><ListRow disabled={disabled} placement="field" title={t('habits.form.addEndDate')} value={value && !showEndDate ? formatLocaleDate(value, i18n.language) : undefined} expanded={showEndDate} onClick={guard(() => setShowEndDate(!showEndDate))} /></View>
      {showEndDate ? <View style={{ gap: 8 }}>
      <FormSectionLabel>{t('habits.form.endDateQuestion')}</FormSectionLabel>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}><DateField disabled={disabled} label={t('habits.form.endDateQuestion')} value={value} placeholder={t('habits.form.endDatePlaceholder')} onChange={guard((next: string) => { setShowEndDate(true); onChange(next) })} focusRequest={focusRequest} /></View>
      {value ? <View style={{ alignItems: 'flex-end' }}>
        <PillButton disabled={disabled} variant="ghost" iconOnly label={t('habits.form.removeEndDate')} onClick={() => {
          setShowEndDate(true)
          onChange('')
          setFocusRequest((request) => request + 1)
        }}><X size={20} /></PillButton>
      </View> : null}</View>
      </View> : null}
    </View>
  )
}
