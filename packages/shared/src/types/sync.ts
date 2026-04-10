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
