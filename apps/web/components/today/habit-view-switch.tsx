'use client'

import { useTranslations } from 'next-intl'
import type { ActiveView } from '@orbit/shared/stores'
import { SegmentedControl } from '@/components/ui/segmented-control'

export function HabitViewSwitch({ value, onChange }: Readonly<{ value: ActiveView; onChange: (view: ActiveView) => void }>) {
  const t = useTranslations()
  return <div data-habit-view-switch="" className="min-w-0 px-4">
    <SegmentedControl label={t('habits.viewsLabel')} value={value} onChange={onChange} fullWidth options={[
      { value: 'today', label: t('habits.viewToday') },
      { value: 'all', label: t('habits.viewAll') },
      { value: 'general', label: t('habits.viewGeneral') },
    ]} />
  </div>
}
