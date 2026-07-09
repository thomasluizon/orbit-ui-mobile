import type {
  CreateHabitRequest,
  CreateSubHabitRequest,
  NormalizedHabit,
  RescheduleSuggestion,
  UpdateHabitRequest,
} from '../types/habit'
import type { HabitFormData } from '../validation'

export type { HabitFormData }

function normalizeHabitEmoji(emoji: string | null | undefined): string | null {
  const normalized = emoji?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

type HabitRequestDraft = Partial<CreateHabitRequest>

function applyScheduleFields(
  req: HabitRequestDraft,
  data: HabitFormData,
): void {
  if (data.dueDate) req.dueDate = data.dueDate
  if (data.isFlexible) {
    req.isFlexible = true
    if (data.frequencyUnit) req.frequencyUnit = data.frequencyUnit
    if (data.frequencyQuantity) req.frequencyQuantity = data.frequencyQuantity
  } else if (data.frequencyUnit) {
    req.frequencyUnit = data.frequencyUnit
    req.frequencyQuantity = data.frequencyQuantity ?? undefined
    if (data.days.length) req.days = data.days
    if (data.endDate) req.endDate = data.endDate
  }
}

function applyReminderFields(
  req: HabitRequestDraft,
  data: HabitFormData,
  reminderTimes: number[],
): void {
  if (data.dueTime) {
    req.dueTime = data.dueTime
    if (data.dueEndTime) req.dueEndTime = data.dueEndTime
    req.reminderEnabled = data.reminderEnabled
    req.reminderTimes = reminderTimes
    return
  }
  if (data.reminderEnabled && data.scheduledReminders.length > 0) {
    req.reminderEnabled = true
    req.scheduledReminders = data.scheduledReminders
  }
}

export function buildSubHabitRequest(
  data: HabitFormData,
  reminderTimes: number[],
  tagIds: string[],
): CreateSubHabitRequest {
  const req: CreateSubHabitRequest = { title: data.title }
  if (data.description) req.description = data.description
  const emoji = normalizeHabitEmoji(data.emoji)
  if (emoji) req.emoji = emoji
  if (!data.isGeneral) {
    applyScheduleFields(req, data)
    applyReminderFields(req, data, reminderTimes)
  }
  if (data.isBadHabit) {
    req.isBadHabit = true
    req.slipAlertEnabled = data.slipAlertEnabled
  }
  if (data.checklistItems.length) req.checklistItems = data.checklistItems
  if (tagIds.length) req.tagIds = tagIds
  return req
}

export function buildCreateHabitRequest(
  data: HabitFormData,
  reminderTimes: number[],
  tagIds: string[],
  goalIds: string[],
  subHabits: string[],
): CreateHabitRequest {
  const req: CreateHabitRequest = {
    title: data.title,
    isBadHabit: data.isBadHabit,
  }
  if (data.description) req.description = data.description
  const emoji = normalizeHabitEmoji(data.emoji)
  if (emoji) req.emoji = emoji
  if (data.isGeneral) {
    req.isGeneral = true
  } else {
    req.dueDate = data.dueDate
    applyScheduleFields(req, data)
    applyReminderFields(req, data, reminderTimes)
  }
  if (data.isBadHabit) req.slipAlertEnabled = data.slipAlertEnabled
  if (data.checklistItems.length) req.checklistItems = data.checklistItems
  if (tagIds.length) req.tagIds = tagIds
  if (goalIds.length) req.goalIds = goalIds
  const filtered = subHabits.filter((s) => s.trim())
  if (filtered.length) req.subHabits = filtered
  return req
}

function applyUpdateScheduleFields(
  request: UpdateHabitRequest,
  data: HabitFormData,
  isOneTime: boolean,
  originalEndDate: string,
): void {
  if (data.dueDate) request.dueDate = data.dueDate
  if (isOneTime) return
  request.frequencyUnit = data.frequencyUnit ?? undefined
  request.frequencyQuantity = data.frequencyQuantity ?? undefined
  if (data.days.length) request.days = data.days
  if (data.endDate) {
    request.endDate = data.endDate
  } else if (originalEndDate) {
    request.clearEndDate = true
  }
}

function applyUpdateReminderFields(
  request: UpdateHabitRequest,
  data: HabitFormData,
  reminderTimes: number[],
): void {
  if (data.dueTime) {
    request.dueTime = data.dueTime
    request.dueEndTime = data.dueEndTime || undefined
    request.reminderEnabled = data.reminderEnabled
    request.reminderTimes = data.reminderEnabled ? reminderTimes : []
    request.scheduledReminders = []
    return
  }
  if (data.reminderEnabled && data.scheduledReminders.length > 0) {
    request.reminderEnabled = true
    request.reminderTimes = []
    request.scheduledReminders = data.scheduledReminders
    return
  }
  request.reminderEnabled = false
  request.reminderTimes = []
  request.scheduledReminders = []
}

/**
 * Builds the habit-update payload that applies an AI reschedule suggestion to a habit. It carries the
 * habit's identity fields (so the existing update path does not wipe them) and overwrites only the
 * schedule — cadence, days, due date, and optional time — from the suggestion. Reminders, checklist,
 * goals, and end date are intentionally omitted so the update path preserves them.
 */
export function buildRescheduleUpdateRequest(
  habit: NormalizedHabit,
  suggestion: RescheduleSuggestion,
): UpdateHabitRequest {
  const request: UpdateHabitRequest = {
    title: habit.title,
    isBadHabit: habit.isBadHabit,
    emoji: normalizeHabitEmoji(habit.emoji),
    dueDate: suggestion.dueDate,
  }
  if (habit.description) request.description = habit.description

  if (suggestion.frequencyUnit) {
    request.frequencyUnit = suggestion.frequencyUnit
    request.frequencyQuantity = suggestion.frequencyQuantity ?? 1
    if (suggestion.days.length > 0) request.days = suggestion.days
  }

  if (suggestion.dueTime) {
    request.dueTime = suggestion.dueTime
  } else if (habit.dueTime) {
    request.dueTime = habit.dueTime
    if (habit.dueEndTime) request.dueEndTime = habit.dueEndTime
  }

  return request
}

export function buildUpdateHabitRequest(
  data: HabitFormData,
  isOneTime: boolean,
  originalEndDate: string,
  reminderTimes: number[],
  selectedGoalIds: string[],
): UpdateHabitRequest {
  const request: UpdateHabitRequest = {
    title: data.title,
    isBadHabit: data.isBadHabit,
    isGeneral: data.isGeneral,
    isFlexible: data.isFlexible,
  }
  if (data.description) request.description = data.description
  request.emoji = normalizeHabitEmoji(data.emoji)

  if (!data.isGeneral) {
    applyUpdateScheduleFields(request, data, isOneTime, originalEndDate)
    applyUpdateReminderFields(request, data, reminderTimes)
  }

  request.slipAlertEnabled = data.isBadHabit ? data.slipAlertEnabled : false
  if (data.checklistItems.length) request.checklistItems = data.checklistItems
  request.goalIds = selectedGoalIds
  return request
}
