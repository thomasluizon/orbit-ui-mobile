'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ErrorState } from '@/components/ui/error-state'
import { isNetworkUnavailableError } from '@orbit/shared/utils'
import { useOffline } from '@/hooks/use-offline'

import { useTranslations } from 'next-intl'

interface CalendarLoadErrorProps {
  onRetry: () => void
  error?: unknown
}

/** The load failure of the calendar views. It is the shared state surface: Orbit in Parado, one first person line and the retry, centred in the free area. A read that failed for want of a connection says so. With the flag off it is the kit card. */
export function CalendarLoadError({ onRetry, error }: Readonly<CalendarLoadErrorProps>) {
  const t = useTranslations()
  const { isOnline } = useOffline()
  const retry = <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
  const offline = !isOnline || isNetworkUnavailableError(error)
  return <ErrorState fullSurface message={t(offline ? 'offline.description' : 'calendar.orbit.loadError')} action={retry} />
}
