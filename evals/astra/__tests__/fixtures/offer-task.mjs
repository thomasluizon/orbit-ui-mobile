import { preview } from './producer.mjs'

export const title = 'Take one breath'
export const savedId = '44444444-4444-4444-8444-444444444444'
export const baseline = { habits: [], goals: [], tags: [], checklistTemplates: [] }

// Producer: PendingOperationChangePreviewer.CreationFields and AddCreationParent; HabitDetailResponse.
export function task() {
  const pending = preview(title)
  Object.assign(pending.items[0], { habitType: 'Task', removesData: false, entityEmoji: '🌿' })
  pending.items[0].fields = Object.entries({ title, description: 'One short pause.', emoji: '🌿',
    frequency_unit: 'OneTime', frequency_quantity: 1, days: [], due_date: '2031-06-10', due_time: '08:00',
    is_general: false, is_bad_habit: false, is_flexible: false, reminder_enabled: false,
    reminder_times: [], scheduled_reminders: [], relative_reminders: [], slip_alert_enabled: false,
    parent_habit_id: null,
  }).map(([field, proposedValue]) => ({ ...pending.items[0].fields[0], field, proposedValue,
    valueType: typeof proposedValue === 'boolean' ? 'boolean' : typeof proposedValue === 'number' ? 'number'
      : field === 'emoji' ? 'emoji' : field.endsWith('_date') ? 'date' : field.endsWith('_time') ? 'time' : 'text',
    newValue: field === 'parent_habit_id' ? 'No parent' : typeof proposedValue === 'object' ? JSON.stringify(proposedValue) : String(proposedValue),
    entityEmoji: '🌿' }))
  const detail = { id: savedId, title, description: 'One short pause.', emoji: '🌿', frequencyUnit: null,
    frequencyQuantity: null, days: [], dueDate: '2031-06-10', dueTime: '08:00:00', isGeneral: false,
    isBadHabit: false, isFlexible: false, reminderEnabled: false, reminderTimes: [], scheduledReminders: [],
    relativeReminders: [], slipAlertEnabled: false, parentHabitId: null }
  return { pending, detail }
}
