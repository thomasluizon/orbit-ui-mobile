import { z } from 'zod'

export const accountabilityCadenceSchema = z.enum(['Daily', 'Weekly'])
export type AccountabilityCadence = z.infer<typeof accountabilityCadenceSchema>

export const accountabilityPairStatusSchema = z.enum(['Pending', 'Accepted', 'Ended'])
export type AccountabilityPairStatus = z.infer<typeof accountabilityPairStatusSchema>

export const accountabilityBuddySummarySchema = z.object({
  userId: z.string(),
  handle: z.string(),
  displayName: z.string(),
})
export type AccountabilityBuddySummary = z.infer<typeof accountabilityBuddySummarySchema>

export const accountabilityPairSchema = z.object({
  id: z.string(),
  buddy: accountabilityBuddySummarySchema,
  cadence: accountabilityCadenceSchema,
  status: accountabilityPairStatusSchema,
  isInitiatedByMe: z.boolean(),
  myHabitIds: z.array(z.string()),
  buddyHabitIds: z.array(z.string()),
  myLastCheckInDate: z.string().nullable(),
  buddyLastCheckInDate: z.string().nullable(),
  createdAtUtc: z.string(),
})
export type AccountabilityPair = z.infer<typeof accountabilityPairSchema>

export const accountabilityPairsResponseSchema = z.object({
  activePairs: z.array(accountabilityPairSchema),
  incomingInvites: z.array(accountabilityPairSchema),
  outgoingInvites: z.array(accountabilityPairSchema),
})
export type AccountabilityPairsResponse = z.infer<typeof accountabilityPairsResponseSchema>

export const accountabilityCheckInSchema = z.object({
  id: z.string(),
  userId: z.string(),
  handle: z.string(),
  displayName: z.string(),
  date: z.string(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
})
export type AccountabilityCheckIn = z.infer<typeof accountabilityCheckInSchema>

export const accountabilityCheckInsPageSchema = z.object({
  items: z.array(accountabilityCheckInSchema),
})
export type AccountabilityCheckInsPage = z.infer<typeof accountabilityCheckInsPageSchema>

export const inviteAccountabilityBuddyRequestSchema = z.object({
  buddyUserId: z.string(),
  cadence: accountabilityCadenceSchema,
  habitIds: z.array(z.string()).min(1).max(10),
})
export type InviteAccountabilityBuddyRequest = z.infer<typeof inviteAccountabilityBuddyRequestSchema>

export const acceptAccountabilityPairRequestSchema = z.object({
  habitIds: z.array(z.string()).min(1).max(10),
})
export type AcceptAccountabilityPairRequest = z.infer<typeof acceptAccountabilityPairRequestSchema>

export const setAccountabilityHabitsRequestSchema = z.object({
  habitIds: z.array(z.string()).min(1).max(10),
})
export type SetAccountabilityHabitsRequest = z.infer<typeof setAccountabilityHabitsRequestSchema>

export const checkInAccountabilityRequestSchema = z.object({
  note: z.string().max(200).optional(),
})
export type CheckInAccountabilityRequest = z.infer<typeof checkInAccountabilityRequestSchema>
