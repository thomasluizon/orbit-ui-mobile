import { z } from 'zod'
import { publicAchievementSchema } from './public-profile'

export const reportReasonSchema = z.enum([
  'Spam',
  'Harassment',
  'InappropriateContent',
  'Impersonation',
  'Other',
])

export type ReportReason = z.infer<typeof reportReasonSchema>

export const friendFeedEventTypeSchema = z.enum([
  'StreakMilestone',
  'AchievementUnlocked',
  'HabitCompletedMilestone',
])

export type FriendFeedEventType = z.infer<typeof friendFeedEventTypeSchema>

export const handleSchema = z.string().regex(/^[A-Za-z0-9_]{3,20}$/)

export const setHandleRequestSchema = z.object({
  handle: handleSchema,
})

export type SetHandleRequest = z.infer<typeof setHandleRequestSchema>

export const socialOptInRequestSchema = z.object({
  enabled: z.boolean(),
})

export type SocialOptInRequest = z.infer<typeof socialOptInRequestSchema>

export const friendSummarySchema = z.object({
  userId: z.string(),
  handle: z.string(),
  displayName: z.string(),
  currentStreak: z.number(),
})

export type FriendSummary = z.infer<typeof friendSummarySchema>

export const friendRequestSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  handle: z.string(),
  displayName: z.string(),
  createdAtUtc: z.string(),
})

export type FriendRequestSummary = z.infer<typeof friendRequestSummarySchema>

export const friendsResponseSchema = z.object({
  friends: z.array(friendSummarySchema),
  incomingRequests: z.array(friendRequestSummarySchema),
  outgoingRequests: z.array(friendRequestSummarySchema),
})

export type FriendsResponse = z.infer<typeof friendsResponseSchema>

export const friendFeedItemSchema = z.object({
  id: z.string(),
  actorUserId: z.string(),
  actorHandle: z.string(),
  actorDisplayName: z.string(),
  type: friendFeedEventTypeSchema,
  value: z.number().nullable(),
  achievementId: z.string().nullable(),
  createdAtUtc: z.string(),
})

export type FriendFeedItem = z.infer<typeof friendFeedItemSchema>

export const friendFeedPageSchema = z.object({
  items: z.array(friendFeedItemSchema),
  nextCursor: z.string().nullable(),
})

export type FriendFeedPage = z.infer<typeof friendFeedPageSchema>

export const cheerSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  habitId: z.string().nullable(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
  senderHandle: z.string(),
  senderDisplayName: z.string(),
})

export type Cheer = z.infer<typeof cheerSchema>

export const sendCheerRequestSchema = z.object({
  recipientId: z.string(),
  habitId: z.string().optional(),
  note: z.string().max(200).optional(),
})

export type SendCheerRequest = z.infer<typeof sendCheerRequestSchema>

export const cheersPageSchema = z.object({
  items: z.array(cheerSchema),
})

export type CheersPage = z.infer<typeof cheersPageSchema>

export const sendFriendRequestSchema = z.object({
  handle: z.string().optional(),
  referralCode: z.string().optional(),
})

export type SendFriendRequest = z.infer<typeof sendFriendRequestSchema>

export const blockUserRequestSchema = z.object({
  blockedUserId: z.string(),
})

export type BlockUserRequest = z.infer<typeof blockUserRequestSchema>

export const reportUserRequestSchema = z.object({
  reportedUserId: z.string(),
  reason: reportReasonSchema,
  details: z.string().max(500).optional(),
  cheerId: z.string().optional(),
})

export type ReportUserRequest = z.infer<typeof reportUserRequestSchema>

export const friendProfileViewSchema = z.object({
  userId: z.string(),
  handle: z.string(),
  displayName: z.string(),
  currentStreak: z.number(),
  level: z.number(),
  achievements: z.array(publicAchievementSchema),
})

export type FriendProfileView = z.infer<typeof friendProfileViewSchema>
