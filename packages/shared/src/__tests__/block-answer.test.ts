import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { blockAnswerErrorKey, formatBlockAnswer } from '../chat/block-answer'
import { blockAnswerSchema, chatResponseSchema, choiceBlockSchema } from '../types/chat'
import parts from '../test-support/chat-parts.fixture.json'
import { choiceBlockFixture } from '../test-support/choice-fixtures'

const { PostApiChatBody, PostApiChatResponse } = await vi.importActual<{
  PostApiChatBody: z.ZodType
  PostApiChatResponse: z.ZodType
}>('../types/__generated__/api.generated')

describe('Astra block answers', () => {
  it('keeps both producer-shaped parts through the generated and runtime boundaries', () => {
    const response = { aiMessage: null, actions: [], parts: parts.blocks.slice(-2) }
    expect(PostApiChatResponse.parse(response)).toMatchObject(response)
    expect(chatResponseSchema.parse(response).parts).toEqual(response.parts)
    const answer = blockAnswerSchema.parse({ blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] })
    expect(PostApiChatBody.parse({ message: 'Evening', blockAnswer: JSON.stringify(answer) })).toEqual({ message: 'Evening', blockAnswer: JSON.stringify(answer) })
  })
  it('formats the person’s selection in their locale', () => {
    expect(formatBlockAnswer(['Manhã', 'Noite'], undefined, 'pt-BR')).toBe('Manhã e Noite')
    expect(formatBlockAnswer(['Morning', 'Evening'], undefined, 'en')).toBe('Morning and Evening')
    expect(formatBlockAnswer([], ' Outro horário ', 'pt-BR')).toBe('Outro horário')
  })
  it.each([[404, 'closed'], [410, 'closed'], [409, 'alreadyAnswered'], [400, 'invalid'], [500, 'error'], [null, 'error']] as const)('maps %s to %s', (status, key) => {
    expect(blockAnswerErrorKey(status)).toBe(key)
  })
  it('enforces the option count and free text bounds', () => {
    expect(choiceBlockSchema.safeParse({ ...choiceBlockFixture, options: choiceBlockFixture.options.slice(0, 1) }).success).toBe(false)
    expect(choiceBlockSchema.safeParse({ ...choiceBlockFixture, options: Array(5).fill(choiceBlockFixture.options[0]) }).success).toBe(false)
    expect(blockAnswerSchema.safeParse({ blockId: choiceBlockFixture.blockId, selectedIds: [], freeText: 'x'.repeat(501) }).success).toBe(false)
  })
})
