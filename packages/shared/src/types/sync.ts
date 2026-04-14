import { z } from 'zod'

// Mutation types supported by POST /api/sync/batch
export const mutationTypeSchema = z.enum([
  'createHabit', 'updateHabit', 'deleteHabit', 'logHabit', 'skipHabit',
  'reorderHabits', 'updateChecklist', 'duplicateHabit', 'moveHabitParent', 'createSubHabit',
  'bulkCreateHabits', 'bulkDeleteHabits', 'bulkLogHabits', 'bulkSkipHabits',
  'createGoal', 'updateGoal', 'deleteGoal', 'updateGoalProgress', 'updateGoalStatus', 'reorderGoals', 'linkGoalHabits',
  'createTag', 'updateTag', 'deleteTag', 'assignTags',
  'markNotificationRead', 'markAllNotificationsRead', 'deleteNotification', 'deleteAllNotifications',
  'setLanguage', 'setWeekStartDay', 'setColorScheme', 'setThemePreference', 'setTimeZone', 'setAiMemory', 'setAiSummary',
  'completeOnboarding', 'dismissCalendarPrompt', 'resetProfile',
  'deleteUserFact', 'bulkDeleteUserFacts',
  'createApiKey', 'deleteApiKey',
])
export type MutationType = z.infer<typeof mutationTypeSchema>

export const mutationScopeSchema = z.enum([
  'habits',
  'goals',
  'tags',
  'notifications',
  'profile',
  'userFacts',
  'apiKeys',
  'calendar',
])
export type MutationScope = z.infer<typeof mutationScopeSchema>

export const mutationEntityTypeSchema = z.enum([
  'habit',
  'goal',
  'tag',
  'notification',
  'profile',
  'userFact',
  'apiKey',
])
export type MutationEntityType = z.infer<typeof mutationEntityTypeSchema>

export const queuedMutationStatusSchema = z.enum(['pending', 'syncing', 'failed'])
export type QueuedMutationStatus = z.infer<typeof queuedMutationStatusSchema>

// A queued mutation waiting to be synced
export const queuedMutationSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  type: mutationTypeSchema,
  endpoint: z.string(),
  method: z.enum(['POST', 'PUT', 'DELETE']),
  payload: z.unknown(),
  retries: z.number(),
  maxRetries: z.number(),
  scope: mutationScopeSchema.optional(),
  entityType: mutationEntityTypeSchema.optional(),
  status: queuedMutationStatusSchema.optional(),
  dedupeKey: z.string().nullable().optional(),
  targetEntityId: z.string().nullable().optional(),
  clientEntityId: z.string().nullable().optional(),
  dependsOn: z.array(z.string()).optional(),
  lastError: z.string().nullable().optional(),
})
export type QueuedMutation = z.infer<typeof queuedMutationSchema>

// Batch sync request
export const syncBatchRequestSchema = z.object({
  mutations: z.array(z.object({
    id: z.string(),
    timestamp: z.string(),
    type: mutationTypeSchema,
    payload: z.unknown(),
  })),
})
export type SyncBatchRequest = z.infer<typeof syncBatchRequestSchema>

// Single mutation result
export const syncMutationResultSchema = z.object({
  mutationId: z.string(),
  status: z.enum(['success', 'conflict', 'gone', 'error']),
  data: z.unknown().optional(),
  error: z.string().optional(),
})
export type SyncMutationResult = z.infer<typeof syncMutationResultSchema>

// Batch sync response
export const syncBatchResponseSchema = z.object({
  results: z.array(syncMutationResultSchema),
  errors: z.array(syncMutationResultSchema),
})
export type SyncBatchResponse = z.infer<typeof syncBatchResponseSchema>

// Delta sync response from GET /api/sync/changes
export const syncChangesResponseSchema = z.object({
  serverTime: z.string(),
  changes: z.object({
    habits: z.array(z.unknown()),
    goals: z.array(z.unknown()),
    tags: z.array(z.unknown()),
    notifications: z.array(z.unknown()),
    deletedIds: z.object({
      habits: z.array(z.string()),
      goals: z.array(z.string()),
      tags: z.array(z.string()),
    }),
  }),
})
export type SyncChangesResponse = z.infer<typeof syncChangesResponseSchema>

const syncDeletedRefSchema = z.object({
  id: z.string(),
  deletedAtUtc: z.string(),
})

const syncEntitySetV2Schema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    updated: z.array(itemSchema),
    deleted: z.array(syncDeletedRefSchema),
  })

const syncChecklistItemSchema = z.object({
  text: z.string(),
  isChecked: z.boolean(),
})

const syncScheduledReminderSchema = z.object({
  when: z.string(),
  time: z.string(),
})

const syncHabitDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  frequencyUnit: z.string().nullable(),
  frequencyQuantity: z.number().nullable(),
  isBadHabit: z.boolean(),
  isCompleted: z.boolean(),
  dueDate: z.string(),
  dueTime: z.string().nullable(),
  dueEndTime: z.string().nullable(),
  reminderEnabled: z.boolean(),
  reminderTimes: z.array(z.number()),
  isGeneral: z.boolean(),
  isFlexible: z.boolean(),
  slipAlertEnabled: z.boolean(),
  checklistItems: z.array(syncChecklistItemSchema),
  scheduledReminders: z.array(syncScheduledReminderSchema),
  endDate: z.string().nullable(),
  position: z.number().nullable(),
  parentHabitId: z.string().nullable(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
})

const syncHabitLogDtoSchema = z.object({
  id: z.string(),
  habitId: z.string(),
  date: z.string(),
  value: z.number(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
})

const syncGoalDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  targetValue: z.number(),
  currentValue: z.number(),
  unit: z.string(),
  status: z.string(),
  type: z.string(),
  deadline: z.string().nullable(),
  position: z.number(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
  completedAtUtc: z.string().nullable(),
  streakSyncedAtUtc: z.string().nullable(),
})

const syncGoalProgressLogDtoSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  value: z.number(),
  previousValue: z.number(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
})

const syncTagDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
})

const syncNotificationDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  habitId: z.string().nullable(),
  isRead: z.boolean(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
})

const syncChecklistTemplateDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(z.string()),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
})

export const syncChangesV2ResponseSchema = z.object({
  habits: syncEntitySetV2Schema(syncHabitDtoSchema),
  habitLogs: syncEntitySetV2Schema(syncHabitLogDtoSchema),
  goals: syncEntitySetV2Schema(syncGoalDtoSchema),
  goalProgressLogs: syncEntitySetV2Schema(syncGoalProgressLogDtoSchema),
  tags: syncEntitySetV2Schema(syncTagDtoSchema),
  notifications: syncEntitySetV2Schema(syncNotificationDtoSchema),
  checklistTemplates: syncEntitySetV2Schema(syncChecklistTemplateDtoSchema),
  serverTimestamp: z.string(),
  version: z.number(),
})
export type SyncChangesV2Response = z.infer<typeof syncChangesV2ResponseSchema>
