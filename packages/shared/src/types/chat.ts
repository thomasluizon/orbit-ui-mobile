import { oneSmallStepCardSchema, startingStepSchema } from '../contracts/blocks/one-small-step'
import { questionAnswerSchema, questionBlockSchema } from './question-block'
import { z } from 'zod'
import { astraNextActionSchema } from './astra-offer'
import { habitSuggestionsCardSchema } from './habit-suggestions'
import { utf16Length } from '../validation/utf16-length'
import { habitRankingCardSchema } from './habit-ranking'
export { habitRankingCardSchema, habitRankingResponseSchema, type HabitRankingCard, type HabitRankingResponse } from './habit-ranking'
import { proactiveItemSchema } from './proactive'
import type { ChatBlockKind } from '../chat/block-kinds'
import { calendarMonthResponseSchema, frequencyUnitSchema } from './habit'
import { completionSeriesSchema, retrospectiveHabitStatSchema, gamificationProfileSchema, achievementSchema, streakInfoSchema } from './gamification'
import {
  agentOperationResultSchema,
  pendingAgentOperationSchema,
  agentPolicyDenialSchema,
} from './ai'

export const chatClientContextSchema = z.object({
  platform: z.enum(['web', 'mobile']),
  locale: z.string(),
  timeFormat: z.string(),
  currentAppArea: z.string(),
  supportsHabitListCard: z.boolean(),
  supportsHabitListDoneStatus: z.boolean().optional(),
  supportsDatedHabitListCard: z.boolean().optional(),
  supportsSkippedHabitRows: z.boolean().optional(),
  supportsHabitHistoryCard: z.boolean().optional(),
  supportsGoalListCard: z.boolean(),
  supportsMetricsCard: z.boolean().optional(),
  supportsPeriodInsightCard: z.boolean().optional(),
  supportsDaySummaryCard: z.boolean().optional(),
  supportsStreakCard: z.boolean().optional(),
  supportsCalendarCard: z.boolean().optional(),
  supportsRecordListCard: z.boolean().optional(),
  supportsAccountRowsCard: z.boolean().optional(),
  supportsPendingOperationChanges: z.boolean().optional(),
  supportsPendingOperationPlacement: z.boolean().optional(),
  supportsToolSteps: z.boolean().optional(),
  supportsFollowUps: z.boolean().optional(),
  supportsFollowUpContext: z.boolean().optional(),
  supportsStartingStepContext: z.boolean().optional(),
  previousStartingStep: startingStepSchema.optional(),
  supportsParts: z.boolean().optional(),
  partKinds: z.array(z.string()).optional(),
  messageOrigin: z.literal('followUp').optional(),
  entryPointIntent: z.literal('support').optional(),
  supportsMessageAllowance: z.boolean().optional(),
  supportsCompletedHabitsMetric: z.boolean().optional(),
  supportsProactiveOffers: z.boolean().optional(),
  conversationId: z.uuid().nullish(),
  dismissedOfferKeys: z.array(z.string()).nullish(),
  selectedOfferKey: z.string().nullish(),
})

export type ChatClientContext = z.infer<typeof chatClientContextSchema>

export const aiActionTypeSchema = z.enum([
  'CreateHabit',
  'LogHabit',
  'UpdateHabit',
  'DeleteHabit',
  'SkipHabit',
  'BulkLogHabits',
  'BulkSkipHabits',
  'CreateSubHabit',
  'SuggestBreakdown',
  'AssignTags',
  'DuplicateHabit',
  'MoveHabit',
  'CreateGoal',
  'UpdateGoal',
  'DeleteGoal',
  'UpdateGoalProgress',
  'UpdateGoalStatus',
  'LinkHabitsToGoal',
  'CreateTag',
  'UpdateTag',
  'DeleteTag',
  'ReorderGoals',
  'ReorderHabits',
  'UnlogHabit',
])

export type AiActionType = z.infer<typeof aiActionTypeSchema>

