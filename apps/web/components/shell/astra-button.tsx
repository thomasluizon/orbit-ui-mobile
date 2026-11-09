'use client'

import { useTranslations } from 'next-intl'
import { Fab } from '@/components/ui/fab'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useUIStore } from '@/stores/ui-store'

export function AstraButton() {
  const t = useTranslations()
  const blocked = useUIStore(state => state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen)
  if (blocked) return null
  return <Fab neutral label={t('shell.astraButton.open')} data-astra-button="" onClick={() => useUIStore.getState().setAstraConversationOpen(true)}>
    <AstraGlyph size={24} />
  </Fab>
}
