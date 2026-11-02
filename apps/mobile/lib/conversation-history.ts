import { API } from '@orbit/shared/api'
import { createConversationHistory, conversationPagePath } from '@orbit/shared/chat'
import { conversationKeys } from '@orbit/shared/query'
import { conversationPageSchema } from '@orbit/shared/types'
import { ApiClientError } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'

export const conversationHistory = createConversationHistory({
  getState: useChatStore.getState,
  setState: useChatStore.setState,
  getAccountGeneration,
  read: cursor => queryClient.fetchQuery({
    queryKey: conversationKeys.page(getAccountGeneration(), cursor.conversationId, cursor.beforeOrder),
    staleTime: 0, gcTime: 0,
    queryFn: async () => {
      try {
        return await apiClient(conversationPagePath(cursor), {}, conversationPageSchema)
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) return null
        throw error
      }
    },
  }),
  remove: async id => {
    const generation = getAccountGeneration()
    try {
      await apiClient(API.chat.deleteConversation(id), { method: 'DELETE', silent: true, isCurrent: () => generation === getAccountGeneration() })
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) return
      throw error
    }
  },
})
