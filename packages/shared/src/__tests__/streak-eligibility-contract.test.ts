import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { chatStreamEventSchema, chatMessageSchema } from '../types/chat'
import { streakInfoSchema } from '../types/gamification'
import { buildChatFinalMessageFields } from '../chat/final-message'
import { apiStatusCardsFinalFixture } from '../test-support/chat-fixtures'
import { progressStreakStates } from './progress-streak-fixtures'

const { PostApiChatResponse, PostApiGamificationStreakRepairResponse } = await vi.importActual<{
  PostApiChatResponse: z.ZodObject
  PostApiGamificationStreakRepairResponse: z.ZodObject
}>('../types/__generated__/api.generated')

describe('streak eligibility contract', () => {
  it.each(['2026-09-25', null, undefined])('retains %s through producer, stream and saved chat boundaries', (firstEligibleDate) => {
    const response = PostApiChatResponse.parse({ ...apiStatusCardsFinalFixture.response,
      streak: { ...apiStatusCardsFinalFixture.response.streak, firstEligibleDate },
    })
    const event = chatStreamEventSchema.parse({ type: 'final', response })
    if (event.type !== 'final') throw new Error('Expected final event')
    const message = chatMessageSchema.parse({ id: 'streak', role: 'ai', timestamp: new Date(), ...buildChatFinalMessageFields(event.response, []) })
    expect(message.streak?.firstEligibleDate).toBe(firstEligibleDate)
  })

  it.each(['2026-09-25', null, undefined])('retains %s through the streak response boundary', (firstEligibleDate) => {
    const response = PostApiGamificationStreakRepairResponse.parse({ ...progressStreakStates[0]!.streak,
      isRepairAvailable: false, repairDate: null, repairsRemainingThisMonth: 1, firstEligibleDate,
    })
    expect(streakInfoSchema.parse(response).firstEligibleDate).toBe(firstEligibleDate)
  })
})
