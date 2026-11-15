'use client'

import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { useFlag } from '@/hooks/use-flag'

/** The full-surface load error of habit detail. With the guided flows on, Orbit in Parado, never sad, sits above the message and the retry, centred in the free area. */
export function HabitDetailLoadError({ message, retryLabel, onRetry }: Readonly<{ message: string; retryLabel: string; onRetry: () => void }>) {
  const guided = useFlag('orbit_guided_flows')
  const size = useStateMascotSize()
  const error = <ErrorState message={message} action={<IconButton label={retryLabel} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} />
  if (!guided) return error
  return (
    <ShellCentredRegion>
      <div data-habit-detail-load-error="" className="flex flex-col items-center">
        <span aria-hidden="true"><OrbitMascot size={size} state="parado" /></span>
        {error}
      </div>
    </ShellCentredRegion>
  )
}
