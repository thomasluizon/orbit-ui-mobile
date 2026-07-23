'use client'

import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup } from '@/components/ui/settings-group'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { SkeletonRow } from '@/components/ui/skeleton'
import { useCalendars, useSetSelectedCalendars } from '@/hooks/use-calendars'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { toast } from 'sonner'

interface CalendarPickerSectionProps {
  enabled: boolean
}

/**
 * "Calendars" settings section: one Switch row per Google calendar, toggling
 * which calendars Orbit reads events from. Persists each toggle immediately.
 * Renders nothing until enabled so it stays hidden when Google is not connected.
 */
export function CalendarPickerSection({ enabled }: Readonly<CalendarPickerSectionProps>) {
  const t = useTranslations()
  const { data: calendars, isLoading, isError, refetch } = useCalendars({ enabled })
  const setSelectedCalendars = useSetSelectedCalendars()

  if (!enabled) return null

  async function handleToggle(id: string, isSynced: boolean) {
    try {
      await setSelectedCalendars.mutateAsync({ id, isSynced })
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, t, 'calendar.calendars.saveFailed', 'generic'))
    }
  }

  const hasCalendars = (calendars ?? []).length > 0

  return (
    <>
      <SectionLabel top={32} description={t('calendar.calendars.description')}>
        {t('calendar.calendars.title')}
      </SectionLabel>

      {isLoading && (
        <div role="status" aria-live="polite">
          <span className="sr-only">{t('calendar.calendars.loading')}</span>
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonRow key={index} media="none" lineWidths={['w-2/5', 'w-1/5']} />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center px-5" style={{ gap: 12 }} role="alert">
          <span className="t-secondary min-w-0 flex-1" style={{ color: 'var(--status-bad-text)' }}>
            {t('calendar.calendars.error')}
          </span>
          <button type="button" className="chip shrink-0" onClick={() => void refetch()}>
            {t('calendar.retry')}
          </button>
        </div>
      )}

      {!isLoading && !isError && !hasCalendars && (
        <p className="t-secondary max-w-[65ch] px-5 text-pretty">
          {t('calendar.calendars.empty')}
        </p>
      )}

      {!isLoading && !isError && hasCalendars && (
        <SettingsGroup>
          {(calendars ?? []).map((calendar) => (
            <SettingsRow
              key={calendar.id}
              label={calendar.name}
              desc={calendar.primary ? t('calendar.calendars.primaryLabel') : undefined}
              leadingDot={calendar.backgroundColor ?? undefined}
              accessory="none"
            >
              <Switch
                on={calendar.isSynced}
                onToggle={() => void handleToggle(calendar.id, !calendar.isSynced)}
                ariaLabel={t('calendar.calendars.toggleLabel', { name: calendar.name })}
              />
            </SettingsRow>
          ))}
        </SettingsGroup>
      )}
    </>
  )
}
