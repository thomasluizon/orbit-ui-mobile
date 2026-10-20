import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { chatMessageSchema, chatResponseSchema, chatStreamEventSchema } from '../types/chat'
import { buildChatFinalMessageFields } from '../chat/final-message'
import { apiStatusCardsFinalFixture } from '../test-support/chat-fixtures'

const { PostApiChatResponse } = await vi.importActual<{ PostApiChatResponse: z.ZodObject }>('../types/__generated__/api.generated')

describe('chat response contract', () => {
  it('keeps API status blocks through the stream boundary and final message', () => {
    expect(PostApiChatResponse.parse(apiStatusCardsFinalFixture.response)).toEqual(apiStatusCardsFinalFixture.response)
    const event = chatStreamEventSchema.parse(apiStatusCardsFinalFixture)
    expect(event.type).toBe('final')
    if (event.type !== 'final') throw new Error('Expected a final event')
    const fields = buildChatFinalMessageFields(event.response, [])
    const message = chatMessageSchema.parse({ id: 'status', role: 'ai', timestamp: new Date(), ...fields })
    for (const key of ['streak', 'calendar', 'recordLists'] as const) {
      expect(fields).toHaveProperty(key, apiStatusCardsFinalFixture.response[key])
      expect(message).toHaveProperty(key, apiStatusCardsFinalFixture.response[key])
    }
    expect(fields.content).toBe(apiStatusCardsFinalFixture.response.aiMessage)
  })

  it('declares only response keys present in the generated API contract', () => {
    const generatedKeys = Object.keys(PostApiChatResponse.shape)
    const unknownKeys = Object.keys(chatResponseSchema.shape).filter(key => !generatedKeys.includes(key))
    expect(unknownKeys).toEqual([])
  })
})