export const actionStatusSchema = z.enum(['Success', 'Failed', 'Suggestion', 'NeedsClarification'])

export type ActionStatus = z.infer<typeof actionStatusSchema>

const quickActionSchema = z.object({
  label: z.string(),
  value: z.string().check(utf16Length('min', 1)),
  description: z.string().nullable().optional(),
})

export const clarificationRequestSchema = z.object({
  question: z.string(),
  operationId: z.uuid(),
  missingArgumentKey: z.string(),
  quickActions: z.array(quickActionSchema),
})

export type ClarificationRequest = z.infer<typeof clarificationRequestSchema>

export const conflictingHabitSchema = z.object({
  habitId: z.string(),
  habitTitle: z.string(),
  conflictDescription: z.string(),
})

export type ConflictingHabit = z.infer<typeof conflictingHabitSchema>

export const conflictWarningSchema = z.object({
  hasConflict: z.boolean(),
  conflictingHabits: z.array(conflictingHabitSchema),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  recommendation: z.string().nullable().optional(),
})

export type ConflictWarning = z.infer<typeof conflictWarningSchema>

export const suggestedSubHabitSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  frequencyUnit: frequencyUnitSchema.nullable().optional(),
  frequencyQuantity: z.number().nullable().optional(),
  days: z.array(z.string()).nullable().optional(),
  isBadHabit: z.boolean().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  habitId: z.string().optional(),
  slipAlertEnabled: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTimes: z.array(z.string()).optional(),
  tagNames: z.array(z.string()).optional(),
  checklistItems: z
    .array(
      z.object({
        text: z.string(),
        isChecked: z.boolean(),
      }),
    )
    .optional(),
})

export type SuggestedSubHabit = z.infer<typeof suggestedSubHabitSchema>

export const toolResultMessageParamsSchema = z.object({
  entityName: z.string().optional().catch(undefined),
  count: z.number().int().nonnegative().optional().catch(undefined),
  totalCount: z.number().int().nonnegative().optional().catch(undefined),
  skippedCount: z.number().int().nonnegative().optional().catch(undefined),
  partial: z.boolean().optional().catch(undefined),
  weekStartDay: z.number().int().optional().catch(undefined),
  hours: z.number().int().optional().catch(undefined),
  toolName: z.string().optional().catch(undefined),
  bulkTool: z.string().optional().catch(undefined),
  policyReason: z.string().optional().catch(undefined),
  timeZone: z.string().optional().catch(undefined),
  language: z.string().optional().catch(undefined),
  referralCode: z.string().optional().catch(undefined),
  fieldName: z.string().optional().catch(undefined),
  actionName: z.string().optional().catch(undefined),
  entityId: z.string().optional().catch(undefined),
})

export const actionResultSchema = z
  .object({
    type: z.string(),
    status: actionStatusSchema,
    entityId: z.string().nullable().optional(),
    entityName: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
    field: z.string().nullable().optional(),
    suggestedSubHabits: z.array(suggestedSubHabitSchema).nullable().optional(),
    conflictWarning: conflictWarningSchema.nullable().optional(),
    clarificationRequest: clarificationRequestSchema.nullable().optional(),
    messageKey: z.string().optional(),
    params: toolResultMessageParamsSchema.optional().catch(undefined),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'NeedsClarification' && !value.clarificationRequest) {
      ctx.addIssue({
        code: 'custom',
        path: ['clarificationRequest'],
        message: 'clarificationRequest is required when status is NeedsClarification',
      })
    }
  })

export type ActionResult = z.infer<typeof actionResultSchema>

export const readBlockMetadataSchema = z.object({
  queryId: z.uuid(),
  queryFamily: z.string(),
  scope: z.record(z.string(), z.unknown()),
  revision: z.string(),
  completeness: z.enum(['complete', 'partial', 'stale']),
  refreshToken: z.string(),
  nextCursor: z.string().nullish(),
  totalCount: z.number().nullish(),
  recovery: z.string().nullish(),
  nextAction: astraNextActionSchema.nullish().catch(null),
})

