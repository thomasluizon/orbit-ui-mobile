'use client'

import { useSyncExternalStore } from 'react'
import { FAB_SIZE } from '@orbit/shared/theme'
import { getOrbitPageTurns, subscribeOrbitLoop } from '@orbit/shared/utils'
import { useTranslations } from 'next-intl'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useUIStore } from '@/stores/ui-store'

/** The conversation entry: the live Orbit at 48 with no background, in a 60 press target. Its ring turns once when the person changes the page. */
export function AstraButton() {
  const t = useTranslations()
  const pageTurns = useSyncExternalStore(subscribeOrbitLoop, getOrbitPageTurns, getOrbitPageTurns)
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  return <button
    type="button"
    hidden={blocked}
    aria-label={t('shell.astraButton.open')}
    data-astra-button=""
    onClick={() => useUIStore.getState().setAstraConversationOpen(true)}
    className="flex cursor-pointer appearance-none items-center justify-center border-0 bg-transparent p-0 transition-[scale] [transition-duration:var(--dur-press)] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.96]"
    style={{ height: FAB_SIZE, width: FAB_SIZE }}
  >
    <OrbitMascot size={48} lead turnKey={pageTurns} />
  </button>
}
