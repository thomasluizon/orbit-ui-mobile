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

export function pendingOperationSubHabits(fields: readonly PendingOperationChange[]): readonly {
  title: string
  fields: PendingOperationChange[]
}[] {
  const field = fields.find((entry) => entry.field === 'sub_habits')
  if (!Array.isArray(field?.proposedValue)) return []
  return z.array(subHabitSchema).parse(field.proposedValue).map((child) => ({
    title: child.title,
    fields: Object.entries(child).map(([name, value]) => ({
      entityId: field.entityId, entityName: child.title, field: name,
      oldValue: null, newValue: value == null ? null : typeof value === 'string' ? value : JSON.stringify(value), proposedValue: value,
      valueType: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text',
      isEditable: false,
    })),
  }))
}
