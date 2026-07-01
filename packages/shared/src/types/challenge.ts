import { z } from 'zod'

export const challengeTypeSchema = z.enum(['CoopGoal', 'StreakTogether'])

export type ChallengeType = z.infer<typeof challengeTypeSchema>

export const challengeStatusSchema = z.enum(['Active', 'Completed'])

export type ChallengeStatus = z.infer<typeof challengeStatusSchema>

export const challengeParticipantSchema = z.object({
  userId: z.string(),
  name: z.string(),
  joinedAtUtc: z.string(),
})

export type ChallengeParticipant = z.infer<typeof challengeParticipantSchema>

export const challengeSchema = z.object({
  id: z.string(),
  creatorId: z.string(),
  type: challengeTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: challengeStatusSchema,
  targetCount: z.number().nullable(),
  currentProgress: z.number(),
  isComplete: z.boolean(),
  periodStartUtc: z.string(),
  periodEndUtc: z.string().nullable(),
  joinCode: z.string(),
  completedAtUtc: z.string().nullable(),
  createdAtUtc: z.string(),
})

export type Challenge = z.infer<typeof challengeSchema>

export const challengeDetailSchema = challengeSchema.extend({
  participants: z.array(challengeParticipantSchema),
  yourLinkedHabitIds: z.array(z.string()),
})

export type ChallengeDetail = z.infer<typeof challengeDetailSchema>

export const createChallengeRequestSchema = z.object({
  type: challengeTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  targetCount: z.number().optional(),
  periodStartUtc: z.string(),
  periodEndUtc: z.string().optional(),
  linkedHabitIds: z.array(z.string()),
  invitedFriendUserIds: z.array(z.string()).optional(),
})

export type CreateChallengeRequest = z.infer<typeof createChallengeRequestSchema>

export const joinChallengeRequestSchema = z.object({
  code: z.string(),
  linkedHabitIds: z.array(z.string()),
})

export type JoinChallengeRequest = z.infer<typeof joinChallengeRequestSchema>

export const challengeListItemSchema = z.object({
  id: z.string(),
  type: challengeTypeSchema,
  title: z.string(),
  status: challengeStatusSchema,
  targetCount: z.number().nullable(),
  currentProgress: z.number(),
  isComplete: z.boolean(),
  participantCount: z.number(),
  periodStartUtc: z.string(),
  periodEndUtc: z.string().nullable(),
  joinCode: z.string(),
  hasLinkedHabits: z.boolean(),
})

export type ChallengeListItem = z.infer<typeof challengeListItemSchema>

export const challengeListSchema = z.array(challengeListItemSchema)

export const setChallengeHabitsRequestSchema = z.object({
  habitIds: z.array(z.string()).min(1).max(20),
})

export type SetChallengeHabitsRequest = z.infer<typeof setChallengeHabitsRequestSchema>