export type ReadBlockMetadata = z.infer<typeof readBlockMetadataSchema>

export const readWindowSchema = z.object({ from: z.iso.date(), to: z.iso.date() })

export const periodHabitMetricsSchema = z.object({
  window: readWindowSchema,
  positiveLogRecords: z.number(),
  distinctLoggedDates: z.number(),
  metScheduledDates: z.number(),
  scheduledDates: z.number(),
  completionRate: z.number().nullable(),
  currentStreak: z.number(),
  bestStreak: z.number(),
  streakScope: z.literal('period'),
  completedHabits: z.number().nullish(),
})

const periodMetricSchema = z.enum(['positiveLogRecords', 'distinctLoggedDates', 'metScheduledDates', 'scheduledDates', 'completedHabits'])

export const periodTotalCardSchema = z.object({
  metric: periodMetricSchema,
  unit: z.enum(['records', 'days', 'habits']),
  value: z.number(),
  metrics: periodHabitMetricsSchema,
  series: completionSeriesSchema,
  habitId: z.uuid().nullish(),
  read: readBlockMetadataSchema.nullish(),
})

export const periodComparisonCardSchema = z.object({
  metric: periodMetricSchema,
  unit: z.enum(['records', 'days', 'habits']),
  current: periodHabitMetricsSchema,
  baseline: periodHabitMetricsSchema,
  currentValue: z.number(),
  baselineValue: z.number(),
  absoluteDelta: z.number(),
  relativeDelta: z.number().nullable(),
  habitId: z.uuid().nullish(),
  read: readBlockMetadataSchema.nullish(),
})

export type PeriodTotalCard = z.infer<typeof periodTotalCardSchema>
export type PeriodComparisonCard = z.infer<typeof periodComparisonCardSchema>

export const habitListCardStatusSchema = z.enum(['today', 'overdue', 'general', 'none', 'done'])

export type HabitListCardStatus = z.infer<typeof habitListCardStatusSchema>

export const habitListCardItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  emoji: z.string().nullable().optional(),
  depth: z.number(),
  isBadHabit: z.boolean(),
  status: habitListCardStatusSchema,
  isSkippedOnDate: z.boolean().nullish(),
})

export type HabitListCardItem = z.infer<typeof habitListCardItemSchema>

export const habitListCardSchema = z.object({
  read: readBlockMetadataSchema.nullish(),
  scope: z.enum(['today', 'all', 'date']),
  date: z.iso.date().nullish(),
  totalCount: z.number().nullish(),
  sourceRevision: z.string().nullish(),
  items: z.array(habitListCardItemSchema),
})

export type HabitListCard = z.infer<typeof habitListCardSchema>

export const goalListCardItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  current: z.number(),
  target: z.number(),
  unit: z.string(),
  deadline: z.string().nullable().optional(),
  trackingStatus: z.enum(['on_track', 'at_risk', 'behind', 'no_deadline']).nullable().optional(),
  status: z.string().nullish(),
  progressPercentage: z.number().nullable().optional(),
  projectedCompletionDate: z.iso.date().nullable().optional(),
  daysToDeadline: z.number().nullable().optional(),
})

export type GoalListCardItem = z.infer<typeof goalListCardItemSchema>

export const goalListCardSchema = z.object({
  read: readBlockMetadataSchema.nullish(),
  totalCount: z.number().nullish(),
  sourceRevision: z.string().nullish(),
  items: z.array(goalListCardItemSchema),
})

export type GoalListCard = z.infer<typeof goalListCardSchema>

export const metricsCardSchema = z.object({
  read: readBlockMetadataSchema.nullish(),
  period: z.string(),
  periodMetrics: periodHabitMetricsSchema.nullish(),
  completionRate: z.number(),
  totalCompletions: z.number(),
  totalScheduled: z.number(),
  activeDays: z.number(),
  currentStreak: z.number(),
  bestStreak: z.number(),
  hasData: z.boolean(),
  surfaceId: z.string(),
  series: completionSeriesSchema.nullable().optional(),
  topHabitName: z.string().nullable().optional(),
  topHabitEmoji: z.string().nullable().optional(),
  habitId: z.uuid().nullable().optional(),
  habitTitle: z.string().nullable().optional(),
  weeklyCompletionRate: z.number().nullable().optional(),
  monthlyCompletionRate: z.number().nullable().optional(),
  lastCompletedDate: z.iso.date().nullable().optional(),
})

