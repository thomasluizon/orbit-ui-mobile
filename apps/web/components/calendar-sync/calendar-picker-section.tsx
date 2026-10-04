'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SettingsDescription } from '@/components/ui/settings-description'
import { CheckRow } from '@/components/ui/check-row'
import { Skeleton } from '@/components/ui/skeleton'
import { PillButton } from '@/components/ui/pill-button'
import { useCalendars, useSetSelectedCalendars } from '@/hooks/use-calendars'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'

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
  const [saveError, setSaveError] = useAccountScopedState<string | null>(null)
  const { data: calendars, isLoading, isError, refetch } = useCalendars({ enabled })
  const setSelectedCalendars = useSetSelectedCalendars()
  const [visibleCount, setVisibleCount] = useState(20)
  const [openedCalendarId, setOpenedCalendarId] = useAccountScopedState<string | null>(null)
  const disclosureId = useId()

  if (!enabled) return null

  async function handleToggle(id: string, isSynced: boolean) {
    const generation = getAccountGeneration()
    setSaveError(null)
    try {
      await setSelectedCalendars.mutateAsync({ id, isSynced })
    } catch (err: unknown) {
      if (generation === getAccountGeneration()) setSaveError(getFriendlyErrorMessage(err, t, 'calendar.calendars.saveFailed', 'textless'))
    }
  }

  return (
    <div className="pt-6">
      <p role="alert" className="m-0 text-sm text-[var(--status-bad-text)]">{saveError ?? ''}</p>

      {isLoading && <Skeleton variant="settings" rows={2} label={t('calendar.calendars.loading')} />}

      {isError && (
        <div
          className="flex items-center"
          style={{ gap: 8, paddingTop: 4 }}
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
            paddingTop: 4,
          }}
        >
          {t('calendar.calendars.empty')}
        </p>
      )}

      {!isLoading &&
        !isError &&
        calendars?.slice(0, visibleCount).map((calendar) => (
          <div key={calendar.id}>
            <CheckRow
              label={calendar.name}
              textMode="personal"
              onOpenLabel={() => setOpenedCalendarId(openedCalendarId === calendar.id ? null : calendar.id)}
              labelExpanded={openedCalendarId === calendar.id}
              labelControls={`${disclosureId}-${calendar.id}`}
              description={calendar.primary ? t('calendar.calendars.primaryLabel') : undefined}
              checked={calendar.isSynced}
              onChange={(checked) => void handleToggle(calendar.id, checked)}
            />
            <div id={`${disclosureId}-${calendar.id}`} hidden={openedCalendarId !== calendar.id}>
              {openedCalendarId === calendar.id ? <PersonalText expanded className="m-0 px-4 pb-3 text-sm text-[var(--fg-1)] ">{calendar.name}</PersonalText> : null}
            </div>
          </div>
        ))}

      {!isLoading && !isError && calendars && calendars.length > 20 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="font-mono text-xs tabular-nums text-[var(--fg-3)]">
            {t('calendar.showingCount', { shown: Math.min(visibleCount, calendars.length), total: calendars.length })}
          </span>
          {visibleCount < calendars.length ? (
            <PillButton variant="ghost" size="sm" onClick={() => setVisibleCount((count) => count + 20)}>
              {t('calendar.showMore')}
            </PillButton>
          ) : null}
        </div>
      ) : null}

      <SettingsDescription inset={false}>{t('calendar.calendars.description')}</SettingsDescription>
    </div>
  )
}
