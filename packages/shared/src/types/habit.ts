import { z } from 'zod'
import { habitLogSchema } from './calendar'

// --- Enums ---

export const frequencyUnitSchema = z.enum(['Day', 'Week', 'Month', 'Year'])

export type FrequencyUnit = z.infer<typeof frequencyUnitSchema>

export const instanceStatusSchema = z.enum(['Pending', 'Completed', 'Overdue'])

export type InstanceStatus = z.infer<typeof instanceStatusSchema>

export const scheduledReminderWhenSchema = z.enum(['day_before', 'same_day'])

export type ScheduledReminderWhen = z.infer<typeof scheduledReminderWhenSchema>

export const bulkItemStatusSchema = z.enum(['Success', 'Failed'])

export type BulkItemStatus = z.infer<typeof bulkItemStatusSchema>

// --- Shared sub-schemas ---

export const habitInstanceSchema = z.object({
  date: z.string(),
  status: instanceStatusSchema,
  logId: z.string().nullable(),
  note: z.string().nullable(),
})

export type HabitInstance = z.infer<typeof habitInstanceSchema>

export const habitTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
})

export type HabitTag = z.infer<typeof habitTagSchema>

export const searchMatchFieldSchema = z.object({
  field: z.enum(['title', 'description', 'tag', 'child']),
  value: z.string().nullable(),
})

export type SearchMatchField = z.infer<typeof searchMatchFieldSchema>

export const checklistItemSchema = z.object({
  text: z.string(),
  isChecked: z.boolean(),
})

export type ChecklistItem = z.infer<typeof checklistItemSchema>

export const scheduledReminderTimeSchema = z.object({
  when: scheduledReminderWhenSchema,
  time: z.string(),
})

export type ScheduledReminderTime = z.infer<typeof scheduledReminderTimeSchema>

export const linkedGoalInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
})

export type LinkedGoalInfo = z.infer<typeof linkedGoalInfoSchema>

// --- Base habit fields (shared across all representations) ---

const baseHabitFieldsSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  frequencyUnit: frequencyUnitSchema.nullable(),
  frequencyQuantity: z.number().nullable(),
  isBadHabit: z.boolean(),
  isCompleted: z.boolean(),
  isGeneral: z.boolean(),
  isFlexible: z.boolean(),
  days: z.array(z.string()),
  dueDate: z.string(),
  dueTime: z.string().nullable(),
  dueEndTime: z.string().nullable(),
  endDate: z.string().nullable(),
  position: z.number().nullable(),
  checklistItems: z.array(checklistItemSchema),
})

// --- Schedule types (GET /api/habits -- paginated, schedule-aware) ---

export const habitScheduleChildSchema: z.ZodType<{
  id: string
  title: string
  description: string | null
  frequencyUnit: FrequencyUnit | null
  frequencyQuantity: number | null
  isBadHabit: boolean
  isCompleted: boolean
  isGeneral: boolean
  isFlexible: boolean
  days: string[]
  dueDate: string
  dueTime: string | null
  dueEndTime: string | null
  endDate: string | null
  position: number | null
  checklistItems: ChecklistItem[]
  tags: HabitTag[]
  children: HabitScheduleChild[]
  hasSubHabits: boolean
  isLoggedInRange: boolean
  instances: HabitInstance[]
  searchMatches?: SearchMatchField[] | null
}> = baseHabitFieldsSchema.extend({
  tags: z.array(habitTagSchema),
  children: z.lazy(() => z.array(habitScheduleChildSchema)),
  hasSubHabits: z.boolean(),
  isLoggedInRange: z.boolean(),
  instances: z.array(habitInstanceSchema),
  searchMatches: z.array(searchMatchFieldSchema).nullable().optional(),
})

export type HabitScheduleChild = z.infer<typeof habitScheduleChildSchema>

