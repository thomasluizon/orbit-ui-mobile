import { z } from 'zod'
import type { PendingOperationChange } from '../types/ai'

const subHabitSchema = z.looseObject({
  title: z.string(),
  emoji: z.string().nullable().optional(),
  due_time: z.string().nullable().optional(),
  frequency_unit: z.string().nullable().optional(),
  frequency_quantity: z.number().nullable().optional(),
  is_bad_habit: z.boolean().optional(),
  is_general: z.boolean().optional(),
  is_flexible: z.boolean().optional(),
})

const storedChildSchema = z.looseObject({ emoji: z.string().nullable().optional() })

/** A create preview's `sub_habits.oldValue` is a JSON list of each proposed child's stored values, in the same order. */
function storedChildEmojis(oldValue: string | null): readonly (string | null | undefined)[] {
  if (!oldValue) return []
  let stored: unknown
  try {
    stored = JSON.parse(oldValue)
  } catch {
    return []
  }
  return Array.isArray(stored) ? stored.map((child) => storedChildSchema.safeParse(child).data?.emoji) : []
}

export function pendingOperationSubHabits(fields: readonly PendingOperationChange[]): readonly {
  title: string
  /** The emoji of the existing habit a reused child names. A new draft child has no stored habit, so its stored values describe nothing. */
  storedEmoji?: string
  fields: PendingOperationChange[]
}[] {
  const field = fields.find((entry) => entry.field === 'sub_habits')
  if (!Array.isArray(field?.proposedValue)) return []
  const storedEmojis = storedChildEmojis(field.oldValue)
  return z.array(subHabitSchema).parse(field.proposedValue).map((child, index) => ({
    title: child.title,
    storedEmoji: child.habit_id == null ? undefined : storedEmojis[index] || undefined,
    fields: Object.entries(child).map(([name, value]) => ({
      entityId: field.entityId, entityName: child.title, field: name,
      oldValue: null, newValue: value == null ? null : typeof value === 'string' ? value : JSON.stringify(value), proposedValue: value,
      valueType: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text',
      isEditable: false,
    })),
  }))
}
