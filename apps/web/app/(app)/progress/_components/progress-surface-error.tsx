'use client'

import { useTranslations } from 'next-intl'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'

/** A full-surface error of a Progresso sub-screen: Orbit in Parado, never sad, above the message and the retry icon, centred in the free area. */
export function ProgressSurfaceError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const t = useTranslations()
  const size = useStateMascotSize()
  return (
    <ShellCentredRegion>
      <div data-progress-surface-error="" className="flex flex-col items-center">
        <span aria-hidden="true"><OrbitMascot size={size} state="parado" /></span>
        <ErrorState message={t('progressScreen.error')} action={<IconButton label={t('progressScreen.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} />
      </div>
    </ShellCentredRegion>
  )
}
