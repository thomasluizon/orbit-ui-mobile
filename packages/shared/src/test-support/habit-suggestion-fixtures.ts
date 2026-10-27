import { habitSuggestionDraftSchema, type HabitSuggestionsCard } from '../types/habit-suggestions'
import type { ChatMessage } from '../types/chat'
import type { AgentExecuteOperationResponse } from '../types/ai'

export const habitSuggestionDraftFixture = habitSuggestionDraftSchema.parse({
  id: '11111111-1111-4111-8111-111111111111', emoji: '📖', title: 'Read', type: 'Habit',
  frequencyUnit: 'Day', frequencyQuantity: 1, days: [], dueDate: '2026-10-26',
  dueTime: '22:00:00', dueEndTime: '22:15:00', reminderMinutesBefore: 15,
  checklistItems: ['Choose a book', 'Read a page'], reason: 'A quiet pause before bed.',
})

export const habitSuggestionsFixture: HabitSuggestionsCard = { language: 'en', drafts: [
  habitSuggestionDraftFixture,
  { ...habitSuggestionDraftFixture, id: '22222222-2222-4222-8222-222222222222', title: 'Stretch', dueTime: '21:00:00', dueEndTime: '21:15:00' },
] }

export function makeHabitSuggestionMessage(): ChatMessage {
  return { id: 'suggestions', role: 'ai', content: '', timestamp: new Date('2026-10-26T12:00:00Z'),
    parts: [{ type: 'block', kind: 'habitSuggestions', block: habitSuggestionsFixture }] }
}

export function makeHabitSuggestionPreview(id = 'suggestion-preview'): AgentExecuteOperationResponse {
  return { operation: { operationId: 'create_habit', sourceName: 'create_habit', riskClass: 'Low',
    confirmationRequirement: 'FreshConfirmation', status: 'PendingConfirmation', pendingOperationId: id },
    pendingOperation: { id, capabilityId: 'habits.write', displayName: 'Create habit', summary: 'Read', actionKey: 'createHabit', previewFingerprint: 'suggestion-fingerprint', riskClass: 'Low',
      confirmationRequirement: 'FreshConfirmation', expiresAtUtc: '2026-10-27T12:00:00Z' } }
}
