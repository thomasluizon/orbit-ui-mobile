import type { HabitSuggestionDraft } from '../types/habit-suggestions'
import type { ChatMessage } from '../types/chat'
import type { HabitFormStateSnapshot } from '../utils/habit-form-state'
import { buildEmptyHabitFormValues } from '../utils/habit-form-state'
import type { HabitFormData } from '../validation/habit-form'

export function habitSuggestionFormValues(draft: HabitSuggestionDraft): Partial<HabitFormData> {
  return {
    title: draft.title, emoji: draft.emoji, itemType: draft.type === 'Task' ? 'task' : 'habit',
    frequencyUnit: draft.frequencyUnit, frequencyQuantity: draft.frequencyQuantity, intervalWeeks: 1,
    days: draft.days, dueDate: draft.dueDate, dueTime: draft.dueTime?.slice(0, 5) ?? '',
    dueEndTime: draft.dueEndTime?.slice(0, 5) ?? '', isGeneral: false, isFlexible: false,
    reminderEnabled: draft.reminderMinutesBefore !== null,
    scheduledReminders: [], checklistItems: draft.checklistItems.map(text => ({ text, isChecked: false })),
  }
}

export function habitSuggestionCreateValues(draft: HabitSuggestionDraft): HabitFormData {
  return { ...buildEmptyHabitFormValues(draft.dueDate), ...habitSuggestionFormValues(draft) }
}

export function habitSuggestionStatus(message: ChatMessage, id: string): 'available' | 'preview' | 'applied' {
  if (message.appliedHabitSuggestions?.includes(id)) return 'applied'
  const operationId = message.habitSuggestionOperations?.[id]
  if (!operationId) return 'available'
  const state = message.pendingOperationStates?.[operationId]
  const original = message.pendingOperations?.find(operation => operation.id === operationId)
  const drafts = message.parts?.flatMap(part => part?.type === 'block' && part.kind === 'habitSuggestions'
    ? part.block.drafts : []) ?? []
  const draftIndex = drafts.filter(draft => message.habitSuggestionOperations?.[draft.id] === operationId)
    .findIndex(draft => draft.id === id)
  const itemId = message.habitSuggestionItems?.[id] ?? original?.items?.[draftIndex]?.itemId
  if (itemId && state?.originalItemIds && !state.originalItemIds.includes(itemId)) return 'available'
  if (state?.status === 'done') return 'applied'
  if (state?.status === 'failed') return 'preview'
  return state?.rejected || state?.dismissed ? 'available' : 'preview'
}

export function replaceHabitSuggestion(message: ChatMessage, id: string, draft: HabitSuggestionDraft): ChatMessage {
  return { ...message, parts: message.parts?.map(part => part?.type === 'block' && part.kind === 'habitSuggestions'
    ? { ...part, block: { ...part.block, drafts: part.block.drafts.map(previous => previous.id === id ? draft : previous) } } : part) }
}

export function attachHabitSuggestionPreview(message: ChatMessage, ids: string[], operation: NonNullable<ChatMessage['pendingOperations']>[number]): ChatMessage {
  return { ...message, pendingOperations: [...(message.pendingOperations ?? []), operation],
    habitSuggestionOperations: { ...message.habitSuggestionOperations, ...Object.fromEntries(ids.map(id => [id, operation.id])) },
    habitSuggestionItems: { ...message.habitSuggestionItems, ...Object.fromEntries(ids.flatMap((id, index) => {
      const item = operation.items?.[index]
      return item ? [[id, item.itemId]] : []
    })) } }
}

export function habitSuggestionFormState<Snapshot extends HabitFormStateSnapshot>(snapshot: Snapshot, draft?: HabitSuggestionDraft): Snapshot {
  if (!draft) return snapshot
  return { ...snapshot, formValues: { ...snapshot.formValues, ...habitSuggestionFormValues(draft) },
    reminderTimes: draft.reminderMinutesBefore === null ? [] : [draft.reminderMinutesBefore],
    mode: draft.type === 'Task' ? 'oneTime' : 'recurring' }
}