export type MetricsCard = z.infer<typeof metricsCardSchema>

export const periodInsightCardSchema = z.object({
  read: readBlockMetadataSchema.nullish(),
  period: z.string(),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  completionRate: z.number(),
  activeDays: z.number(),
  periodDays: z.number(),
  totalCompletions: z.number(),
  totalScheduled: z.number(),
  currentStreak: z.number(),
  bestStreak: z.number(),
  topHabits: z.array(retrospectiveHabitStatSchema),
  needsAttention: z.array(retrospectiveHabitStatSchema),
  narrative: z.object({
    highlights: z.string(),
    missed: z.string(),
    trends: z.string(),
    suggestion: z.string(),
  }),
  series: completionSeriesSchema.nullable().optional(),
  surfaceId: z.string().optional(),
})

export type PeriodInsightCard = z.infer<typeof periodInsightCardSchema>

export const daySummaryCardSchema = z.object({
  read: readBlockMetadataSchema.nullish(),
  date: z.iso.date(),
  dateTo: z.iso.date().nullish(),
  due: z.number(),
  done: z.number(),
  completionRate: z.number().nullable(),
  overdueCount: z.number(),
  currentStreak: z.number(),
  surfaceId: z.string(),
  rows: z.array(habitListCardItemSchema).nullish(),
  totalRows: z.number().nullish(),
})

export type DaySummaryCard = z.infer<typeof daySummaryCardSchema>

const streakAchievementSchema = z.object({
  id: z.string(),
  iconKey: z.string(),
  earnedAt: z.string().nullable(),
})

export const streakCardSchema = z.object({
  firstEligibleDate: z.iso.date().nullish(),
  read: readBlockMetadataSchema.nullish(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  level: z.number(),
  totalXp: z.number(),
  xpForNextLevel: z.number(),
  lastActiveDate: z.iso.date().nullable(),
  isFrozenToday: z.boolean(),
  recentFreezeDates: z.array(z.iso.date()),
  recentAchievements: z.array(streakAchievementSchema),
  surfaceId: z.string(),
  achievementDiscs: z.array(streakAchievementSchema).nullable().optional(),
})

export type StreakCard = z.infer<typeof streakCardSchema>

export const gamificationCardSchema = z.object({
  state: z.object({
    profile: gamificationProfileSchema.extend({ levelTitleKey: z.string() }).nullable(),
    achievements: z.object({ achievements: z.array(achievementSchema) }).nullable(),
    streak: streakInfoSchema.extend({ repairsRemainingThisMonth: z.number() }).nullable(),
  }),
  surfaceId: z.string().default('progress'),
  read: readBlockMetadataSchema.nullish(),
})

export type GamificationCard = z.infer<typeof gamificationCardSchema>

export const gamificationReadBlockResponseSchema = z.object({
  kind: z.literal('gamification'),
  block: gamificationCardSchema,
  read: readBlockMetadataSchema,
})

export type GamificationReadBlockResponse = z.infer<typeof gamificationReadBlockResponseSchema>

export const calendarCardSchema = z.object({
  read: readBlockMetadataSchema.nullish(),
  events: z.array(z.object({
    title: z.string(),
    start: z.string(),
    end: z.string().nullable(),
    isAllDay: z.boolean(),
    id: z.string().nullish(),
    calendarName: z.string().nullish(),
  })),
  sync: z.object({
    enabled: z.boolean(),
    status: z.enum(['Idle', 'ReconnectRequired', 'TransientError']),
    lastSyncedAt: z.string().nullable(),
    hasGoogleConnection: z.boolean().nullish(),
  }).nullable().optional(),
  surfaceId: z.string(),
})

export type CalendarCard = z.infer<typeof calendarCardSchema>

export const habitMonthCardSchema = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  today: z.iso.date(),
  weekStartDay: z.union([z.literal(0), z.literal(1)]),
  calendar: calendarMonthResponseSchema,
  language: z.string().optional(),
  surfaceId: z.string().optional(),
  read: readBlockMetadataSchema.nullish(),
})

