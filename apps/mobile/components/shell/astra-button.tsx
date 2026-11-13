import { useTranslation } from 'react-i18next'
import { Fab } from '@/components/ui/fab'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useUIStore } from '@/stores/ui-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function useAstraButtonBlocked(enabled: boolean) {
  return useUIStore(state => enabled && (state.showCreateModal || state.isSelectMode || state.openOverlayIds.length > 0 || state.astraConversationOpen))
}

export function AstraButton() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const openConversation = useUIStore(state => state.setAstraConversationOpen)
  return <Fab neutral testID="astra-button" label={t('shell.astraButton.open')} onClick={() => openConversation(true)}>
    <OrbitMascot size={24} color={tokens.fg1} />
  </Fab>
}
