import { createProactiveItemController } from '@orbit/shared/hooks'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { getSessionEpoch } from '@/lib/session-epoch'
import { buildChatClientContext } from '@orbit/shared/chat'
import i18n from 'i18next'
import { API } from '@orbit/shared/api'
import { proactiveItemSchema, type ProactiveItem } from '@orbit/shared/types'
import { apiClient } from '@/lib/api-client'

export const proactiveItemController = createProactiveItemController({
  requestCurrent: (signal) => {
    const clientContext = buildChatClientContext({ platform: 'mobile', locale: i18n.language })
    const query = new URLSearchParams({ clientContext: JSON.stringify(clientContext) })
    return apiClient<ProactiveItem | undefined>(`${API.proactive.current}?${query.toString()}`, { signal }, proactiveItemSchema)
  },
  reportOpened: (id) => apiClient(API.proactive.opened(id), { method: 'POST', silent: true, skipAuthRecovery: true }),
  getChat: useChatStore.getState,
  openConversation: () => useUIStore.getState().setAstraConversationOpen(true),
  getSessionEpoch,
})

export const { openCurrentProactiveItem } = proactiveItemController
