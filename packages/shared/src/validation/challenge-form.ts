import { z } from 'zod'
import { challengeTypeSchema, type ChallengeType } from '../types/challenge'

/** Client-side create-challenge form schema shared by the web and mobile forms. CoopGoal requires a
 *  positive-integer target and an end date; StreakTogether requires neither. */
export const createChallengeFormSchema = z
  .object({
    type: challengeTypeSchema,
    title: z.string().trim().min(1).max(80),
    targetCount: z.string().optional(),
    periodEndUtc: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'CoopGoal') return
    const target = Number(value.targetCount)
    if (!value.targetCount || !Number.isInteger(target) || target <= 0) {
      ctx.addIssue({ code: 'custom', path: ['targetCount'], message: 'required' })
    }
    if (!value.periodEndUtc) {
      ctx.addIssue({ code: 'custom', path: ['periodEndUtc'], message: 'required' })
    }
  })

export type CreateChallengeFormValues = z.infer<typeof createChallengeFormSchema>

export const CHALLENGE_TYPE_OPTIONS: readonly ChallengeType[] = ['CoopGoal', 'StreakTogether']
