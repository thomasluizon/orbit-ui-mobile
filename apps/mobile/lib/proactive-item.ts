import { createProactiveItemController } from '@orbit/shared/hooks'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { getSessionEpoch } from '@/lib/session-epoch'
import { API } from '@orbit/shared/api'
import { proactiveItemSchema, type ProactiveItem } from '@orbit/shared/types'
import { apiClient } from '@/lib/api-client'

export const proactiveItemController = createProactiveItemController({
  requestCurrent: (signal) => apiClient<ProactiveItem | undefined>(API.proactive.current, { signal }, proactiveItemSchema),
  reportOpened: (id) => apiClient(API.proactive.opened(id), { method: 'POST', silent: true, skipAuthRecovery: true }),
  getChat: useChatStore.getState,
  openConversation: () => useUIStore.getState().setAstraConversationOpen(true),
  getSessionEpoch,
})

export const { openCurrentProactiveItem } = proactiveItemController
