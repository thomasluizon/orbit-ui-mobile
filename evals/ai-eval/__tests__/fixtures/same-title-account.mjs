import { captures } from './core-streams.mjs'
import { storedHabit } from './lifecycle-case.mjs'

// Producer: the real staging capture of the owner request over one parent Water with six Water - 710ml children (#2127).
export const { children } = captures.complete
export const parent = '33333333-3333-4333-8333-333333333333'
export const sameTitleHabits = [storedHabit(parent, 'Water'), ...children.map((id) => storedHabit(id, 'Water - 710ml'))]
export const sameTitleRecords = { parent, children }
export const answered = captures.complete.turns.map((turn) => turn.at(-1).response)
export const withPreview = (pendingOperations) => ({ ...answered[1], pendingOperations })
const heldItems = answered[1].pendingOperations[0].items
export const renames = heldItems.filter((item) => item.fields.some((field) => field.field === 'title'))
export const deletes = heldItems.filter((item) => item.fields.some((field) => field.field === 'delete'))
export const combined = (items) => [{ ...answered[1].pendingOperations[0], items }]
