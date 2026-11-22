'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ErrorState } from '@/components/ui/error-state'
import { SPACING } from '@orbit/shared/theme'
import { isNetworkUnavailableError } from '@orbit/shared/utils'
import { useFlag } from '@/hooks/use-flag'
import { useOffline } from '@/hooks/use-offline'

import { useTranslations } from 'next-intl'

interface CalendarLoadErrorProps {
  onRetry: () => void
  error?: unknown
}

/** The load failure of the calendar views. With the guided flows on it is the shared state surface: Orbit in Parado, one first person line and the retry, centred in the free area. A read that failed for want of a connection says so. With the flag off it is the kit card. */
export function CalendarLoadError({ onRetry, error }: Readonly<CalendarLoadErrorProps>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const { isOnline } = useOffline()
  const retry = <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
  if (guided) {
    const offline = !isOnline || isNetworkUnavailableError(error)
    return <ErrorState fullSurface message={t(offline ? 'offline.description' : 'calendar.orbit.loadError')} action={retry} />
  }
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{
        gap: 12,
        padding: "var(--orbit-space-24) var(--orbit-space-16)",
        borderRadius: 18,
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <p className="text-sm text-[var(--fg-2)]" style={{ margin: SPACING.s0 }}>
        {t('calendar.loadError')}
      </p>
      {retry}
    </div>
  )
}