export const habitScheduleItemSchema = baseHabitFieldsSchema.extend({
  createdAtUtc: z.string(),
  scheduledDates: z.array(z.string()),
  isOverdue: z.boolean(),
  reminderEnabled: z.boolean(),
  reminderTimes: z.array(z.number()),
  scheduledReminders: z.array(scheduledReminderTimeSchema),
  slipAlertEnabled: z.boolean(),
  tags: z.array(habitTagSchema),
  children: z.array(habitScheduleChildSchema),
  hasSubHabits: z.boolean(),
  flexibleTarget: z.number().nullable(),
  flexibleCompleted: z.number().nullable(),
  linkedGoals: z.array(linkedGoalInfoSchema).optional(),
  instances: z.array(habitInstanceSchema),
  searchMatches: z.array(searchMatchFieldSchema).nullable().optional(),
})

export type HabitScheduleItem = z.infer<typeof habitScheduleItemSchema>

// --- Paginated response (generic factory) ---

export function createPaginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number(),
    pageSize: z.number(),
    totalCount: z.number(),
    totalPages: z.number(),
  })
}

export type PaginatedResponse<T> = {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

// --- Detail types (GET /api/habits/:id) ---

export const habitDetailChildSchema: z.ZodType<{
  id: string
  title: string
  description: string | null
  frequencyUnit: FrequencyUnit | null
  frequencyQuantity: number | null
  isBadHabit: boolean
  isCompleted: boolean
  isGeneral: boolean
  isFlexible: boolean
  days: string[]
  dueDate: string
  dueTime: string | null
  dueEndTime: string | null
  endDate: string | null
  position: number | null
  checklistItems: ChecklistItem[]
  children: HabitDetailChild[]
}> = baseHabitFieldsSchema.extend({
  children: z.lazy(() => z.array(habitDetailChildSchema)),
})

export type HabitDetailChild = z.infer<typeof habitDetailChildSchema>

export const habitDetailSchema = baseHabitFieldsSchema.extend({
  createdAtUtc: z.string(),
  reminderEnabled: z.boolean(),
  reminderTimes: z.array(z.number()),
  scheduledReminders: z.array(scheduledReminderTimeSchema),
  children: z.array(habitDetailChildSchema),
})

export type HabitDetail = z.infer<typeof habitDetailSchema>

// --- Normalized habit (flat map for store) ---

export const normalizedHabitSchema = baseHabitFieldsSchema.extend({
  createdAtUtc: z.string(),
  parentId: z.string().nullable(),
  scheduledDates: z.array(z.string()),
  isOverdue: z.boolean(),
  reminderEnabled: z.boolean(),
  reminderTimes: z.array(z.number()),
  scheduledReminders: z.array(scheduledReminderTimeSchema),
  slipAlertEnabled: z.boolean(),
  tags: z.array(habitTagSchema),
  hasSubHabits: z.boolean(),
  flexibleTarget: z.number().nullable(),
  flexibleCompleted: z.number().nullable(),
  isLoggedInRange: z.boolean(),
  linkedGoals: z.array(linkedGoalInfoSchema).optional(),
  currentStreak: z.number().optional(),
  instances: z.array(habitInstanceSchema),
  searchMatches: z.array(searchMatchFieldSchema).nullable().optional(),
})

export type NormalizedHabit = z.infer<typeof normalizedHabitSchema>

// --- Request types ---

export const createHabitRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  frequencyUnit: frequencyUnitSchema.optional(),
  frequencyQuantity: z.number().optional(),
  days: z.array(z.string()).optional(),
  isBadHabit: z.boolean().optional(),
  isGeneral: z.boolean().optional(),
  isFlexible: z.boolean().optional(),
  subHabits: z.array(z.string()).optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  dueEndTime: z.string().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTimes: z.array(z.number()).optional(),
  scheduledReminders: z.array(scheduledReminderTimeSchema).optional(),
  slipAlertEnabled: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
  goalIds: z.array(z.string()).optional(),
  checklistItems: z.array(checklistItemSchema).optional(),
  endDate: z.string().optional(),
})

export type CreateHabitRequest = z.infer<typeof createHabitRequestSchema>

