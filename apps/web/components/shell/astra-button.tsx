'use client'

import { useTranslations } from 'next-intl'
import { Fab } from '@/components/ui/fab'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useUIStore } from '@/stores/ui-store'

export function AstraButton() {
  const t = useTranslations()
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  return <Fab neutral hidden={blocked} label={t('shell.astraButton.open')} data-astra-button="" onClick={() => useUIStore.getState().setAstraConversationOpen(true)}>
    <OrbitMascot size={24} />
  </Fab>
}
