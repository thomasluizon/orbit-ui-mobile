import { z } from 'zod'
import { utf16Length } from '../validation/utf16-length'

const habitIdSchema = z.uuid().refine(value => value !== '00000000-0000-0000-0000-000000000000')

export const habitRankingResponseSchema = z.object({
  queryId: z.string().check(utf16Length('min', 1)),
  queryToken: z.string().check(utf16Length('min', 1)),
  revision: z.string().check(utf16Length('min', 1)),
  query: z.object({
    dateFrom: z.iso.date(),
    dateToExclusive: z.iso.date(),
    timeZone: z.string().check(utf16Length('min', 1)),
    metric: z.literal('completion_log_records'),
    countDefinition: z.string().check(utf16Length('min', 1)),
    scope: z.object({
      entityType: z.literal('positive_recurring_habits'),
      includeChildren: z.literal(true),
      parentCounts: z.literal('own_logs_only'),
      inactiveHabits: z.literal('include_ended_and_completed'),
      softDeletedHabits: z.literal('exclude_with_logs'),
      tasksAndSlips: z.literal('exclude'),
      zeroCompletions: z.literal('exclude'),
    }),
    habitIds: z.array(habitIdSchema).max(100),
    pageSize: z.number().int().min(1).max(100),
    boundaryConvention: z.literal('start_inclusive_end_exclusive'),
  }),
  rows: z.array(z.object({
    rank: z.number().int().positive(),
    habitId: habitIdSchema,
    name: z.string(),
    emoji: z.string().nullable(),
    parentHabitId: habitIdSchema.nullable(),
    completedCount: z.number().int().positive(),
  })).max(100),
  totalCount: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  isComplete: z.boolean(),
  nextCursor: z.string().check(utf16Length('min', 1)).nullable(),
}).refine(page => {
  const end = page.offset + page.rows.length
  return page.query.dateFrom < page.query.dateToExclusive
    && end <= page.totalCount
    && page.rows.length <= page.query.pageSize
    && page.isComplete === (end === page.totalCount)
    && (page.isComplete ? page.nextCursor === null : page.nextCursor !== null && page.rows.length > 0)
    && new Set(page.rows.map(row => row.habitId)).size === page.rows.length
    && page.rows.every((row, index) => row.rank === page.offset + index + 1)
}, { message: 'Invalid ranking window or page coverage' })

export const habitRankingCardSchema = z.object({
  ranking: habitRankingResponseSchema,
  surfaceId: z.literal('progress'),
})

export type HabitRankingResponse = z.infer<typeof habitRankingResponseSchema>
export type HabitRankingCard = z.infer<typeof habitRankingCardSchema>
