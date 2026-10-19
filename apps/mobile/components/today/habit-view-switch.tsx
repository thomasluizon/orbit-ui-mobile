import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ActiveView } from '@orbit/shared/stores'
import { SegmentedControl } from '@/components/ui/segmented-control'

export function HabitViewSwitch({ value, onChange }: Readonly<{ value: ActiveView; onChange: (view: ActiveView) => void }>) {
  const { t } = useTranslation()
  return <View testID="habit-view-switch">
    <SegmentedControl label={t('habits.viewsLabel')} value={value} onChange={onChange} fullWidth options={[
      { value: 'today', label: t('habits.viewToday') },
      { value: 'all', label: t('habits.viewAll') },
      { value: 'general', label: t('habits.viewGeneral') },
    ]} />
  </View>
}
