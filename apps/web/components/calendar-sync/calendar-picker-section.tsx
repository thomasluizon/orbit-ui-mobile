'use client'

import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { CheckRow } from '@/components/ui/check-row'
import { Skeleton } from '@/components/ui/skeleton'
import { useCalendars, useSetSelectedCalendars } from '@/hooks/use-calendars'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { toast } from 'sonner'

interface CalendarPickerSectionProps {
  enabled: boolean
}

/**
 * "Calendars" settings section: one check row per Google calendar, selecting
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
      toast.error(getFriendlyErrorMessage(err, t, 'calendar.calendars.saveFailed', 'textless'))
    }
  }

  return (
    <>
      <SectionLabel>{t('calendar.calendars.title')}</SectionLabel>

      {isLoading && <Skeleton variant="settings" rows={2} label={t('calendar.calendars.loading')} />}

      {isError && (
        <div
          className="flex items-center"
          style={{ gap: 8, padding: '4px 16px 0' }}
          role="alert"
        >
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--status-bad-text)',
              flex: 1,
            }}
          >
            {t('calendar.calendars.error')}
          </span>
          <button type="button" className="chip shrink-0" onClick={() => void refetch()}>
            {t('calendar.retry')}
          </button>
        </div>
      )}

      {!isLoading && !isError && calendars && calendars.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
            padding: '4px 16px 0',
          }}
        >
          {t('calendar.calendars.empty')}
        </p>
      )}

      {!isLoading &&
        !isError &&
        calendars?.map((calendar) => (
          <CheckRow
            key={calendar.id}
            label={calendar.name}
            description={calendar.primary ? t('calendar.calendars.primaryLabel') : undefined}
            checked={calendar.isSynced}
            onChange={(checked) => void handleToggle(calendar.id, checked)}
          />
        ))}

      <SettingsDescription>{t('calendar.calendars.description')}</SettingsDescription>
    </>
  )
}
