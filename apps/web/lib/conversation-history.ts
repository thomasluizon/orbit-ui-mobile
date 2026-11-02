'use client'

import { createConversationHistory } from '@orbit/shared/chat'
import { conversationKeys } from '@orbit/shared/query'
import { createApiClientError } from '@orbit/shared/utils'
import { getConversationPage, deleteConversation } from '@/app/actions/conversations'
import { runServerActionResult, accountIntentWithOrigin } from '@/lib/client-action'
import { getQueryClient } from '@/lib/query-client'
import { getAccountGeneration } from '@/lib/session-epoch'
import { getHeldAccountId } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'

export const conversationHistory = createConversationHistory({
  getState: useChatStore.getState,
  setState: useChatStore.setState,
  getAccountGeneration,
  read: cursor => getQueryClient().fetchQuery({
    queryKey: conversationKeys.page(getAccountGeneration(), cursor.conversationId, cursor.beforeOrder),
    staleTime: 0, gcTime: 0,
    queryFn: async () => {
      const result = await runServerActionResult(getConversationPage(cursor))
      if (!result.ok) throw createApiClientError(result.status, { error: result.error, errorCode: result.code }, result.error)
      return result.data
    },
  }),
  remove: async id => {
    const result = await runServerActionResult(deleteConversation(id, accountIntentWithOrigin(getHeldAccountId())))
    if (!result.ok) throw createApiClientError(result.status, { error: result.error, errorCode: result.code }, result.error)
  },
})