export type HabitMonthCard = z.infer<typeof habitMonthCardSchema>

export const habitMonthReadBlockResponseSchema = z.object({
  kind: z.literal('habitMonth'),
  block: habitMonthCardSchema,
  read: readBlockMetadataSchema,
})

export type HabitMonthReadBlockResponse = z.infer<typeof habitMonthReadBlockResponseSchema>


export const recordListCardSchema = z.object({
  read: readBlockMetadataSchema.nullish(),
  kind: z.enum(['notifications', 'tags', 'templates', 'keys', 'habitHistory']),
  totalCount: z.number(),
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    detail: z.string().nullable().optional(),
    logDate: z.iso.date().nullish(),
    value: z.number().nullish(),
    date: z.string().nullable().optional(),
    isRead: z.boolean().nullable().optional(),
    count: z.number().nullable().optional(),
    state: z.enum(['active', 'expired', 'revoked']).nullable().optional(),
  })),
  surfaceId: z.string().nullable().optional(),
  nextCursor: z.string().nullable().optional(),
})

export type RecordListCard = z.infer<typeof recordListCardSchema>

export const accountRowsCardSchema = z.object({
  read: readBlockMetadataSchema.nullish(),
  kind: z.enum(['profile', 'plan', 'referral']),
  rows: z.array(z.object({
    key: z.string(),
    value: z.string().nullable(),
    valueType: z.enum(['text', 'date', 'enum', 'boolean', 'count']),
  })),
  referralCode: z.string().nullable().optional(),
  referralLink: z.string().nullable().optional(),
  surfaceId: z.string(),
})

export type AccountRowsCard = z.infer<typeof accountRowsCardSchema>

const astraBlockOptionSchema = z.object({
  id: z.string().check(utf16Length('min', 1)),
  label: z.string().check(utf16Length('min', 1)).check(utf16Length('max', 20)),
  description: z.string().check(utf16Length('max', 24)).nullable().optional(),
})

export const choiceBlockSchema = z.object({
  blockId: z.uuid(),
  question: z.string().check(utf16Length('min', 1)).check(utf16Length('max', 120)),
  options: z.array(astraBlockOptionSchema).min(2).max(4),
  multiSelect: z.boolean(),
  allowFreeText: z.boolean(),
  expiresAtUtc: z.iso.datetime(),
})

export const pickListBlockSchema = z.object({
  blockId: z.uuid(),
  title: z.string().check(utf16Length('min', 1)),
  items: z.array(z.object({
    id: z.string().check(utf16Length('min', 1)),
    label: z.string().check(utf16Length('min', 1)),
    detail: z.string().nullable(),
  })).min(1).max(10),
  action: z.enum(['create_habits', 'log_habits', 'skip_habits']),
  expiresAtUtc: z.iso.datetime(),
})

export const blockAnswerSchema = z.object({
  blockId: z.uuid(),
  selectedIds: z.array(z.string().check(utf16Length('min', 1))),
  freeText: z.string().check(utf16Length('max', 500)).optional(),
  answers: z.array(questionAnswerSchema).min(1).max(10).refine(values => new Set(values.map(value => value.questionId)).size === values.length).optional(),
})

export type ChoiceBlock = z.infer<typeof choiceBlockSchema>
export type PickListBlock = z.infer<typeof pickListBlockSchema>
export type BlockAnswer = z.infer<typeof blockAnswerSchema>

