'use server'

import { API } from '@orbit/shared/api'
import { ApiClientError } from '@orbit/shared/utils'
import { conversationPageSchema } from '@orbit/shared/types'
import { conversationPagePath, type ConversationCursor } from '@orbit/shared/chat'
import { serverAuthFetch, serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction } from './action-result'

export async function getConversationPage(cursor: ConversationCursor) {
  return wrapServerAction(async () => {
    try {
      return await serverAuthFetch(conversationPagePath(cursor), { cache: 'no-store' }, conversationPageSchema)
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) return null
      throw error
    }
  })
}

export async function deleteConversation(id: string, intendedAccountId: string | null) {
  const conversationId = conversationPageSchema.shape.conversationId.parse(id)
  return wrapServerAction(async () => {
    try {
      await serverAuthMutate(API.chat.deleteConversation(conversationId), { method: 'DELETE' }, intendedAccountId)
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) return
      throw error
    }
  })
}
