import { z } from 'zod'

export const proactiveItemSchema = z.object({
  id: z.uuid(),
  trigger: z.string(),
  localDate: z.iso.date(),
  text: z.string(),
  actionLabel: z.string().default(''),
  actionPrompt: z.string(),
  createdAtUtc: z.iso.datetime({ offset: true }),
  shownAtUtc: z.iso.datetime({ offset: true }).nullable(),
  pushedAtUtc: z.iso.datetime({ offset: true }).nullable(),
  facts: z.object({
    trigger: z.int(),
    habitTitles: z.array(z.string()),
    habitCount: z.union([z.int(), z.string().regex(/^-?(?:0|[1-9]\d*)$/)]).nullish(),
    currentStreak: z.union([z.int(), z.string().regex(/^-?(?:0|[1-9]\d*)$/)]).nullish(),
    hasEstablishedStreak: z.boolean().default(false),
    goalId: z.uuid().nullish(),
    goalTitle: z.string().nullish(),
    trackingStatus: z.string().nullish(),
    timedEventCount: z.union([z.int(), z.string().regex(/^-?(?:0|[1-9]\d*)$/)]).nullish(),
    timedMinutes: z.union([z.int(), z.string().regex(/^-?(?:0|[1-9]\d*)$/)]).nullish(),
    periodFrom: z.iso.date().nullish(),
    periodTo: z.iso.date().nullish(),
    totalCompletions: z.union([z.int(), z.string().regex(/^-?(?:0|[1-9]\d*)$/)]).nullish(),
    totalScheduled: z.union([z.int(), z.string().regex(/^-?(?:0|[1-9]\d*)$/)]).nullish(),
    badHabitSlips: z.union([z.int(), z.string().regex(/^-?(?:0|[1-9]\d*)$/)]).nullish(),
    hadScheduledHabitsYesterday: z.boolean().nullish(),
    hadPositiveLogsYesterday: z.boolean().nullish(),
    hadRecentActivity: z.boolean().nullish(),
  }).nullable(),
})

export const proactiveItemStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(['active', 'ended']),
})

export type ProactiveItem = z.infer<typeof proactiveItemSchema>
export type ProactiveItemStatus = z.infer<typeof proactiveItemStatusSchema>
