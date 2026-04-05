/**
 * Request builder helpers for habit create/edit modals.
 *
 * Shared logic extracted to reduce cognitive complexity
 * and ensure parity between web and mobile.
 */

import type {
  CreateHabitRequest,
  CreateSubHabitRequest,
  UpdateHabitRequest,
  ScheduledReminderTime,
} from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Shared form data shape
// ---------------------------------------------------------------------------

export interface HabitFormData {
  title: string
  description: string
  isGeneral: boolean
  isFlexible: boolean
  frequencyUnit: 'Day' | 'Week' | 'Month' | 'Year' | null
  frequencyQuantity: number | null
  days: string[]
  dueDate: string
  dueTime: string
  dueEndTime: string
  endDate: string
  isBadHabit: boolean
  slipAlertEnabled: boolean
  reminderEnabled: boolean
  scheduledReminders: ScheduledReminderTime[]
  checklistItems: Array<{ text: string; isChecked: boolean }>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applyScheduleFields(
  req: Record<string, unknown>,
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
    if (data.days?.length) req.days = data.days
    if (data.endDate) req.endDate = data.endDate
  }
}

function applyReminderFields(
  req: Record<string, unknown>,
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
  if (data.reminderEnabled && (data.scheduledReminders?.length ?? 0) > 0) {
    req.reminderEnabled = true
    req.scheduledReminders = data.scheduledReminders ?? undefined
  }
}

// ---------------------------------------------------------------------------
// Create: sub-habit request
// ---------------------------------------------------------------------------

export function buildSubHabitRequest(
  data: HabitFormData,
  reminderTimes: number[],
  tagIds: string[],
): CreateSubHabitRequest {
  const req = { title: data.title } as Record<string, unknown>
  if (data.description) req.description = data.description
  if (!data.isGeneral) {
    applyScheduleFields(req, data)
    applyReminderFields(req, data, reminderTimes)
  }
  if (data.isBadHabit) {
    req.isBadHabit = true
    req.slipAlertEnabled = data.slipAlertEnabled
  }
  if (data.checklistItems?.length) req.checklistItems = data.checklistItems
  if (tagIds.length) req.tagIds = tagIds
  return req as unknown as CreateSubHabitRequest
}

// ---------------------------------------------------------------------------
// Create: top-level habit request
// ---------------------------------------------------------------------------

export function buildCreateHabitRequest(
  data: HabitFormData,
  reminderTimes: number[],
  tagIds: string[],
  goalIds: string[],
  subHabits: string[],
): CreateHabitRequest {
  const req: Record<string, unknown> = {
    title: data.title,
    isBadHabit: data.isBadHabit,
  }
  if (data.description) req.description = data.description
  if (data.isGeneral) {
    req.isGeneral = true
  } else {
    req.dueDate = data.dueDate
    applyScheduleFields(req, data)
    applyReminderFields(req, data, reminderTimes)
  }
  if (data.isBadHabit) req.slipAlertEnabled = data.slipAlertEnabled
  if (data.checklistItems?.length) req.checklistItems = data.checklistItems
  if (tagIds.length) req.tagIds = tagIds
  if (goalIds.length) req.goalIds = goalIds
  const filtered = subHabits.filter((s) => s.trim())
  if (filtered.length) req.subHabits = filtered
  return req as unknown as CreateHabitRequest
}

// ---------------------------------------------------------------------------
// Update: edit habit request
// ---------------------------------------------------------------------------

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
  if (data.days?.length) request.days = data.days
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
    request.reminderTimes = reminderTimes
    return
  }
  if (data.reminderEnabled && (data.scheduledReminders?.length ?? 0) > 0) {
    request.reminderEnabled = true
    request.scheduledReminders = data.scheduledReminders ?? undefined
    return
  }
  request.reminderEnabled = false
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

  if (!data.isGeneral) {
    applyUpdateScheduleFields(request, data, isOneTime, originalEndDate)
    applyUpdateReminderFields(request, data, reminderTimes)
  }

  request.slipAlertEnabled = data.isBadHabit ? data.slipAlertEnabled : false
  if (data.checklistItems?.length) request.checklistItems = data.checklistItems
  request.goalIds = selectedGoalIds
  return request
}
