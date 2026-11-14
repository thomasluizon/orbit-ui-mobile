import { vi } from 'vitest'
import type { z } from 'zod'
import { habitPhraseReadSchema } from '../types/habit'

const { PostApiHabitsReadPhraseResponse } = await vi.importActual<{ PostApiHabitsReadPhraseResponse: z.ZodObject }>('../types/__generated__/api.generated')

/** A sample that the generated read-phrase response schema accepts, so the fixture follows the API contract. */
export const PostApiHabitsReadPhraseResponseShape = PostApiHabitsReadPhraseResponse.parse({
  read: true,
  emoji: '💊',
  frequencyUnit: 'Day',
  frequencyQuantity: 1,
  days: [],
  isFlexible: false,
  flexibleTarget: null,
  dueTime: '08:00',
  subHabits: [],
  checklistItems: [],
})

export { habitPhraseReadSchema }