export const updateHabitRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  frequencyUnit: frequencyUnitSchema.optional(),
  frequencyQuantity: z.number().optional(),
  days: z.array(z.string()).optional(),
  isBadHabit: z.boolean(),
  isGeneral: z.boolean().optional(),
  isFlexible: z.boolean().optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  dueEndTime: z.string().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTimes: z.array(z.number()).optional(),
  scheduledReminders: z.array(scheduledReminderTimeSchema).optional(),
  slipAlertEnabled: z.boolean().optional(),
  checklistItems: z.array(checklistItemSchema).optional(),
  goalIds: z.array(z.string()).optional(),
  endDate: z.string().nullable().optional(),
  clearEndDate: z.boolean().optional(),
})

export type UpdateHabitRequest = z.infer<typeof updateHabitRequestSchema>

export const logHabitRequestSchema = z.object({
  note: z.string().optional(),
  date: z.string().optional(),
})

export type LogHabitRequest = z.infer<typeof logHabitRequestSchema>

export const linkedGoalUpdateSchema = z.object({
  goalId: z.string(),
  title: z.string(),
  newProgress: z.number(),
  targetValue: z.number(),
})

export type LinkedGoalUpdate = z.infer<typeof linkedGoalUpdateSchema>

export const logHabitResponseSchema = z.object({
  logId: z.string(),
  isFirstCompletionToday: z.boolean(),
  currentStreak: z.number(),
  linkedGoalUpdates: z.array(linkedGoalUpdateSchema).optional(),
  xpEarned: z.number().optional(),
  newAchievementIds: z.array(z.string()).optional(),
})

export type LogHabitResponse = z.infer<typeof logHabitResponseSchema>

export const habitFullDetailSchema = z.object({
  habit: habitDetailSchema,
  metrics: z.lazy(() => habitMetricsSchema),
  logs: z.array(habitLogSchema),
})

export type HabitFullDetail = z.infer<typeof habitFullDetailSchema>

export const calendarMonthResponseSchema = z.object({
  habits: z.array(habitScheduleItemSchema),
  logs: z.record(z.string(), z.array(habitLogSchema)),
})

export type CalendarMonthResponse = z.infer<typeof calendarMonthResponseSchema>

export const habitMetricsSchema = z.object({
  currentStreak: z.number(),
  longestStreak: z.number(),
  weeklyCompletionRate: z.number(),
  monthlyCompletionRate: z.number(),
  totalCompletions: z.number(),
  lastCompletedDate: z.string().nullable(),
})

export type HabitMetrics = z.infer<typeof habitMetricsSchema>

// --- Bulk operations ---

export const bulkHabitItemSchema: z.ZodType<{
  title: string
  description?: string | null
  frequencyUnit?: FrequencyUnit | null
  frequencyQuantity?: number | null
  days?: string[] | null
  isBadHabit?: boolean
  isGeneral?: boolean
  isFlexible?: boolean
  dueDate?: string | null
  dueTime?: string | null
  dueEndTime?: string | null
  reminderEnabled?: boolean
  reminderTimes?: number[] | null
  scheduledReminders?: ScheduledReminderTime[] | null
  checklistItems?: ChecklistItem[] | null
  subHabits?: BulkHabitItem[] | null
  endDate?: string | null
}> = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  frequencyUnit: frequencyUnitSchema.nullable().optional(),
  frequencyQuantity: z.number().nullable().optional(),
  days: z.array(z.string()).nullable().optional(),
  isBadHabit: z.boolean().optional(),
  isGeneral: z.boolean().optional(),
  isFlexible: z.boolean().optional(),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().nullable().optional(),
  dueEndTime: z.string().nullable().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTimes: z.array(z.number()).nullable().optional(),
  scheduledReminders: z.array(scheduledReminderTimeSchema).nullable().optional(),
  checklistItems: z.array(checklistItemSchema).nullable().optional(),
  subHabits: z.lazy(() => z.array(bulkHabitItemSchema).nullable().optional()),
  endDate: z.string().nullable().optional(),
})

export type BulkHabitItem = z.infer<typeof bulkHabitItemSchema>

export const bulkCreateRequestSchema = z.object({
  habits: z.array(bulkHabitItemSchema),
})

export type BulkCreateRequest = z.infer<typeof bulkCreateRequestSchema>

export const bulkCreateItemResultSchema = z.object({
  index: z.number(),
  status: bulkItemStatusSchema,
  habitId: z.string().nullable(),
  title: z.string().nullable(),
  error: z.string().nullable(),
  field: z.string().nullable(),
})

