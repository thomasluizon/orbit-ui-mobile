import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { chatResponse, preview, suggestionDraft, toolCall } from './producer.mjs'
import parseResponse from '../../response.mjs'

export const brainDumpCases = parse(readFileSync(new URL('../../composition-scenarios.yaml', import.meta.url), 'utf8'))
  .filter((entry) => entry.vars.brainDump)
export const existingId = '22222222-2222-4222-8222-222222222222'

// Producer: API brain dump replays, PendingOperationChangePreviewer and HabitSuggestionDraft.
export function brainDumpAttempt(source = brainDumpCases[0]) {
  const test = JSON.parse(JSON.stringify(source).replaceAll('{accountDate}', '2026-10-28')
    .replaceAll('{tomorrowDate}', '2026-10-29').replaceAll('{habitId}', existingId))
  test.vars.accountDate = '2026-10-28'
  test.vars.evalRequestId = 'brain-dump-request'
  const portuguese = test.metadata.locale === 'pt-BR'
  const habits = test.vars.brainDump.items.map(({ titleContains, habitType, ...schedule }, index) => ({
    title: index === 0 ? portuguese ? 'Ligar para o dentista' : 'Call the dentist'
      : index === 1 ? portuguese ? 'Alongar' : 'Stretch' : portuguese ? 'Beber água' : 'Water', ...schedule,
  }))
  const calls = []
  if (test.vars.brainDump.additionalIdeas) {
    const draft = suggestionDraft({ dueDate: test.vars.accountDate, title: portuguese ? 'Ler' : 'Read' })
    const suggestion = toolCall('suggest_habits', { instruction: 'daily idea', language: test.metadata.locale, count: 1 }, 'Succeeded', 'suggestion', test.vars.clientContext)
    suggestion.result.payload = { language: test.metadata.locale, drafts: [draft] }
    calls.push(suggestion)
    habits.push({ title: draft.title, frequency_unit: draft.frequencyUnit, frequency_quantity: draft.frequencyQuantity,
      due_date: draft.dueDate, due_time: draft.dueTime, due_end_time: draft.dueEndTime,
      days: draft.days, emoji: draft.emoji, reminder_enabled: true, reminder_times: [draft.reminderMinutesBefore],
      checklist_items: draft.checklistItems.map((text) => ({ text, is_checked: false })) })
  }
  const bulk = toolCall('bulk_create_habits', { habits }, 'PendingConfirmation', 'bulk', test.vars.clientContext)
  calls.push(bulk)
  const pending = preview()
  pending.changeTargetCount = habits.length
  pending.items = habits.map((habit, index) => ({ itemId: String(index), entityId: habit.habit_id ?? null,
    entityName: habit.title, stateFingerprint: `state-${index}`, removesData: false,
    habitType: habit.frequency_unit === 'OneTime' ? 'Task' : 'Habit',
    fields: Object.entries(habit).filter(([key]) => key !== 'habit_id').map(([field, proposedValue]) => ({
      entityId: habit.habit_id ?? '00000000-0000-0000-0000-000000000000', entityName: habit.title,
      field, oldValue: null, newValue: typeof proposedValue === 'string' ? proposedValue : JSON.stringify(proposedValue),
      valueType: typeof proposedValue === 'number' ? 'number' : 'text', proposedValue, isEditable: true,
    })),
  }))
  const response = { ...chatResponse(test.vars.evalRequestId, calls), aiMessage: '', parts: [], pendingOperations: [pending] }
  const output = parseResponse(response, '', { response: { status: 200, headers: { 'x-orbit-request-id': test.vars.evalRequestId } } })
  return { test, output, response }
}