const chatBlockSchemas = {
  oneSmallStep: oneSmallStepCardSchema,
  habitSuggestions: habitSuggestionsCardSchema,
  habitRanking: habitRankingCardSchema,
  habitList: habitListCardSchema,
  goalList: goalListCardSchema,
  metrics: metricsCardSchema,
  periodTotal: periodTotalCardSchema,
  periodComparison: periodComparisonCardSchema,
  periodInsight: periodInsightCardSchema,
  daySummary: daySummaryCardSchema,
  streak: streakCardSchema,
  gamification: gamificationCardSchema,
  calendar: calendarCardSchema,
  habitMonth: habitMonthCardSchema,
  recordList: recordListCardSchema,
  accountRows: accountRowsCardSchema,
  choice: choiceBlockSchema,
  pickList: pickListBlockSchema,
  question: questionBlockSchema,
} satisfies Record<ChatBlockKind, z.ZodType>

function blockPartSchema<Kind extends ChatBlockKind>(kind: Kind) {
  return z.object({ type: z.literal('block'), kind: z.literal(kind), block: chatBlockSchemas[kind] })
}

export const chatPartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.discriminatedUnion('kind', [
    blockPartSchema('oneSmallStep'),
    blockPartSchema('habitSuggestions'),
    blockPartSchema('habitRanking'),
    blockPartSchema('habitList'),
    blockPartSchema('goalList'),
    blockPartSchema('metrics'),
    blockPartSchema('periodTotal'),
    blockPartSchema('periodComparison'),
    blockPartSchema('periodInsight'),
    blockPartSchema('daySummary'),
    blockPartSchema('streak'),
    blockPartSchema('gamification'),
    blockPartSchema('calendar'),
    blockPartSchema('habitMonth'),
    blockPartSchema('recordList'),
    blockPartSchema('accountRows'),
    blockPartSchema('choice'),
    blockPartSchema('pickList'),
    blockPartSchema('question'),
  ]),
]).nullable().catch(null)

export type ChatPart = z.infer<typeof chatPartSchema>
export type ChatBlockPart = Extract<ChatPart, { type: 'block' }>

export const readBlockResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('habitList'), block: habitListCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('goalList'), block: goalListCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('metrics'), block: metricsCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('periodInsight'), block: periodInsightCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('daySummary'), block: daySummaryCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('streak'), block: streakCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('calendar'), block: calendarCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('recordList'), block: recordListCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('accountRows'), block: accountRowsCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('periodTotal'), block: periodTotalCardSchema, read: readBlockMetadataSchema }),
  z.object({ kind: z.literal('periodComparison'), block: periodComparisonCardSchema, read: readBlockMetadataSchema }),
])

export type ReadBlockResponse = z.infer<typeof readBlockResponseSchema>
export type ReadBlockSnapshot = ReadBlockResponse | HabitMonthReadBlockResponse | GamificationReadBlockResponse
export type ReadBlockPart = Exclude<ChatBlockPart, { kind: 'choice' | 'pickList' | 'question' | 'habitSuggestions' | 'oneSmallStep' }>

export const chatFollowUpSchema = z.object({
  label: z.string().trim().check(utf16Length('min', 1)).check(utf16Length('max', 40)).regex(/^[^\r\n]+$/),
  question: z.string().trim().check(utf16Length('min', 1)).check(utf16Length('max', 240)).regex(/^[^\r\n]+$/),
  context: z.string().check(utf16Length('max', 500)).nullish(),
  target: z.enum(['habits', 'goals', 'progress', 'today', 'calendar', 'notifications', 'tags', 'checklistTemplates', 'apiKeys', 'profile']).nullish(),
  queryId: z.uuid().nullish(),
})

export type ChatFollowUp = z.infer<typeof chatFollowUpSchema>

