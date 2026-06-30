import { z } from 'zod'

const exportedAccountSchema = z.object({
  name: z.string(),
  email: z.string(),
  createdAtUtc: z.string(),
  plan: z.string(),
})

const exportedSettingsSchema = z.object({
  timeZone: z.string().nullable(),
  language: z.string().nullable(),
  weekStartDay: z.number(),
  themePreference: z.string().nullable(),
  colorScheme: z.string().nullable(),
  aiMemoryEnabled: z.boolean(),
  aiSummaryEnabled: z.boolean(),
  proactiveAstraEnabled: z.boolean(),
})

const exportedHabitLogSchema = z.object({
  date: z.string(),
  value: z.number(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
})

const exportedChecklistItemSchema = z.object({
  text: z.string(),
  isChecked: z.boolean(),
})

const exportedHabitSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  isBadHabit: z.boolean(),
  isGeneral: z.boolean(),
  dueDate: z.string(),
  endDate: z.string().nullable(),
  frequencyUnit: z.string().nullable(),
  frequencyQuantity: z.number().nullable(),
  days: z.array(z.string()),
  checklistItems: z.array(exportedChecklistItemSchema),
  createdAtUtc: z.string(),
  logs: z.array(exportedHabitLogSchema),
})

const exportedGoalProgressLogSchema = z.object({
  value: z.number(),
  previousValue: z.number(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
})

const exportedGoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  targetValue: z.number(),
  currentValue: z.number(),
  unit: z.string(),
  status: z.string(),
  type: z.string(),
  deadline: z.string().nullable(),
  createdAtUtc: z.string(),
  completedAtUtc: z.string().nullable(),
  progressLogs: z.array(exportedGoalProgressLogSchema),
})

const exportedTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAtUtc: z.string(),
})

const exportedUserFactSchema = z.object({
  factText: z.string(),
  category: z.string().nullable(),
  extractedAtUtc: z.string(),
})

const exportedSubscriptionSchema = z.object({
  plan: z.string(),
  isLifetimePro: z.boolean(),
  source: z.string().nullable(),
  interval: z.string().nullable(),
  planExpiresAtUtc: z.string().nullable(),
  trialEndsAtUtc: z.string().nullable(),
})

const exportedNotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  isRead: z.boolean(),
  createdAtUtc: z.string(),
})

const exportedChecklistTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(z.string()),
  createdAtUtc: z.string(),
})

const exportedAchievementSchema = z.object({
  achievementId: z.string(),
  earnedAtUtc: z.string(),
})

const exportedStreakFreezeSchema = z.object({
  usedOnDate: z.string(),
  createdAtUtc: z.string(),
})

const exportedReferralSchema = z.object({
  status: z.string(),
  createdAtUtc: z.string(),
  completedAtUtc: z.string().nullable(),
  rewardGrantedAtUtc: z.string().nullable(),
})

const exportedApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  isReadOnly: z.boolean(),
  createdAtUtc: z.string(),
  expiresAtUtc: z.string().nullable(),
  lastUsedAtUtc: z.string().nullable(),
  isRevoked: z.boolean(),
})

const exportedFriendshipSchema = z.object({
  requesterId: z.string(),
  addresseeId: z.string(),
  status: z.string(),
  createdAtUtc: z.string(),
  respondedAtUtc: z.string().nullable(),
})

const exportedCheerSchema = z.object({
  senderId: z.string(),
  recipientId: z.string(),
  habitId: z.string(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
})

const exportedBlockedUserSchema = z.object({
  blockerId: z.string(),
  blockedId: z.string(),
  createdAtUtc: z.string(),
})

const exportedReportSchema = z.object({
  reportedUserId: z.string(),
  reason: z.string(),
  details: z.string().nullable(),
  cheerId: z.string().nullable(),
  status: z.string(),
  createdAtUtc: z.string(),
})

const exportedFriendFeedEventSchema = z.object({
  type: z.string(),
  value: z.number().nullable(),
  achievementId: z.string().nullable(),
  createdAtUtc: z.string(),
})

export const userDataExportSchema = z.object({
  exportedAtUtc: z.string(),
  account: exportedAccountSchema,
  settings: exportedSettingsSchema,
  subscription: exportedSubscriptionSchema,
  habits: z.array(exportedHabitSchema),
  goals: z.array(exportedGoalSchema),
  tags: z.array(exportedTagSchema),
  facts: z.array(exportedUserFactSchema),
  notifications: z.array(exportedNotificationSchema),
  checklistTemplates: z.array(exportedChecklistTemplateSchema),
  achievements: z.array(exportedAchievementSchema),
  streakFreezes: z.array(exportedStreakFreezeSchema),
  referrals: z.array(exportedReferralSchema),
  apiKeys: z.array(exportedApiKeySchema),
  friendships: z.array(exportedFriendshipSchema),
  cheers: z.array(exportedCheerSchema),
  blockedUsers: z.array(exportedBlockedUserSchema),
  reports: z.array(exportedReportSchema),
  friendFeedEvents: z.array(exportedFriendFeedEventSchema),
})

export type UserDataExport = z.infer<typeof userDataExportSchema>
