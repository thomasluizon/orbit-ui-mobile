import { z } from 'zod'

export const habitLogSchema = z.object({
  id: z.string(),
  date: z.string(),
  value: z.number(),
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

const calendarSyncEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  isRecurring: z.boolean(),
  recurrenceRule: z.string().nullable(),
  reminders: z.array(z.number()),
  calendarId: z.string().optional(),
  calendarName: z.string().optional(),
})

export const calendarAutoSyncStatusSchema = z.enum(['Idle', 'ReconnectRequired', 'TransientError'])

export type CalendarAutoSyncStatus = z.infer<typeof calendarAutoSyncStatusSchema>

export const calendarAutoSyncStateSchema = z.object({
  enabled: z.boolean(),
  status: calendarAutoSyncStatusSchema,
  lastSyncedAt: z.string().nullable(),
  hasGoogleConnection: z.boolean(),
})

export type CalendarAutoSyncState = z.infer<typeof calendarAutoSyncStateSchema>

export const calendarSyncSuggestionSchema = z.object({
  id: z.string(),
  googleEventId: z.string(),
  event: calendarSyncEventSchema,
  discoveredAtUtc: z.string(),
})

export type CalendarSyncSuggestion = z.infer<typeof calendarSyncSuggestionSchema>

export const calendarAutoSyncResultSchema = z.object({
  newSuggestions: z.number(),
  reconciledHabits: z.number(),
  status: calendarAutoSyncStatusSchema,
})

export type CalendarAutoSyncResult = z.infer<typeof calendarAutoSyncResultSchema>

export const userCalendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  accessRole: z.string(),
  primary: z.boolean(),
  backgroundColor: z.string().nullable(),
  isSynced: z.boolean(),
})

export type UserCalendar = z.infer<typeof userCalendarSchema>

export const userCalendarsSchema = z.array(userCalendarSchema)

export const selectedCalendarsRequestSchema = z.object({
  calendarIds: z.array(z.string()),
})

export type SelectedCalendarsRequest = z.infer<typeof selectedCalendarsRequestSchema>
