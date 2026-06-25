'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
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
  const { data: calendars, isLoading, isError } = useCalendars({ enabled })
  const setSelectedCalendars = useSetSelectedCalendars()

  if (!enabled) return null

  async function handleToggle(id: string, isSynced: boolean) {
    try {
      await setSelectedCalendars.mutateAsync({ id, isSynced })
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, t, 'calendar.calendars.saveFailed', 'generic'))
    }
  }

  return (
    <>
      <SectionLabel bottom={10}>{t('calendar.calendars.title')}</SectionLabel>

      {isLoading && (
        <div
          className="flex items-center"
          style={{ gap: 8, padding: '6px 20px 0' }}
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-3 animate-spin shrink-0" aria-hidden />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
            {t('calendar.calendars.loading')}
          </span>
        </div>
      )}

      {isError && !isLoading && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--status-bad-text)',
            padding: '6px 20px 0',
          }}
          role="alert"
        >
          {t('calendar.calendars.error')}
        </p>
      )}

      {!isLoading && !isError && calendars && calendars.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
            padding: '6px 20px 0',
          }}
        >
          {t('calendar.calendars.empty')}
        </p>
      )}

      {!isLoading &&
        !isError &&
        calendars?.map((calendar, index) => (
          <SettingsRow
            key={calendar.id}
            label={calendar.name}
            desc={calendar.primary ? t('calendar.calendars.primaryLabel') : undefined}
            leadingDot={calendar.backgroundColor ?? undefined}
            accessory="none"
            divider={index < calendars.length - 1}
          >
            <Switch
              on={calendar.isSynced}
              onToggle={() => void handleToggle(calendar.id, !calendar.isSynced)}
              ariaLabel={t('calendar.calendars.toggleLabel', { name: calendar.name })}
            />
          </SettingsRow>
        ))}

      <SettingsDescription>{t('calendar.calendars.description')}</SettingsDescription>
    </>
  )
}
