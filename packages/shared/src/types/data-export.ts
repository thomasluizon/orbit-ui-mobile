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

export const userDataExportSchema = z.object({
  exportedAtUtc: z.string(),
  account: exportedAccountSchema,
  settings: exportedSettingsSchema,
  habits: z.array(exportedHabitSchema),
  goals: z.array(exportedGoalSchema),
  tags: z.array(exportedTagSchema),
  facts: z.array(exportedUserFactSchema),
})

export type UserDataExport = z.infer<typeof userDataExportSchema>
