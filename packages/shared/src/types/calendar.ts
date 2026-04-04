import { z } from 'zod'

export const habitLogSchema = z.object({
  id: z.string(),
  date: z.string(),
  value: z.number(),
  note: z.string().nullable(),
  createdAtUtc: z.string(),
})

export type HabitLog = z.infer<typeof habitLogSchema>

export const habitDayStatusSchema = z.enum(['completed', 'upcoming', 'missed'])

export type HabitDayStatus = z.infer<typeof habitDayStatusSchema>

export const calendarDayEntrySchema = z.object({
  habitId: z.string(),
  title: z.string(),
  status: habitDayStatusSchema,
  isBadHabit: z.boolean(),
  dueTime: z.string().nullable(),
  isOneTime: z.boolean(),
})

export type CalendarDayEntry = z.infer<typeof calendarDayEntrySchema>
