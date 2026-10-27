// Contract: orbit-api 5e376417, ChatResponse, ChatEvalTrace and AiToolCallResult.
export function toolCall(name, arguments_, status = 'Succeeded', id = 'call-1') {
  return {
    id, name, arguments: arguments_, status,
    result: {
      name, id, success: status === 'Succeeded' || status === 'PendingConfirmation',
      entityId: null,
      entityName: status === 'Succeeded' && name === 'query_habits'
        ? 'No habits found matching the given filters.' : null,
      error: null,
      payload: status === 'PendingConfirmation' ? {
        status: 'awaiting_confirmation', item_count: null, habit_count: null, date_count: null,
        proposed_titles: null, preview_items: null, dates: null,
        instruction: 'The preview is the entire answer. Emit no prose before or after it. All preview facts come exclusively from preview_items.',
      } : null,
    },
  }
}

export function chatResponse(requestId, toolCalls = []) {
  return {
    aiMessage: 'Water is ready.', actions: [], operations: null, pendingOperations: null,
    policyDenials: null, correlationId: requestId, relatedSurfaces: null, habitList: null,
    goalList: null, metricsCard: null, periodInsight: null, daySummary: null, streak: null,
    calendar: null, recordLists: null, accountRows: null, followUps: null,
    evalTrace: { traceId: requestId, toolCalls },
  }
}

export const habitBlock = { type: 'block', kind: 'habitList', block: { scope: 'today', items: [
  { id: 'water', title: 'Water', emoji: null, depth: 0, isBadHabit: false, status: 'today' },
], totalCount: 1 } }

export function preview(name = 'Cholesterol exam') {
  return { id: '11111111-1111-4111-8111-111111111111', capabilityId: 'habits.bulk.write', displayName: 'bulk_create_habits',
    summary: 'Create proposed habits', riskClass: 'Low', confirmationRequirement: 'FreshConfirmation', expiresAtUtc: '2026-10-26T20:00:00Z',
    changes: null, changeTargetCount: 1, previewFingerprint: 'preview', actionKey: 'createHabits', items: [{
      itemId: 'exam', entityId: null, entityName: name, stateFingerprint: 'state', removesData: null,
      fields: [
        { entityId: '00000000-0000-0000-0000-000000000000', entityName: name, field: 'due_time', oldValue: null, newValue: '15:50', valueType: 'time', proposedValue: '15:50', isEditable: true },
        { entityId: '00000000-0000-0000-0000-000000000000', entityName: name, field: 'frequency_unit', oldValue: null, newValue: 'OneTime', valueType: 'enum', proposedValue: 'OneTime', isEditable: true },
      ],
    }] }
}

// Contract: orbit-api HabitSuggestionDraft and HabitSuggestionsCard.
export function suggestionDraft(overrides = {}) {
  return { id: '11111111-1111-4111-8111-111111111111', emoji: '📖', title: 'Read', type: 'Habit',
    frequencyUnit: 'Day', frequencyQuantity: 1, days: [], dueDate: '2026-10-26',
    dueTime: '21:00:00', dueEndTime: '21:10:00', reminderMinutesBefore: 5,
    checklistItems: ['Read one page'], reason: 'A small evening routine.', ...overrides }
}

export function suggestionResponse(requestId, locale = 'en') {
  const portuguese = locale === 'pt-BR'
  const introduction = portuguese ? 'Aqui estão sugestões para sua rotina.' : 'Here are suggestions for your routine.'
  const drafts = [suggestionDraft(portuguese ? { title: 'Ler', checklistItems: ['Ler uma página'], reason: 'Um momento de leitura antes de dormir.' } : {}),
    suggestionDraft({ id: '22222222-2222-4222-8222-222222222222', emoji: '🧘',
      title: portuguese ? 'Alongamento' : 'Stretch', dueTime: '21:15:00', dueEndTime: '21:20:00',
      checklistItems: [portuguese ? 'Alongar as pernas' : 'Stretch your legs'],
      reason: portuguese ? 'Soltar o corpo no fim do dia.' : 'Relax at the end of the day.' })]
  const call = toolCall('suggest_habits', { instruction: portuguese ? 'hábitos para a noite' : 'evening habits', language: locale, count: 2 })
  call.result.payload = { language: locale, drafts }
  return { ...chatResponse(requestId, [call]),
    operations: [{ operationId: 'suggest_habits', sourceName: 'suggest_habits', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', summary: null, targetId: null, targetName: null,
      policyReason: null, pendingOperationId: null, payload: { language: locale, drafts } }],
    aiMessage: introduction, parts: [{ type: 'text', text: introduction },
      { type: 'block', kind: 'habitSuggestions', block: { language: locale, drafts } }] }
}