const replyCardFieldsShape = {
  correlationId: z.string().nullable().optional(),
  relatedSurfaces: z.array(z.string()).nullable().optional(),
  habitList: habitListCardSchema.nullable().optional(),
  goalList: goalListCardSchema.nullable().optional(),
  metricsCard: metricsCardSchema.nullable().optional(),
  periodInsight: periodInsightCardSchema.nullable().optional(),
  daySummary: daySummaryCardSchema.nullable().optional(),
  streak: streakCardSchema.nullable().optional(),
  calendar: calendarCardSchema.nullable().optional(),
  recordLists: z.array(recordListCardSchema).nullable().optional(),
  accountRows: accountRowsCardSchema.nullable().optional(),
  followUps: z.array(z.string()).nullable().optional(),
  followUpContext: z.array(chatFollowUpSchema.nullable().catch(null)).nullish().catch(null),
}

export const chatMessageSchema = z.object({
  proactiveItem: z.lazy(() => proactiveItemSchema).optional(),
  proactiveActed: z.boolean().optional(),
  proactiveContextAfterMessageId: z.string().nullable().optional(),
  id: z.string(),
  role: z.enum(['user', 'ai']),
  content: z.string(),
  parts: z.array(chatPartSchema).nullable().optional(),
  actions: z.array(actionResultSchema).optional(),
  operations: z.array(agentOperationResultSchema).nullable().optional(),
  pendingOperations: z.array(pendingAgentOperationSchema).nullable().optional(),
  pendingOperationStates: z.record(z.string(), z.object({
    status: z.enum(['done', 'failed']).optional(),
    completedOperation: agentOperationResultSchema.optional(),
    canRetry: z.boolean().optional(),
    dismissed: z.boolean().optional(),
    rejected: z.boolean().optional(),
    stale: z.boolean().optional(),
    refreshUnavailable: z.boolean().optional(),
    editedItemIds: z.array(z.string()).optional(),
    originalItemIds: z.array(z.string()).optional(),
    operation: pendingAgentOperationSchema.optional(),
  })).optional(),
  answerToBlockId: z.string().optional(),
  blockAnswers: z.record(z.string(), z.object({ text: z.string(), answered: z.boolean() })).optional(),
  habitSuggestionOperations: z.record(z.string(), z.string()).optional(),
  habitSuggestionItems: z.record(z.string(), z.string()).optional(),
  appliedHabitSuggestions: z.array(z.string()).optional(),
  clarificationPreviews: z.record(z.string(), pendingAgentOperationSchema).optional(),
  policyDenials: z.array(agentPolicyDenialSchema).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  ...replyCardFieldsShape,
  toolSteps: z.array(z.object({ domain: z.string(), access: z.string() })).optional(),
  timestamp: z.date(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

export const chatResponseSchema = z.object({
  aiMessage: z.string().nullable().optional(),
  parts: z.array(chatPartSchema).nullable().optional(),
  actions: z.array(actionResultSchema),
  operations: z.array(agentOperationResultSchema).nullable().optional(),
  pendingOperations: z.array(pendingAgentOperationSchema).nullable().optional(),
  policyDenials: z.array(agentPolicyDenialSchema).nullable().optional(),
  ...replyCardFieldsShape,
  messageAllowanceConsumed: z.boolean().nullish(),
})

export type ChatResponse = z.infer<typeof chatResponseSchema>

/**
 * One server-sent event on the chat stream, mirroring the backend's ChatStreamEvent record:
 * started/round keep the connection alive during tool work, delta/reset drive incremental
 * rendering, final carries the complete ChatResponse (always authoritative over streamed
 * text), and error carries an HTTP-equivalent status.
 */
const chatTurnIdentity = {
  turnId: z.string().optional(),
  state: z.string().optional(),
}

export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), ...chatTurnIdentity, replayed: z.boolean().optional() }),
  z.object({ type: z.literal('round'), iteration: z.number() }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('reset') }),
  z.object({ type: z.literal('step'), domain: z.string(), access: z.string() }),
  z.object({ type: z.literal('final'), response: chatResponseSchema, ...chatTurnIdentity }),
  z.object({
    type: z.literal('error'),
    status: z.number(),
    error: z.string(),
    code: z.string().optional(),
    ...chatTurnIdentity,
  }),
])

export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>
