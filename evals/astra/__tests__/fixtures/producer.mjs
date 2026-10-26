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
    evalTrace: { traceId: requestId, toolCalls, timing: turnTiming() },
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

// Producer fixture: #1754 ProcessUserChatCommandHandlerTests.Timing read turn.
export function turnTiming() {
  const names = ['moderation', 'context_load', 'context_load', 'prompt_build', 'budget', 'budget',
    'model_call', 'budget', 'tool_call', 'budget', 'budget', 'model_call', 'budget', 'save', 'composition', 'other']
  const durations = [1, 2, 0, 3, 11, 0, 13, 0, 7, 11, 0, 13, 0, 5, 0, 0]
  return { totalMilliseconds: 66, phases: names.map((name, index) => ({
    name, milliseconds: durations[index], elapsedMilliseconds: durations[index],
  })) }
}
