import { describe, expect, it } from 'vitest'
import { chatClientContextSchema, chatResponseSchema } from '../types/chat'
import { conversationPageSchema, conversationPreviewOutcomeSchema } from '../types/conversation'

const conversationId = '00000000-0000-4000-8000-000000000001'
const turnId = '00000000-0000-4000-8000-000000000002'

describe('server conversation contract', () => {
  it('accepts the complete producer page and preserves a lossless order cursor', () => {
    const page = {
      conversationId, beforeOrder: '9223372036854775806', turns: [{
        turnId, order: '9223372036854775806', role: 'user', createdAtUtc: '2026-01-01T00:00:00Z',
        content: 'Review this image', responseJson: null, previewOutcomesJson: '[]',
        image: { fileName: `${turnId}.png`, contentType: 'image/png', sha256: 'hash',
          url: `/api/chat/conversations/${conversationId}/images/${turnId}` },
      }],
    }
    expect(conversationPageSchema.parse(page)).toEqual(page)
    expect(conversationPageSchema.safeParse({ ...page, beforeOrder: 1.5 }).success).toBe(false)
  })

  it('accepts every producer outcome with its default serializer casing', () => {
    for (const Outcome of ['approved', 'edited', 'rejected', 'expired', 'pending']) {
      expect(conversationPreviewOutcomeSchema.parse({ PendingOperationId: turnId, Outcome, Arguments: {}, Revision: 2 }).Outcome).toBe(Outcome)
    }
  })

  it('retains the optional server id without changing older responses', () => {
    expect(chatResponseSchema.parse({ aiMessage: 'Ready', actions: [], conversationId }).conversationId).toBe(conversationId)
    expect(chatResponseSchema.parse({ aiMessage: 'Ready', actions: [] }).conversationId).toBeUndefined()
    expect(chatClientContextSchema.shape.conversationId.parse(conversationId)).toBe(conversationId)
  })
})