export type BulkCreateItemResult = z.infer<typeof bulkCreateItemResultSchema>

export const bulkCreateResponseSchema = z.object({
  results: z.array(bulkCreateItemResultSchema),
})

export type BulkCreateResponse = z.infer<typeof bulkCreateResponseSchema>

export const bulkDeleteRequestSchema = z.object({
  habitIds: z.array(z.string()),
})

export type BulkDeleteRequest = z.infer<typeof bulkDeleteRequestSchema>

export const bulkDeleteItemResultSchema = z.object({
  index: z.number(),
  status: bulkItemStatusSchema,
  habitId: z.string(),
  error: z.string().nullable(),
})

export type BulkDeleteItemResult = z.infer<typeof bulkDeleteItemResultSchema>

export const bulkDeleteResponseSchema = z.object({
  results: z.array(bulkDeleteItemResultSchema),
})

export type BulkDeleteResponse = z.infer<typeof bulkDeleteResponseSchema>

// --- Query filters (GET /api/habits) ---

export const habitsFilterSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  includeOverdue: z.boolean().optional(),
  includeGeneral: z.boolean().optional(),
  isGeneral: z.boolean().optional(),
  search: z.string().optional(),
  isCompleted: z.boolean().optional(),
  frequencyUnit: z.union([frequencyUnitSchema, z.literal('none')]).optional(),
  tagIds: z.array(z.string()).optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
})

export type HabitsFilter = z.infer<typeof habitsFilterSchema>

// --- Reorder / Parent / Sub-habit operations ---

export const reorderHabitsRequestSchema = z.object({
  positions: z.array(
    z.object({
      habitId: z.string(),
      position: z.number(),
    }),
  ),
})

export type ReorderHabitsRequest = z.infer<typeof reorderHabitsRequestSchema>

export const moveHabitParentRequestSchema = z.object({
  parentId: z.string().nullable(),
})

export type MoveHabitParentRequest = z.infer<typeof moveHabitParentRequestSchema>

export const createSubHabitRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  frequencyUnit: frequencyUnitSchema.optional(),
  frequencyQuantity: z.number().optional(),
  days: z.array(z.string()).optional(),
  isBadHabit: z.boolean().optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  dueEndTime: z.string().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTimes: z.array(z.number()).optional(),
  scheduledReminders: z.array(scheduledReminderTimeSchema).optional(),
  slipAlertEnabled: z.boolean().optional(),
  checklistItems: z.array(checklistItemSchema).optional(),
  tagIds: z.array(z.string()).optional(),
  endDate: z.string().optional(),
  isFlexible: z.boolean().optional(),
})

export type CreateSubHabitRequest = z.infer<typeof createSubHabitRequestSchema>

// --- Bulk log/skip ---

export const bulkLogItemRequestSchema = z.object({
  habitId: z.string(),
  date: z.string().optional(),
})

export type BulkLogItemRequest = z.infer<typeof bulkLogItemRequestSchema>

export const bulkSkipItemRequestSchema = z.object({
  habitId: z.string(),
  date: z.string().optional(),
})

export type BulkSkipItemRequest = z.infer<typeof bulkSkipItemRequestSchema>

export const bulkLogItemResultSchema = z.object({
  index: z.number(),
  status: bulkItemStatusSchema,
  habitId: z.string(),
  logId: z.string().nullable(),
  error: z.string().nullable(),
})

export type BulkLogItemResult = z.infer<typeof bulkLogItemResultSchema>

export const bulkLogResultSchema = z.object({
  results: z.array(bulkLogItemResultSchema),
})

export type BulkLogResult = z.infer<typeof bulkLogResultSchema>

export const bulkSkipItemResultSchema = z.object({
  index: z.number(),
  status: bulkItemStatusSchema,
  habitId: z.string(),
  error: z.string().nullable(),
})

export type BulkSkipItemResult = z.infer<typeof bulkSkipItemResultSchema>

export const bulkSkipResultSchema = z.object({
  results: z.array(bulkSkipItemResultSchema),
})

export type BulkSkipResult = z.infer<typeof bulkSkipResultSchema>
