'use client'

import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { isNetworkUnavailableError } from '@orbit/shared/utils'

/** The full-surface load error of habit detail. Orbit in Parado, never sad, sits above the message and the retry, centred in the free area, and a read that failed for want of a connection says so. */
export function HabitDetailLoadError({ message, guidedMessage, offlineMessage, error: failure, retryLabel, onRetry }: Readonly<{ message: string; guidedMessage?: string; offlineMessage?: string; error?: unknown; retryLabel: string; onRetry: () => void }>) {
  const size = useStateMascotSize()
  const shown = (offlineMessage && isNetworkUnavailableError(failure) ? offlineMessage : guidedMessage ?? message)
  const error = <ErrorState fullSurface={false} message={shown} action={<IconButton label={retryLabel} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} />
  
  return (
    <ShellCentredRegion>
      <div data-habit-detail-load-error="" className="flex flex-col items-center">
        <span aria-hidden="true"><OrbitMascot size={size} state="parado" /></span>
        {error}
      </div>
    </ShellCentredRegion>
  )
}
