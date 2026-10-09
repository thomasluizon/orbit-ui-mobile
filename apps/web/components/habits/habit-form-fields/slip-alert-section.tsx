import { ListRow } from '@/components/ui/list-row'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

interface SlipAlertSectionProps {
  inline?: boolean
  hasProAccess: boolean
  slipAlertEnabled: boolean
  onToggle: () => void
  t: ReturnType<typeof useTranslations>
}

export function SlipAlertSection({
  inline = false, hasProAccess, slipAlertEnabled, onToggle, t,
}: Readonly<SlipAlertSectionProps>) {
  const router = useRouter()

  return (
    <div className={inline ? "flex flex-col gap-3" : "flex flex-col gap-3 rounded-[14px] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]"}>
      {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Habit Create fSlip controls this label under D42. */}
      <ListRow placement={inline ? "column" : undefined} icon="shield-alert" title={t('habits.form.slipAlert')} description={t('habits.form.slipAlertDescription')}
        toggle={hasProAccess ? { checked: slipAlertEnabled, onChange: onToggle } : undefined}
        trailing={!hasProAccess ? <Badge>{t('common.proBadge')}</Badge> : undefined} chevron={!hasProAccess}
        onClick={!hasProAccess ? () => requestHabitCreateNavigation(() => router.push('/upgrade')) : undefined} />
    </div>
  )
}
